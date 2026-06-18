"""Local Dream URL 解析器与 HF Automask 适配器测试。"""

import base64
from unittest.mock import MagicMock, patch

import pytest

from app import DEFAULT_LD_URL, HFAutomask, resolve_ld_url

# --- fallback behavior ---


def test_resolve_none_returns_default():
    """override 为 None 时回落到 DEFAULT_LD_URL。"""
    assert resolve_ld_url(None) == DEFAULT_LD_URL


def test_resolve_empty_string_returns_default():
    """override 为空字符串时回落到 DEFAULT_LD_URL。"""
    assert resolve_ld_url("") == DEFAULT_LD_URL


def test_resolve_whitespace_only_returns_default():
    """override 仅为空白字符时回落到 DEFAULT_LD_URL。"""
    assert resolve_ld_url("   ") == DEFAULT_LD_URL
    assert resolve_ld_url("\t\n") == DEFAULT_LD_URL


def test_resolve_non_string_returns_default():
    """override 为非字符串类型（int / list / dict）时安全降级到 DEFAULT_LD_URL。

    原内联写法 `override or DEFAULT_LD_URL` 对这些值会跳过回落——本函数修复。
    """
    assert resolve_ld_url(0) == DEFAULT_LD_URL
    assert resolve_ld_url(8081) == DEFAULT_LD_URL
    assert resolve_ld_url([]) == DEFAULT_LD_URL
    assert resolve_ld_url({}) == DEFAULT_LD_URL
    assert resolve_ld_url(override=False) == DEFAULT_LD_URL


# --- pass-through behavior ---


def test_resolve_valid_url_returned_as_is():
    """override 为合法 URL 字符串时原样返回。"""
    assert resolve_ld_url("http://10.110.67.243:8081") == "http://10.110.67.243:8081"
    assert resolve_ld_url("http://localhost:8081/") == "http://localhost:8081/"


def test_resolve_strips_surrounding_whitespace():
    """override 字符串首尾的空白被剥离。"""
    assert resolve_ld_url("  http://10.110.67.243:8081  ") == "http://10.110.67.243:8081"
    assert resolve_ld_url("\thttp://x\n") == "http://x"


# --- default respect ---


def test_resolve_falls_back_to_module_default(monkeypatch):
    """回落值取的是模块级 DEFAULT_LD_URL 当前值。

    用 monkeypatch 改 DEFAULT_LD_URL，验证函数读取的是当前模块状态，
    未来加白名单/多主机时只需在函数内一处读取配置即可生效。
    """
    monkeypatch.setattr("app.DEFAULT_LD_URL", "http://test-host:9999")
    assert resolve_ld_url(None) == "http://test-host:9999"
    assert resolve_ld_url("") == "http://test-host:9999"
    assert resolve_ld_url(0) == "http://test-host:9999"


# --- trusted-host 白名单 ---


def test_resolve_no_allowlist_allows_any_override(monkeypatch):
    """LD_ALLOWED_HOSTS 未设置时（向后兼容）→ override 原样通过。"""
    monkeypatch.delenv("LD_ALLOWED_HOSTS", raising=False)
    assert resolve_ld_url("http://anything:1234") == "http://anything:1234"
    assert resolve_ld_url("http://evil.com:8081") == "http://evil.com:8081"


def test_resolve_empty_allowlist_allows_any_override(monkeypatch):
    """LD_ALLOWED_HOSTS 是空字符串 → 等同未配置，override 原样通过。"""
    monkeypatch.setenv("LD_ALLOWED_HOSTS", "")
    assert resolve_ld_url("http://anything:1234") == "http://anything:1234"


def test_resolve_allowlist_permits_listed_host(monkeypatch):
    """白名单中包含的 netloc → override 通过。"""
    monkeypatch.setenv("LD_ALLOWED_HOSTS", "127.0.0.1:8081,localhost:8081")
    assert resolve_ld_url("http://127.0.0.1:8081") == "http://127.0.0.1:8081"
    assert resolve_ld_url("http://localhost:8081") == "http://localhost:8081"


def test_resolve_allowlist_rejects_unlisted_host_silently(monkeypatch):
    """白名单中不含的 netloc → 静默回落 DEFAULT_LD_URL（不抛错、不 403）。

    安全语义：避免攻击者通过错误响应探测后端存在性。
    """
    monkeypatch.setenv("LD_ALLOWED_HOSTS", "127.0.0.1:8081")
    from app import DEFAULT_LD_URL

    assert resolve_ld_url("http://evil.com:8081") == DEFAULT_LD_URL
    assert resolve_ld_url("http://10.0.0.1:8081") == DEFAULT_LD_URL


