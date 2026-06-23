import base64
import io
import json
import os
from pathlib import Path

import requests
from flask import Flask, Response, jsonify, render_template, request, stream_with_context
from PIL import Image

from lib import log
from sse import EVENT_HANDLERS, parse_sse, passthrough

app = Flask(__name__)
DEFAULT_LD_URL = "http://127.0.0.1:8081"

# 初始化日志系统（注册 before_request / after_request 中间件）
log.init_app(app)

# temp 目录用于保存合成过程中的临时文件
TEMP_DIR = Path(__file__).parent / "temp"
TEMP_DIR.mkdir(exist_ok=True)


def _parse_netloc(url: str) -> str:
    """从 URL 中提取 netloc（host:port）。

    不引入 urllib，纯字符串操作；输入非 http(s):// 形式时返回 ""。
    """
    if "://" not in url:
        return ""
    _, _, rest = url.partition("://")
    host_port, _, _ = rest.partition("/")
    return host_port.strip()


def _load_allowed_hosts() -> frozenset[str]:
    """从 LD_ALLOWED_HOSTS 环境变量读取 trusted-host 白名单。

    格式：逗号分隔的 host:port 列表，例如 "127.0.0.1:8081,localhost:8081"。
    空 / 未设置 → 返回空 frozenset，表示不限制（向后兼容）。
    """
    raw = os.environ.get("LD_ALLOWED_HOSTS", "").strip()
    if not raw:
        return frozenset()
    return frozenset(h.strip() for h in raw.split(",") if h.strip())


def resolve_ld_url(override) -> str:
    """解析 Local Dream URL：override 优先，allowlist 校验后回落到 DEFAULT_LD_URL。

    行为：
    - override 为 None / 非字符串 / 空字符串 / 纯空白 → 返回 DEFAULT_LD_URL
    - override 为合法字符串 + allowlist 未配置（env 空）→ 返回 override
    - override 为合法字符串 + allowlist 已配置 + netloc 在白名单 → 返回 override
    - override 为合法字符串 + allowlist 已配置 + netloc 不在白名单 → 回落 DEFAULT_LD_URL

    安全语义：白名单是"未授权后端的隐形拒绝"——不抛错、不返回 403，避免
    攻击者通过错误响应探测后端存在性。前端 UI 应提示用户 override 失效。

    比内联 `or DEFAULT_LD_URL` 更稳健：原写法对非空但非字符串的值（如 0、[]、{}）
    会跳过回落；本函数会识别并安全降级。
    """
    if not isinstance(override, str):
        return DEFAULT_LD_URL
    stripped = override.strip()
    if not stripped:
        return DEFAULT_LD_URL

    allowed = _load_allowed_hosts()
    if not allowed:
        return stripped  # 未配置白名单 = 不限制

    netloc = _parse_netloc(stripped)
    if netloc and netloc in allowed:
        return stripped
    return DEFAULT_LD_URL  # 拒绝：netloc 不在白名单


class HFAutomask:
    """Hugging Face Router 衣物分割适配器。

    封装对 `mattmdjaga/segformer_b2_clothes` 模型的调用。token、endpoint、
    超时都是命名属性；新增模型或换 endpoint 只需继承或修改常量，路由不变。

    后续若要加多模型或多 endpoint，演化为：
      - 子类化（HFAutomaskClothes / HFAutomaskDepth）
      - 或在 __init__ 接收 model 字符串作为参数
    当前只服务一个模型 / endpoint，保持最小抽象。
    """

    ENDPOINT = "https://router.huggingface.co/hf-inference/models/mattmdjaga/segformer_b2_clothes"

    def __init__(self, token: str, timeout: int = 60):
        self._headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "image/png",
        }
        self._timeout = timeout

    def segment(self, png_bytes: bytes) -> dict:
        """提交 PNG 字节，返回分割结果 JSON。抛错由调用方决定如何转 HTTP 错误。"""
        resp = requests.post(
            self.ENDPOINT,
            headers=self._headers,
            data=png_bytes,
            timeout=self._timeout,
        )
        resp.raise_for_status()
        return resp.json()


# Load HF_TOKEN from .env if present (not committed)
_env_path = Path(__file__).parent / ".env"
if _env_path.exists():
    for _line in _env_path.read_text().splitlines():
        if "=" in _line and not _line.startswith("#"):
            _k, _v = _line.strip().split("=", 1)
            os.environ.setdefault(_k.strip(), _v.strip())


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/health")
def health():
    url = resolve_ld_url(request.args.get("url"))
    try:
        requests.get(f"{url}/", timeout=2)
        return jsonify({"ok": True})
    except Exception:
        return jsonify({"ok": False, "error": "Local Dream not reachable"}), 503


