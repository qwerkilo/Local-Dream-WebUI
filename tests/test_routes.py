"""Flask route integration tests with mocked Local Dream backend.

覆盖 /generate 与 /health 路由在各种输入下的行为，外部依赖（Local Dream）
通过 unittest.mock 完全替换，不发真实 HTTP。
"""

import base64
import json
import time
from unittest.mock import MagicMock, patch

import pytest

import app as app_module


@pytest.fixture
def client():
    app_module.app.config["TESTING"] = True
    with app_module.app.test_client() as c:
        yield c


def _mock_post_context(lines):
    """构造 `requests.post(..., stream=True)` 的 mock：返回行流。"""
    response = MagicMock()
    response.iter_lines.return_value = lines
    cm = MagicMock()
    cm.__enter__.return_value = response
    cm.__exit__.return_value = False
    return cm


def _parse_sse_data_lines(body: str) -> list[str]:
    """从 SSE 响应 body 中抽出 data: 行（按事件切分）。"""
    events: list[list[str]] = []
    current: list[str] = []
    for line in body.split("\n"):
        if line.startswith("data:"):
            current.append(line[len("data:") :].strip())
        elif line == "" and current:
            events.append(current)
            current = []
    if current:
        events.append(current)
    return events


# --- /generate 集成 ---


def test_generate_complete_event_is_dispatched_with_png(client):
    """Local Dream 返回 complete → SSE 流中含 PNG base64、image 字段被替换。"""
    rgb_b64 = "////"  # 1x1 white
    lines = [
        b"event: complete\n",
        f'data: {{"type":"complete","image":"{rgb_b64}","width":1,"height":1}}\n'.encode(),
        b"",
        b"data: [DONE]\n",
        b"",
    ]
    with patch.object(app_module.requests, "post", return_value=_mock_post_context(lines)):
        response = client.post("/generate", json={"prompt": "x"})
        body = response.get_data(as_text=True)

    assert response.status_code == 200
    assert response.mimetype == "text/event-stream"
    assert "event: complete" in body
    # 找 complete 事件后的 data 行
    data_events = _parse_sse_data_lines(body)
    complete_data = next(
        (json.loads(d) for ev in data_events for d in ev if "png_image" in d),
        None,
    )
    assert complete_data is not None
    assert "image" not in complete_data
    # PNG 签名
    png_bytes = base64.b64decode(complete_data["png_image"])
    assert png_bytes[:8] == b"\x89PNG\r\n\x1a\n"


def test_generate_progress_event_is_enriched_with_percent(client):
    """progress 事件经 progress_handler 处理，附加 percent 字段。

    注意：progress 事件已注册到 EVENT_HANDLERS（参见 sse.py），不是 passthrough。
    端到端验证 wire format 包含 percent。
    """
    lines = [
        b"event: progress\n",
        b'data: {"step": 1, "total": 20}\n',
        b"",
        b"data: [DONE]\n",
        b"",
    ]
    with patch.object(app_module.requests, "post", return_value=_mock_post_context(lines)):
        response = client.post("/generate", json={})
        body = response.get_data(as_text=True)

    assert "event: progress" in body
    # 5% = 1/20*100，应被 progress_handler 附加到 payload
    assert '"percent": 5.0' in body
    assert "png_image" not in body  # 绝不会被 complete handler 处理


def test_generate_done_sentinel_terminates_stream(client):
    """[DONE] 之后路由 return，complete 事件未发出。"""
    lines = [
        b"event: progress\n",
        b'data: {"step": 1}\n',
        b"",
        b"data: [DONE]\n",
        b"",
    ]
    with patch.object(app_module.requests, "post", return_value=_mock_post_context(lines)):
        response = client.post("/generate", json={})
        body = response.get_data(as_text=True)

    assert "data: [DONE]\n\n" in body
    assert "event: complete" not in body
    # 不应有第二个 progress 事件
    assert body.count("event: progress") == 1