def test_resolve_allowlist_strips_url_path_query(monkeypatch):
    """URL 路径 / query 不会影响 netloc 匹配。"""
    monkeypatch.setenv("LD_ALLOWED_HOSTS", "127.0.0.1:8081")
    assert (
        resolve_ld_url("http://127.0.0.1:8081/some/path?q=1")
        == "http://127.0.0.1:8081/some/path?q=1"
    )


def test_resolve_allowlist_rejects_url_without_netloc(monkeypatch):
    """无法提取 netloc 的字符串（无 :// 前缀）→ 视为未通过白名单，回落。"""
    monkeypatch.setenv("LD_ALLOWED_HOSTS", "127.0.0.1:8081")
    from app import DEFAULT_LD_URL

    assert resolve_ld_url("not-a-url") == DEFAULT_LD_URL
    assert resolve_ld_url("127.0.0.1:8081") == DEFAULT_LD_URL  # 缺 scheme


def test_resolve_allowlist_matches_netloc_only_not_scheme(monkeypatch):
    """白名单按 netloc 匹配，scheme 不被校验。

    设计选择：ftp://127.0.0.1:8081 也会通过（netloc 在白名单）。
    本项目只用 HTTP 请求，攻击者拿到 URL 也无法利用。如未来要加 scheme 校验，
    在 _parse_netloc 后多一个 scheme check 即可。
    """
    monkeypatch.setenv("LD_ALLOWED_HOSTS", "127.0.0.1:8081")
    assert resolve_ld_url("ftp://127.0.0.1:8081") == "ftp://127.0.0.1:8081"


def test_resolve_allowlist_with_whitespace(monkeypatch):
    """白名单字符串中允许任意空白（strip 处理）。"""
    monkeypatch.setenv("LD_ALLOWED_HOSTS", "  127.0.0.1:8081 , localhost:8081  ")
    assert resolve_ld_url("http://localhost:8081") == "http://localhost:8081"


# --- HFAutomask 适配器 ---


def _mock_hf_response(status_code: int, json_payload: dict | None = None, text: str = ""):
    """构造 requests.post 返回的 mock 响应。"""
    resp = MagicMock()
    resp.status_code = status_code
    resp.raise_for_status = MagicMock()
    if status_code >= 400:
        resp.raise_for_status.side_effect = Exception(f"HTTP {status_code}")
        resp.text = text
    else:
        resp.json.return_value = json_payload or {}
    return resp


def test_hf_automask_segment_returns_parsed_json():
    """成功响应：返回 json() 的结果。"""
    with patch(
        "app.requests.post", return_value=_mock_hf_response(200, {"mask": [0, 1, 0]})
    ) as mock_post:
        result = HFAutomask("tok").segment(b"png-bytes")
    assert result == {"mask": [0, 1, 0]}
    # 验证端点、请求头、data 都对
    call = mock_post.call_args
    assert call.args[0] == HFAutomask.ENDPOINT
    assert call.kwargs["headers"]["Authorization"] == "Bearer tok"
    assert call.kwargs["headers"]["Content-Type"] == "image/png"
    assert call.kwargs["data"] == b"png-bytes"
    assert call.kwargs["timeout"] == 60


def test_hf_automask_custom_timeout_passed_through():
    """自定义 timeout 透传到 requests.post。"""
    with patch("app.requests.post", return_value=_mock_hf_response(200, {})) as mock_post:
        HFAutomask("tok", timeout=120).segment(b"x")
    assert mock_post.call_args.kwargs["timeout"] == 120


def test_hf_automask_non_2xx_raises():
    """非 2xx 响应：raise_for_status 抛错，调用方处理。"""
    with (
        patch("app.requests.post", return_value=_mock_hf_response(503, text="service down")),
        pytest.raises(Exception, match="503"),
    ):
        HFAutomask("tok").segment(b"x")


def test_hf_automask_endpoint_constant_is_the_clothes_model():
    """端点常量指向 segformer_b2_clothes 模型（防止误改）。"""
    assert "mattmdjaga/segformer_b2_clothes" in HFAutomask.ENDPOINT
    assert HFAutomask.ENDPOINT.startswith("https://router.huggingface.co/")


def test_automask_route_returns_segmentation_result_on_success():
    """/automask 成功路径：调用 adapter 并返回结果。"""
    from app import app as flask_app

    with patch("app.requests.post", return_value=_mock_hf_response(200, {"mask": [1, 0, 1]})):
        client = flask_app.test_client()
        response = client.post(
            "/automask",
            json={"image": "aGVsbG8="},  # base64 of "hello"
        )
    assert response.status_code == 200
    assert response.get_json() == {"mask": [1, 0, 1]}