@app.route("/automask", methods=["POST"])
def automask():
    body = request.json
    token = body.get("token", "").strip() or os.environ.get("HF_TOKEN", "")
    try:
        result = HFAutomask(token).segment(base64.b64decode(body.get("image", "")))
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 502


@app.route("/tokenize", methods=["POST"])
def tokenize():
    """代理 POST /tokenize → Local Dream 的 /tokenize 端点。

    接受 JSON body：{"prompt": "text"}
    返回 token 计数：{"count": n, "max_length": 77, "overflow_offset": ...}
    """
    url = resolve_ld_url(request.json.get("local_dream_url", None) if request.json else None)
    try:
        body = request.json or {}
        body.pop("local_dream_url", None)
        r = requests.post(f"{url}/tokenize", json=body, timeout=10)
        return jsonify(r.json()), r.status_code
    except requests.exceptions.ConnectionError:
        return jsonify({"error": "Cannot connect to Local Dream"}), 502
    except Exception as e:
        return jsonify({"error": str(e)}), 502


@app.route("/upscale", methods=["POST"])
def upscale():
    """代理 POST /upscale → Local Dream 的 /upscale 端点。

    接受两种输入格式：
    - JSON body: {"image": "base64_png", "width": N, "height": N, "upscaler_path": "...", ...}
    - multipart/form-data: image file + width/height/upscaler_path 表单字段

    转发后返回 JPEG 二进制图片。
    """
    ld_override = (
        request.json.get("local_dream_url", None)
        if request.is_json
        else request.form.get("local_dream_url", None)
    )
    url = resolve_ld_url(ld_override)
    try:
        if request.is_json:
            body = request.json
            img_b64 = body.get("image", "")
            if not img_b64:
                return jsonify({"error": "Missing image"}), 400
            width = int(body.get("width", 512))
            height = int(body.get("height", 512))
            upscaler_path = body.get("upscaler_path", "")
            use_opencl = body.get("use_opencl", False)
            # 解码 base64 PNG → raw RGB 字节
            png_bytes = base64.b64decode(img_b64)
            img = Image.open(io.BytesIO(png_bytes)).convert("RGB")
            img_bytes = img.tobytes()
            width, height = img.size
        else:
            image_file = request.files.get("image")
            if not image_file:
                return jsonify({"error": "Missing image file"}), 400
            img_bytes = image_file.read()
            width = int(request.form.get("width", 512))
            height = int(request.form.get("height", 512))
            upscaler_path = request.form.get("upscaler_path", "")
            use_opencl = request.form.get("use_opencl", "false").lower() in ("true", "1")

        if not upscaler_path:
            return jsonify({"error": "Missing upscaler_path"}), 400

        headers = {
            "X-Image-Width": str(width),
            "X-Image-Height": str(height),
            "X-Upscaler-Path": upscaler_path,
            "X-Use-OpenCL": "true" if use_opencl else "false",
        }
        r = requests.post(f"{url}/upscale", data=img_bytes, headers=headers, timeout=300)

        out_w = r.headers.get("X-Output-Width", str(width * 4))
        out_h = r.headers.get("X-Output-Height", str(height * 4))

        resp = Response(r.content, mimetype=r.headers.get("Content-Type", "image/jpeg"))
        resp.headers["X-Output-Width"] = out_w
        resp.headers["X-Output-Height"] = out_h
        resp.headers["X-Duration-Ms"] = r.headers.get("X-Duration-Ms", "0")
        resp.headers["Access-Control-Expose-Headers"] = (
            "X-Output-Width,X-Output-Height,X-Duration-Ms"
        )
        return resp
    except requests.exceptions.ConnectionError:
        return jsonify({"error": "Cannot connect to Local Dream"}), 502
    except Exception as e:
        return jsonify({"error": str(e)}), 502


@app.route("/save-temp", methods=["POST"])
def save_temp():
    """保存 base64 图片到 temp/ 文件夹（调试用）。"""
    data = request.json
    name = data.get("name", "")
    b64 = data.get("b64", "")
    if not name or not b64:
        return jsonify({"error": "Missing name or b64"}), 400
    try:
        img_bytes = base64.b64decode(b64)
        img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        img.save(TEMP_DIR / f"{name}.png")
        log.log_operation("save-temp", name=name, size=list(img.size))
        return jsonify({"ok": True, "size": list(img.size)})
    except Exception as e:
        log.log_error("save-temp failed", exc_info=e, name=name)
        return jsonify({"error": str(e)}), 500