def test_generate_connection_error_yields_sse_error_event(client):
    """Local Dream 不可达 → SSE error 事件，状态码仍 200。"""
    from requests.exceptions import ConnectionError

    with patch.object(app_module.requests, "post", side_effect=ConnectionError("nope")):
        response = client.post("/generate", json={})
        body = response.get_data(as_text=True)

    assert response.status_code == 200
    assert '"type": "error"' in body
    assert "Cannot connect to Local Dream" in body


def test_generate_malformed_complete_data_yields_sse_error(client):
    """complete 事件 data 不是合法 JSON → handler 抛错 → SSE error 事件。

    关键不变量：handler 抛错不应让 SSE 流断在半空；error 事件是流结束信号。
    """
    lines = [
        b"event: complete\n",
        b"data: {not valid json\n",
        b"",
        b"data: [DONE]\n",  # 不应被发出，因为 handler 先抛错了
        b"",
    ]
    with patch.object(app_module.requests, "post", return_value=_mock_post_context(lines)):
        response = client.post("/generate", json={})
        body = response.get_data(as_text=True)

    assert "event: complete" not in body
    assert '"type": "error"' in body
    # 错误事件之后流应终止（route 在 except 后 return）
    assert "data: [DONE]\n\n" not in body


def test_generate_uses_payload_local_dream_url(client):
    """payload.local_dream_url 应被作为上游 URL 使用，而非默认。"""
    captured_urls: list[str] = []

    def fake_post(url, **kwargs):
        captured_urls.append(url)
        return _mock_post_context([b"data: [DONE]\n", b""])

    with patch.object(app_module.requests, "post", side_effect=fake_post):
        client.post("/generate", json={"local_dream_url": "http://override:9999"})

    assert captured_urls, "requests.post was never called"
    assert captured_urls[0] == "http://override:9999/generate"


def test_generate_no_override_falls_back_to_default(client):
    """payload 不带 local_dream_url → 使用 DEFAULT_LD_URL。"""
    captured_urls: list[str] = []

    def fake_post(url, **kwargs):
        captured_urls.append(url)
        return _mock_post_context([b"data: [DONE]\n", b""])

    with patch.object(app_module.requests, "post", side_effect=fake_post):
        client.post("/generate", json={"prompt": "x"})

    assert captured_urls
    assert captured_urls[0] == f"{app_module.DEFAULT_LD_URL}/generate"


# --- /health 集成 ---


def test_health_reachable_backend_returns_200_ok(client):
    """Local Dream 可达（GET 任意返回）→ 200 {"ok": true}。"""
    mock_response = MagicMock()
    mock_response.status_code = 200
    with patch.object(app_module.requests, "get", return_value=mock_response):
        response = client.get("/health")

    assert response.status_code == 200
    assert response.get_json() == {"ok": True}


def test_health_unreachable_backend_returns_503(client):
    """Local Dream 不可达 → 503 {"ok": false, "error": "..."}。"""
    with patch.object(app_module.requests, "get", side_effect=Exception("nope")):
        response = client.get("/health")

    assert response.status_code == 503
    body = response.get_json()
    assert body["ok"] is False
    assert "not reachable" in body["error"]


def test_health_uses_url_query_param(client):
    """?url=... 应被透传到 requests.get，而非默认。"""
    captured_urls: list[str] = []

    def fake_get(url, **kwargs):
        captured_urls.append(url)
        return MagicMock()

    with patch.object(app_module.requests, "get", side_effect=fake_get):
        client.get("/health?url=http://custom:1234")

    assert captured_urls
    assert captured_urls[0] == "http://custom:1234/"


