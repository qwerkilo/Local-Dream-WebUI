"""SSE 事件类型处理器：解析 Server-Sent Events 流并按事件类型派发到对应 handler。

本模块是 /generate 路由的接缝：
- parse_sse 是纯解析器，遵循 SSE 规范（W3C / WHATWG）
- EVENT_HANDLERS 注册表按事件类型查表得到 handler
- 新增事件类型（如 progress）只需在注册表加一条

[DONE] 哨兵和 ConnectionError 不在本模块的职责内——由 route 层处理。
"""

import base64
import io
import json
from collections import namedtuple
from typing import Callable, Iterable, Iterator

from PIL import Image


# 解析后的 SSE 事件
# type 字段可能为 None（无 event: 行时，SSE 默认值）
# data 字段为原始字符串（多行 data 用 \n 拼接，符合 SSE 规范）
Event = namedtuple("Event", ["type", "data"])


def parse_sse(lines: Iterable[bytes]) -> Iterator[Event]:
    """将 SSE 原始行流解析为 Event 序列。

    行为遵循 SSE 规范：
    - 空行触发事件派发，并重置 type
    - ':' 开头为注释，跳过
    - 'event:' 设置事件类型
    - 'data:' 累积数据；多行 data 用 '\\n' 拼接
    - 其它字段（id: / retry: 等）暂不处理
    - 不特殊处理 [DONE] 哨兵——由调用方按业务判断
    """
    event_type: str | None = None
    data_parts: list[str] = []

    for raw in lines:
        if not raw:
            # 空行：派发累积的事件
            if data_parts:
                yield Event(event_type, "\n".join(data_parts))
            event_type = None
            data_parts = []
            continue

        line = raw.decode("utf-8", errors="replace")
        if line.startswith(":"):
            # 注释行
            continue
        if line.startswith("event:"):
            event_type = line[len("event:"):].strip()
        elif line.startswith("data:"):
            data_parts.append(line[len("data:"):].strip())


def passthrough(data: str) -> str:
    """默认 handler：原样返回 data。"""
    return data


def complete_to_png_b64(data: str) -> str:
    """complete 事件 handler：将 base64 RGB 字节转 PNG 并替换 image 字段。

    Local Dream 的 'complete' 事件以 raw RGB 字节（不是 PNG）传输图像，
    浏览器无法直接显示——必须先转 PNG。前端依赖字段名 png_image，
    同时删除原 image 字段以避免数据冗余。
    """
    payload = json.loads(data)
    raw = base64.b64decode(payload["image"])
    img = Image.frombytes("RGB", (payload["width"], payload["height"]), raw)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    payload["png_image"] = base64.b64encode(buf.getvalue()).decode()
    del payload["image"]
    return json.dumps(payload)


def progress_handler(data: str) -> str:
    """progress 事件 handler：识别常见字段并附加 percent。

    本地 Dream 的 progress 事件 wire format 未确认（待上游契约明确）。
    本 handler 防御性处理：识别多种可能的字段命名（step/total、step/max_steps、
    step/steps、或直接的 progress 浮点），能算 percent 就附上；算不出就原样透传，
    不让 progress 事件因字段差异而被丢弃。

    字段约定（按优先级）：
    - step + total / max_steps / steps（int）→ percent = round(step/total*100, 1)
    - 单独的 progress 字段（0.0-1.0） → percent = round(progress*100, 1)
    - 其他 → 透传，不报错
    """
    try:
        payload = json.loads(data)
    except json.JSONDecodeError:
        return data  # 损坏数据透传，让上游处理

    if not isinstance(payload, dict):
        return data  # 非对象透传

    step = payload.get("step")
    total = (
        payload.get("total")
        or payload.get("max_steps")
        or payload.get("steps")
    )

    percent: float | None = None
    if isinstance(step, (int, float)) and isinstance(total, (int, float)) and total > 0:
        percent = round(step / total * 100, 1)
    elif isinstance(payload.get("progress"), (int, float)):
        p = float(payload["progress"])
        if 0.0 <= p <= 1.0:
            percent = round(p * 100, 1)
        elif 0.0 <= p <= 100.0:
            percent = round(p, 1)

    if percent is not None:
        payload["percent"] = percent
        return json.dumps(payload)
    return data  # 字段不全时透传


# 事件类型 → handler 映射
# 未来新增事件类型（如 intermediate preview）只需在此注册
EVENT_HANDLERS: dict[str, Callable[[str], str | None]] = {
    "complete": complete_to_png_b64,
    "progress": progress_handler,
}