def test_automask_route_returns_502_on_adapter_error():
    """/automask adapter 抛错时返回 502 + error 信息。"""
    from app import app as flask_app

    with patch("app.requests.post", return_value=_mock_hf_response(401, text="unauthorized")):
        client = flask_app.test_client()
        response = client.post("/automask", json={"image": "aGVsbG8="})
    assert response.status_code == 502
    body = response.get_json()
    assert "error" in body
    assert "401" in body["error"] or "unauthorized" in body["error"].lower()


def test_automask_route_body_token_takes_precedence_over_env(monkeypatch):
    """body.token 非空时优先使用 body 的 token，env HF_TOKEN 被忽略。"""
    monkeypatch.setenv("HF_TOKEN", "env-token-should-not-be-used")
    from app import app as flask_app

    with patch(
        "app.requests.post", return_value=_mock_hf_response(200, {"mask": [0]})
    ) as mock_post:
        client = flask_app.test_client()
        response = client.post(
            "/automask",
            json={"image": "aGVsbG8=", "token": "body-token-wins"},
        )
    assert response.status_code == 200
    sent_auth = mock_post.call_args.kwargs["headers"]["Authorization"]
    assert sent_auth == "Bearer body-token-wins"


def test_automask_route_falls_back_to_env_token(monkeypatch):
    """body 无 token 时回落 env HF_TOKEN。"""
    monkeypatch.setenv("HF_TOKEN", "env-token-fallback")
    from app import app as flask_app

    with patch(
        "app.requests.post", return_value=_mock_hf_response(200, {"mask": [0]})
    ) as mock_post:
        client = flask_app.test_client()
        response = client.post("/automask", json={"image": "aGVsbG8="})  # 无 token 字段
    assert response.status_code == 200
    sent_auth = mock_post.call_args.kwargs["headers"]["Authorization"]
    assert sent_auth == "Bearer env-token-fallback"


def test_automask_route_no_token_uses_empty_bearer(monkeypatch):
    """body 无 token 且 env 未设时，Authorization 仍为 "Bearer "（空 token）。

    本测试锁定现有行为：不会跳过 HF 调用也不会 fallback 到 anon，避免静默改语义。
    未来若要"无 token 拒绝"或"anon 调用"，在此测试处显式更新契约。
    """
    monkeypatch.delenv("HF_TOKEN", raising=False)
    from app import app as flask_app

    with patch(
        "app.requests.post", return_value=_mock_hf_response(200, {"mask": [0]})
    ) as mock_post:
        client = flask_app.test_client()
        response = client.post("/automask", json={"image": "aGVsbG8="})
    assert response.status_code == 200
    sent_auth = mock_post.call_args.kwargs["headers"]["Authorization"]
    assert sent_auth == "Bearer "


def test_automask_route_sends_png_bytes_and_headers(monkeypatch):
    """验证发往 HF 的请求：headers、data、endpoint、timeout 全部对。"""
    monkeypatch.setenv("HF_TOKEN", "tok")
    from app import app as flask_app

    realistic_b64 = base64.b64encode(
        b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
    ).decode()  # 伪 PNG 头 + 数据
    with patch(
        "app.requests.post", return_value=_mock_hf_response(200, {"mask": [0, 1, 0, 1]})
    ) as mock_post:
        client = flask_app.test_client()
        response = client.post("/automask", json={"image": realistic_b64})
    assert response.status_code == 200
    assert response.get_json() == {"mask": [0, 1, 0, 1]}
    call = mock_post.call_args
    assert call.args[0] == HFAutomask.ENDPOINT
    assert call.kwargs["headers"]["Authorization"] == "Bearer tok"
    assert call.kwargs["headers"]["Content-Type"] == "image/png"
    # 发出的 data 应是解码后的 PNG 字节
    assert call.kwargs["data"] == b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
    assert call.kwargs["timeout"] == 60


def test_automask_route_whitespace_token_falls_back_to_env(monkeypatch):
    """body.token 是纯空白 → 视为空，回落 env。"""
    monkeypatch.setenv("HF_TOKEN", "env-tok")
    from app import app as flask_app

    with patch(
        "app.requests.post", return_value=_mock_hf_response(200, {"mask": [0]})
    ) as mock_post:
        client = flask_app.test_client()
        response = client.post(
            "/automask",
            json={"image": "aGVsbG8=", "token": "   "},
        )
    assert response.status_code == 200
    sent_auth = mock_post.call_args.kwargs["headers"]["Authorization"]
    assert sent_auth == "Bearer env-tok"