@app.route("/compose", methods=["POST"])
def compose():
    """服务端合成：将 crop_result 覆盖到 origin 上。

    接收 JSON:
      - origin_b64: 原图 base64 (txt2img 结果)
      - crop_b64: 裁切后的图 base64 (img2img 输入)
      - crop_result_b64: img2img 生成结果 base64
      - pos: {x, y} crop 在 origin 上的左上角坐标
      - crop_size: {w, h} crop_result 缩放目标分辨率

    返回: 合成后的 final.png base64
    """
    data = request.json
    origin_b64 = data.get("origin_b64", "")
    crop_b64 = data.get("crop_b64", "")
    crop_result_b64 = data.get("crop_result_b64", "")
    pos = data.get("pos", {})
    crop_size = data.get("crop_size", {})

    if not origin_b64 or not crop_result_b64:
        return jsonify({"error": "Missing origin_b64 or crop_result_b64"}), 400

    try:
        # 解码图片
        origin_bytes = base64.b64decode(origin_b64)
        crop_result_bytes = base64.b64decode(crop_result_b64)

        origin_img = Image.open(io.BytesIO(origin_bytes)).convert("RGB")
        crop_result_img = Image.open(io.BytesIO(crop_result_bytes)).convert("RGB")

        # 保存临时文件（调试用）
        origin_img.save(TEMP_DIR / "origin.png")
        crop_result_img.save(TEMP_DIR / "crop_result.png")
        if crop_b64:
            crop_bytes = base64.b64decode(crop_b64)
            crop_img = Image.open(io.BytesIO(crop_bytes)).convert("RGB")
            crop_img.save(TEMP_DIR / "crop.png")

        # 缩放 crop_result 到 crop 区域在 origin 上的实际尺寸（以 crop_size 为准）
        target_w = crop_size.get("w", crop_result_img.width)
        target_h = crop_size.get("h", crop_result_img.height)
        if crop_result_img.width != target_w or crop_result_img.height != target_h:
            crop_result_img = crop_result_img.resize((target_w, target_h), Image.Resampling.LANCZOS)

        # 保存 pos.txt 和 size.txt（调试用）
        (TEMP_DIR / "pos.txt").write_text(
            f"x={pos.get('x', 0)}\ny={pos.get('y', 0)}\nw={target_w}\nh={target_h}"
        )
        (TEMP_DIR / "size.txt").write_text(f"w={target_w}\nh={target_h}")
        log.log_operation(
            "compose",
            origin_size=list(origin_img.size),
            crop_size=list(crop_img.size) if crop_b64 else None,
            crop_result_size=list(crop_result_img.size),
            target_size=[target_w, target_h],
            pos={"x": pos.get("x", 0), "y": pos.get("y", 0)},
        )

        # 覆盖到 origin 上
        final_img = origin_img.copy()
        final_img.paste(crop_result_img, (pos.get("x", 0), pos.get("y", 0)))

        # 保存 final.png
        final_img.save(TEMP_DIR / "final.png")

        # 返回 base64
        buf = io.BytesIO()
        final_img.save(buf, format="PNG")
        final_b64 = base64.b64encode(buf.getvalue()).decode("ascii")

        return jsonify({"final_b64": final_b64})
    except Exception as e:
        log.log_error("compose failed", exc_info=e)
        return jsonify({"error": str(e)}), 500


@app.route("/generate", methods=["POST"])
def generate():
    payload = request.json

    def stream():
        ld_url = resolve_ld_url(payload.pop("local_dream_url", None))
        event_count = 0
        try:
            with requests.post(
                f"{ld_url}/generate",
                json=payload,
                stream=True,
                timeout=300,
            ) as r:
                for event in parse_sse(r.iter_lines()):
                    if event.data == "[DONE]":
                        log.log_operation("generate-done", ld_url=ld_url, event_count=event_count)
                        yield "data: [DONE]\n\n"
                        return
                    handler = EVENT_HANDLERS.get(event.type, passthrough)
                    new_data = handler(event.data)
                    if new_data is None:
                        continue
                    event_count += 1
                    data_size = len(new_data)
                    log.log_sse(event.type, data_size, corr_id=log.get_corr_id())
                    if event.type:
                        yield f"event: {event.type}\n"
                    yield f"data: {new_data}\n\n"
        except requests.exceptions.ConnectionError:
            log.log_error("Local Dream connection error", ld_url=ld_url)
            yield (
                "data: "
                + json.dumps(
                    {"type": "error", "error": "Cannot connect to Local Dream. Is it running?"}
                )
                + "\n\n"
            )
        except Exception as e:
            log.log_error("generate stream error", exc_info=e, ld_url=ld_url)
            yield "data: " + json.dumps({"type": "error", "error": str(e)}) + "\n\n"

    return Response(stream_with_context(stream()), mimetype="text/event-stream")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
