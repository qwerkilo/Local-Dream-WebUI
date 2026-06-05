"""SSE 事件类型处理器测试。"""

import base64
import json

from sse import (
    EVENT_HANDLERS,
    complete_to_png_b64,
    parse_sse,
    passthrough,
    progress_handler,
)


# --- parse_sse ---


def test_parse_sse_basic_event():
    """基础事件：event: + data: 各一行。"""
    lines = [
        b"event: progress\n",
        b'data: {"step": 1, "total": 20}\n',
        b"",
    ]
    events = list(parse_sse(lines))
    assert len(events) == 1
    assert events[0] == ("progress", '{"step": 1, "total": 20}')


def test_parse_sse_blank_resets_type():
    """空行重置 type，避免状态泄漏到下一个事件。

    这是当前 SSE 状态机的核心不变量：两个事件之间必须有空白行。
    requests.iter_lines() 对空行返回 b''，故测试用 b'' 模拟。
    """
    lines = [
        b"event: progress\n",
        b'data: {"step":1}\n',
        b"",
        b'data: {"step":2}\n',  # 没有 event: 字段
        b"",
    ]
    events = list(parse_sse(lines))
    assert events[0] == ("progress", '{"step":1}')
    assert events[1] == (None, '{"step":2}')


def test_parse_sse_multi_line_data():
    """多行 data: 按 SSE 规范用 \\n 拼接。"""
    lines = [
        b"data: line1\n",
        b"data: line2\n",
        b"",
    ]
    events = list(parse_sse(lines))
    assert events[0].data == "line1\nline2"


def test_parse_sse_comment_lines_skipped():
    """':' 开头的注释行被跳过。"""
    lines = [
        b": heartbeat\n",
        b"event: progress\n",
        b"data: x\n",
        b"",
    ]
    events = list(parse_sse(lines))
    assert events[0] == ("progress", "x")


def test_parse_sse_done_yields_raw():
    """[DONE] 不被特殊处理——是 route 层面的业务判断。

    parser 应原样产出 data="[DONE]"，由 route 决定是否截断。
    """
    lines = [
        b"data: [DONE]\n",
        b"",
    ]
    events = list(parse_sse(lines))
    assert events[0] == (None, "[DONE]")


def test_parse_sse_no_event_yields_none_type():
    """只有 data 没有 event 字段时，type 为 None。"""
    lines = [
        b"data: hello\n",
        b"",
    ]
    events = list(parse_sse(lines))
    assert events[0] == (None, "hello")


def test_parse_sse_multiple_events_in_order():
    """多事件顺序产出，与输入流顺序一致。"""
    lines = [
        b"event: step\n",
        b'data: {"step":1}\n',
        b"",
        b"event: step\n",
        b'data: {"step":2}\n',
        b"",
        b"event: complete\n",
        b'data: {"image":"x"}\n',
        b"",
    ]
    events = list(parse_sse(lines))
    assert events == [
        ("step", '{"step":1}'),
        ("step", '{"step":2}'),
        ("complete", '{"image":"x"}'),
    ]


# --- complete_to_png_b64 ---


def test_complete_to_png_b64_roundtrip_1x1_white():
    """1x1 白像素：base64 RGB → 合法 PNG。

    b'\\xff\\xff\\xff' = '////' in base64（3 字节整除，无 padding）。
    """
    data = json.dumps({
        "type": "complete",
        "image": "////",
        "width": 1,
        "height": 1,
    })
    result_str = complete_to_png_b64(data)
    result = json.loads(result_str)
    assert "png_image" in result
    assert "image" not in result
    # PNG 文件签名：89 50 4E 47 0D 0A 1A 0A
    png_bytes = base64.b64decode(result["png_image"])
    assert png_bytes[:8] == b"\x89PNG\r\n\x1a\n"


def test_complete_to_png_b64_preserves_dimensions():
    """width/height 字段在转换后保留。"""
    # 64x32 全白 raw RGB：每像素 3 字节，共 6144 字节
    raw = b"\xff" * (64 * 32 * 3)
    data = json.dumps({
        "type": "complete",
        "image": base64.b64encode(raw).decode(),
        "width": 64,
        "height": 32,
    })
    result = json.loads(complete_to_png_b64(data))
    assert result["width"] == 64
    assert result["height"] == 32
    assert result["type"] == "complete"


def test_complete_to_png_b64_removes_image_field():
    """原 image 字段在转换后被删除。"""
    data = json.dumps({
        "type": "complete",
        "image": "////",
        "width": 1,
        "height": 1,
    })
    result = json.loads(complete_to_png_b64(data))
    assert "image" not in result


# --- passthrough ---


def test_passthrough_identity():
    """passthrough 原样返回。"""
    assert passthrough("hello") == "hello"
    assert passthrough("") == ""
    assert passthrough('{"a":1}') == '{"a":1}'


# --- EVENT_HANDLERS ---


def test_registry_dispatches_complete():
    """complete 事件注册到 complete_to_png_b64。"""
    assert EVENT_HANDLERS["complete"] is complete_to_png_b64


def test_registry_falls_back_to_passthrough_for_unknown():
    """未知事件类型走 passthrough（route 用 .get() 兜底）。

    注意：passthrough 不是注册表项——是 route 调用处的默认值。
    """
    assert EVENT_HANDLERS.get("__nope__", passthrough) is passthrough
    # 已知类型仍按注册表解析
    assert EVENT_HANDLERS.get("complete", passthrough) is complete_to_png_b64
    assert EVENT_HANDLERS.get("progress", passthrough) is progress_handler


# --- progress_handler ---


def test_progress_handler_step_total_computes_percent():
    """step + total 字段 → percent 字段。"""
    data = json.dumps({"step": 5, "total": 20})
    result = json.loads(progress_handler(data))
    assert result["step"] == 5
    assert result["total"] == 20
    assert result["percent"] == 25.0


def test_progress_handler_alternate_field_names():
    """max_steps / steps 是 total 的同义字段。"""
    assert json.loads(progress_handler(json.dumps({"step": 1, "max_steps": 4})))["percent"] == 25.0
    assert json.loads(progress_handler(json.dumps({"step": 3, "steps": 4})))["percent"] == 75.0


def test_progress_handler_progress_float_0_to_1():
    """单独的 progress 字段（0.0-1.0 浮点）→ percent。"""
    result = json.loads(progress_handler(json.dumps({"progress": 0.5})))
    assert result["progress"] == 0.5
    assert result["percent"] == 50.0


def test_progress_handler_progress_float_0_to_100():
    """progress 字段已经是 0-100 范围 → 直接作为 percent。"""
    result = json.loads(progress_handler(json.dumps({"progress": 33.0})))
    assert result["percent"] == 33.0


def test_progress_handler_missing_fields_passthrough():
    """字段缺失或不全 → 原样透传，不附 percent。"""
    data = json.dumps({"foo": "bar"})
    result = progress_handler(data)
    assert json.loads(result) == {"foo": "bar"}
    assert "percent" not in result


def test_progress_handler_zero_total_passthrough():
    """total == 0（除零保护）→ 透传。"""
    data = json.dumps({"step": 1, "total": 0})
    result = progress_handler(data)
    assert "percent" not in json.loads(result)


def test_progress_handler_invalid_json_passthrough():
    """非法 JSON 透传，不抛错。"""
    assert progress_handler("{not valid json") == "{not valid json"


def test_progress_handler_non_dict_payload_passthrough():
    """顶层不是对象（list / 字符串）→ 透传。"""
    assert progress_handler("[1, 2, 3]") == "[1, 2, 3]"
    assert progress_handler('"hello"') == '"hello"'