def test_health_non_string_url_query_falls_back_to_default(client):
    """?url 值为非字符串（被 resolve_ld_url 安全降级）→ 用默认 URL。

    URL 查询参数实际总是字符串，此测试通过 monkeypatch 模拟异常 payload。
    """
    captured_urls: list[str] = []

    def fake_get(url, **kwargs):
        captured_urls.append(url)
        return MagicMock()

    # 直接调用 resolve_ld_url 验证其行为；通过 monkeypatch 模拟非字符串输入
    # 实际场景中 request.args.get 永远返回字符串，但 resolver 必须稳健
    from app import resolve_ld_url

    assert resolve_ld_url(["list", "not", "url"]) == app_module.DEFAULT_LD_URL
    assert resolve_ld_url(123) == app_module.DEFAULT_LD_URL

    with patch.object(app_module.requests, "get", side_effect=fake_get):
        # request.args 总是字符串，但传空值也应走默认
        client.get("/health?url=")
    assert captured_urls[0] == f"{app_module.DEFAULT_LD_URL}/"


# --- /tokenize 集成 ---


def test_tokenize_forwards_to_ld(client):
    """POST /tokenize 把请求转发到 LD /tokenize 并返回 JSON。"""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"count": 5, "max_length": 77, "overflow_offset": None}
    with patch.object(app_module.requests, "post", return_value=mock_response):
        response = client.post("/tokenize", json={"prompt": "hello"})

    assert response.status_code == 200
    body = response.get_json()
    assert body["count"] == 5
    assert body["max_length"] == 77


def test_tokenize_connection_error(client):
    """LD 不可达 → 502。"""
    with patch.object(app_module.requests, "post", side_effect=Exception("nope")):
        response = client.post("/tokenize", json={"prompt": "x"})

    assert response.status_code == 502
    assert "error" in response.get_json()


# --- /upscale 集成 ---


def test_upscale_missing_image_returns_400(client):
    """无 image 文件 → 400。"""
    response = client.post(
        "/upscale",
        data={
            "width": "512",
            "height": "512",
            "upscaler_path": "/models/x4.mnn",
        },
    )
    assert response.status_code == 400


def test_upscale_missing_upscaler_path_returns_400(client):
    """缺 upscaler_path → 400。"""
    from io import BytesIO

    data = {"image": (BytesIO(b"rgb"), "test.png"), "width": "512", "height": "512"}
    response = client.post("/upscale", data=data)
    assert response.status_code == 400


def test_upscale_connection_error(client):
    """LD 不可达 → 502。"""
    from io import BytesIO

    with patch.object(app_module.requests, "post", side_effect=Exception("nope")):
        response = client.post(
            "/upscale",
            data={
                "image": (BytesIO(b"\xff" * (512 * 512 * 3)), "test.png"),
                "width": "512",
                "height": "512",
                "upscaler_path": "/models/x4.mnn",
            },
        )
    assert response.status_code == 502


def test_upscale_json_body_decodes_png_and_forwards(client):
    """JSON body 含 base64 PNG → 解码并转发到 LD。"""
    import base64
    import io as io_module

    from PIL import Image as PILImage

    # 用 Pillow 创建 1x1 红像素 PNG
    buf = io_module.BytesIO()
    PILImage.new("RGB", (1, 1), (255, 0, 0)).save(buf, format="PNG")
    red_png_b64 = base64.b64encode(buf.getvalue()).decode()
    captured = {}

    def fake_post(url, **kwargs):
        captured["url"] = url
        captured["headers"] = kwargs.get("headers", {})
        captured["data"] = kwargs.get("data")
        mock = MagicMock()
        mock.status_code = 200
        mock.headers = {
            "Content-Type": "image/jpeg",
            "X-Output-Width": "2",
            "X-Output-Height": "2",
            "X-Duration-Ms": "100",
        }
        mock.content = b"\xff\xd8\xff\xe0"
        return mock

    with patch.object(app_module.requests, "post", side_effect=fake_post):
        response = client.post(
            "/upscale",
            json={
                "image": red_png_b64,
                "width": 1,
                "height": 1,
                "upscaler_path": "/models/x4.mnn",
                "use_opencl": False,
            },
        )
    assert response.status_code == 200
    assert captured["url"] == "http://127.0.0.1:8081/upscale"
    # 检查发送的是 raw RGB（PNG 解码后的 1x1 红像素 = 3 字节）
    assert len(captured["data"]) == 3
    assert captured["headers"]["X-Image-Width"] == "1"
    assert captured["headers"]["X-Image-Height"] == "1"
    assert captured["headers"]["X-Upscaler-Path"] == "/models/x4.mnn"
    assert "X-Output-Width" in response.headers


