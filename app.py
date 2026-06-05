import base64
import json
import os

import requests
from flask import Flask, Response, jsonify, render_template, request, stream_with_context

from sse import EVENT_HANDLERS, parse_sse, passthrough

app = Flask(__name__)
DEFAULT_LD_URL = "http://127.0.0.1:8081"


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
_env = os.path.join(os.path.dirname(__file__), ".env")
if os.path.exists(_env):
    with open(_env) as _f:
        for _l in _f:
            if "=" in _l and not _l.startswith("#"):
                _k, _v = _l.strip().split("=", 1)
                os.environ.setdefault(_k.strip(), _v.strip())


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/health")
def health():
    url = resolve_ld_url(request.args.get("url"))
    try:
        r = requests.get(f"{url}/", timeout=2)
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


@app.route("/generate", methods=["POST"])
def generate():
    payload = request.json

    def stream():
        ld_url = resolve_ld_url(payload.pop("local_dream_url", None))
        try:
            with requests.post(
                f"{ld_url}/generate",
                json=payload,
                stream=True,
                timeout=300,
            ) as r:
                for event in parse_sse(r.iter_lines()):
                    if event.data == "[DONE]":
                        yield "data: [DONE]\n\n"
                        return
                    handler = EVENT_HANDLERS.get(event.type, passthrough)
                    new_data = handler(event.data)
                    if new_data is None:
                        continue
                    if event.type:
                        yield f"event: {event.type}\n"
                    yield f"data: {new_data}\n\n"
        except requests.exceptions.ConnectionError:
            yield "data: " + json.dumps({"type": "error", "error": "Cannot connect to Local Dream. Is it running?"}) + "\n\n"
        except Exception as e:
            yield "data: " + json.dumps({"type": "error", "error": str(e)}) + "\n\n"

    return Response(stream_with_context(stream()), mimetype="text/event-stream")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
