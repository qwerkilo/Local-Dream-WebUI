# CONTEXT.md — Local Dream WebUI 领域词汇

## 后端服务

**Local Dream** — Stable Diffusion 后端服务，运行在 `127.0.0.1:8081`（可由前端 `localStorage.localDreamUrl` 覆盖；后端通过 `app.resolve_ld_url()` 解析）。本项目是它的薄层 Web UI 代理。生成接口为 SSE 流式。

**HF Router (Automask)** — Hugging Face Inference API，用于上传图片时生成衣物分割蒙版（`mattmdjaga/segformer_b2_clothes` 模型）。由 `app.HFAutomask` 适配器封装调用，token 优先取请求 body，回落 `HF_TOKEN` 环境变量。

## 路由（`app.py`）

4 条 Flask 路由：

- `GET /` — 渲染 `templates/index.html`
- `GET /health` — 探测 Local Dream 可达性，返回 `{"ok": true}` 或 503。URL 通过 `?url=` 传入
- `POST /automask` — 调用 HF Automask 适配器，返回分割 JSON；HF 失败时返回 502
- `POST /generate` — SSE 透传到 Local Dream；按 `EVENT_HANDLERS` 派发事件类型，最终输出 `png_image`

## 关键函数

**`resolve_ld_url(override) -> str`** — URL 解析单点入口。

- 非字符串 / 空 / 纯空白 → 回落到 `DEFAULT_LD_URL`
- 启用了 `LD_ALLOWED_HOSTS` 白名单时，提取 netloc 并校验；不在白名单 → 静默回落默认
- 未启用白名单 → 原样返回 override（向后兼容）

**`_parse_netloc(url) -> str`** — 从 `http(s)://host:port/path?q=1` 提取 `host:port`，无 `://` 前缀返回 `""`。

**`_load_allowed_hosts() -> frozenset[str]`** — 从 `LD_ALLOWED_HOSTS` 环境变量（逗号分隔）读取 trusted-host 列表；空 / 未设置返回空 frozenset（不限制）。

**`HFAutomask(token, timeout=60)`** — HF Automask 适配器。`ENDPOINT` 常量指向 segformer_b2_clothes；`segment(png_bytes) -> dict` 调用并 `raise_for_status()`。

## SSE 事件（`sse.py`）

**SSE event** — `parse_sse()` 解析后的 `(type, data)` 命名元组。`type` 为事件类型字符串（无 `event:` 字段时为 `None`），`data` 是累积的 data 行拼接字符串（多行用 `\n`）。

**Event handler** — `(str) -> str | None`，对一条 event 的 data 做转换（返回新 data_str）或透传（`passthrough`）。返回 `None` 表示丢弃该事件。

**Event handler registry** — `EVENT_HANDLERS` 字典（`sse.py`），按事件类型查表得到 handler。未知类型由 route 用 `passthrough` 兜底，**不是**注册表项。

**`[DONE]` 哨兵** — OpenAI 风格的流结束标记。SSE parser 不做特殊处理；route 在拿到 `event.data == "[DONE]"` 时 yield 终止事件并 return。

**`ConnectionError`** — Local Dream 不可达时抛出。归 route 处理（被 try/except 转为 SSE error 事件），不属于 sse.py 的职责。

## 已注册事件类型

- **`complete`** — `complete_to_png_b64` 把 base64 RGB 字节转 PNG，输出字段名 `png_image`，删除原 `image` 字段。width/height 保留。
- **`progress`** — `progress_handler` 防御性识别字段：
  - `step` + `total` / `max_steps` / `steps` → 附 `percent = round(step/total*100, 1)`
  - 单独 `progress` 浮点（0.0-1.0 或 0-100）→ 附 `percent`
  - 字段缺失 / 非法 JSON / 非对象 → 原样透传

## 测试

62 个 pytest 测试（`tests/test_sse.py` / `test_app.py` / `test_routes.py`），`uv run pytest` 跑全套；`uv run pytest -m "not performance"` 跳过 4 个 perf 测试。mock `app.requests.post` / `app.requests.get` 不发真实 HTTP。

## 前端 SSE 消费契约

`templates/index.html` 的 `parseSSEChunk` 解析 SSE 流，dispatch 顺序：

1. 优先 SSE `event:` 字段（来自后端 `EVENT_HANDLERS` 注册的类型）
2. 回退到 JSON `data.type` 字段（兼容旧版 LD 把类型塞在 JSON 里）

百分比计算优先 `data.percent`（后端已算好），回落 `step / total`（字段名兼容 total / total_steps / max_steps / steps）。

## 已知接缝状态

下列架构审查候选已完成，不再建议深化同一位置：

- **`sse.py` 解析器 + EVENT_HANDLERS 注册表** — 已深化。新增事件类型只需注册 handler。
- **`resolve_ld_url`** — 已深化，含 `LD_ALLOWED_HOSTS` 白名单。
- **`HFAutomask` 适配器** — 已抽取（候选 3）。新增模型只需改 `ENDPOINT` 常量。

## 远端 Dolt 基础设施（不可手动改）

项目把 Dolt 远端配置成 `git+https://github.com/qwerkilo/Local-Dream-WebUI`，因此 GitHub 远端仓会多出两个 Dolt 管理的 ref：

- `refs/dolt/data` — Dolt 实际数据（issues / 历史 / metadata），由 `bd dolt push` 维护
- `refs/heads/__dolt_remote_info__` — Dolt 标记分支（仅一个 `DOLT_REMOTE.md` 文件，告知 Dolt 客户端数据所在 ref）

`__dolt_remote_info__` 分支对代码、CI、PR 零影响（独立分支、不被 checkout），但**不要手动删除**：

- 删了下次 `bd dolt push` 会重建
- 没它其他 Dolt 客户端会找不到 Dolt 数据位置
- 这是 Dolt 用 git+https 作存储时的协议一部分

如果 GitHub 上看到陌生分支，这是 Dolt 的标准行为，不是泄漏。`bd dolt push` / `bd dolt pull` 是与远端 Dolt 状态同步的正确方式。