# --- 性能测试 ---


@pytest.mark.performance
def test_parse_sse_handles_1000_events_in_under_100ms():
    """1000 个 progress 事件的 SSE 流应在 100ms 内解析完。

    100ms 是 10x 余量（实测应 < 10ms）。本测试是回归捕捉器，不是 SLA。
    """
    from sse import parse_sse

    lines: list[bytes] = []
    for i in range(1000):
        lines.append(b"event: progress\n")
        lines.append(f'data: {{"step": {i}}}\n'.encode())
        lines.append(b"")
    start = time.perf_counter()
    events = list(parse_sse(lines))
    elapsed_ms = (time.perf_counter() - start) * 1000
    assert len(events) == 1000
    assert elapsed_ms < 100, f"parse_sse took {elapsed_ms:.1f}ms (expected < 100ms)"


@pytest.mark.performance
def test_complete_to_png_b64_512x512_under_50ms():
    """512×512 全白 RGB → PNG 转换应在 50ms 内完成。

    50ms 是 10x 余量（实测应 < 10ms）。Pillow Image.frombytes + PNG 编码。
    """
    from sse import complete_to_png_b64

    raw = b"\xff" * (512 * 512 * 3)
    data = json.dumps(
        {
            "type": "complete",
            "image": base64.b64encode(raw).decode(),
            "width": 512,
            "height": 512,
        }
    )
    start = time.perf_counter()
    result = json.loads(complete_to_png_b64(data))
    elapsed_ms = (time.perf_counter() - start) * 1000
    assert "png_image" in result
    assert elapsed_ms < 50, f"complete_to_png_b64 took {elapsed_ms:.1f}ms (expected < 50ms)"


@pytest.mark.performance
def test_dispatch_throughput_exceeds_1000_events_per_second():
    """完整 dispatch（parse + handler 查表 + handler 调用）应 > 1000 events/s。

    不含 SSE 序列化（那是 I/O，关注点分离）。这是 user-facing dispatch 的核心。
    """
    from sse import EVENT_HANDLERS, parse_sse, passthrough

    lines: list[bytes] = []
    for i in range(1000):
        lines.append(b"event: progress\n")
        lines.append(f'data: {{"step": {i}}}\n'.encode())
        lines.append(b"")
    start = time.perf_counter()
    for event in parse_sse(lines):
        handler = EVENT_HANDLERS.get(event.type, passthrough)
        handler(event.data)
    elapsed = time.perf_counter() - start
    throughput = 1000 / elapsed if elapsed > 0 else float("inf")
    assert throughput > 1000, f"dispatch throughput {throughput:.0f} events/s (expected > 1000)"


@pytest.mark.performance
def test_route_dispatch_end_to_end_under_50ms():
    """端到端 dispatch（mock 后端，200 个 progress 事件）应在 50ms 内完成。

    这是 user-facing 的延迟：从前端 POST 到所有事件 yield 完毕。
    """
    lines: list[bytes] = []
    for i in range(200):
        lines.append(b"event: progress\n")
        lines.append(f'data: {{"step": {i}}}\n'.encode())
        lines.append(b"")
    lines.extend([b"data: [DONE]\n", b""])
    with patch.object(app_module.requests, "post", return_value=_mock_post_context(lines)):
        start = time.perf_counter()
        response = app_module.app.test_client().post("/generate", json={})
        body = response.get_data(as_text=True)
        elapsed_ms = (time.perf_counter() - start) * 1000
    assert response.status_code == 200
    assert "data: [DONE]\n\n" in body
    assert elapsed_ms < 50, f"end-to-end dispatch took {elapsed_ms:.1f}ms (expected < 50ms)"
