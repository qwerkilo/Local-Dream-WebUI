# AGENTS.md — Local Dream WebUI

## 语言偏好

开发者是中文用户。与用户沟通时使用中文。

## 本机环境

1. 操作系统：Windows 11 x64
2. 已安装：uv，bun，nushell（通过 `nu` 命令后使用 `ls`、`grep`、`where` 等）
3. Python 在项目根目录使用 `uv` 创建虚拟环境（`.venv`）
4. 代码查询优先使用 CodeGraph，修改后及时 `codegraph sync` 更新索引
5. 联网搜索先试 `fetch`，效果不佳用 opencli（参考 opencli skill）

## Repo at a glance

- `app.py` — Flask server（8 个路由）+ `resolve_ld_url` / `HFAutomask` / `LD_ALLOWED_HOSTS` allowlist
- `sse.py` — SSE 解析 + 事件类型注册表（`complete` + `progress` 两个 handler）
- `templates/index.html` — 整站前端，纯 HTML/CSS/JS，单文件，**无构建步骤**
- `static/app.js` — 前端主逻辑（从 `index.html` 提取的内联 script，作为独立 module 加载）
- `static/params.js` — 参数表单工厂（`createParamsForm` / `createParamsPayload`）
- `static/sse-client.js` — SSE 客户端协议层（`parse` / `extractPercent` / `events`）
- `lib/log.py` — 结构化 JSON 日志系统（关联 ID、滚动文件、Flask 中间件）
- `tests/` — 93 个 pytest 测试（`test_sse.py` / `test_app.py` / `test_routes.py` / `test_log.py`）
- `tests-js/` — 87 个 bun:test（`params-form.test.js` / `params-payload.test.js` / `sse-client.test.js`）
- `CONTEXT.md` — 领域词汇与接缝状态

## 编码规范

1. **格式化**：使用 Prettier 统一 HTML / CSS / JS 格式：`bun prettier --write .`
2. **Python 质量**：使用 **Ruff**（lint + format）：`uv run ruff check` / `uv run ruff format`
3. **代码注释**：关键逻辑添加中文注释
4. **阿里巴巴规范**：Ruff 已配置 pycodestyle、isort、flake8-bugbear 等规则，运行时自动检查

## 测试

```shell
uv run pytest                # 93 个 Python 测试
uv run pytest -m "not performance"  # 跳过性能测试
uv run pytest --cov          # 含覆盖率报告（sse.py 100%, app.py 87%）
bun test                     # 87 个 JS 测试
```

Mock 策略：`app.requests.post` / `app.requests.get` / `app.requests.head` 全部 mock，不发真实 HTTP。

## 项目关键事实

- **无数据库、无迁移** — 一切在内存或浏览器 sessionStorage
- **`.env` 被 gitignore** — 存放 `HF_TOKEN` 和可选的 `LD_ALLOWED_HOSTS`
- **Local Dream 是外部服务** — 必须在 `127.0.0.1:8081` 运行且已加载模型
- **无前端构建步骤** — 直接修改源文件，刷新浏览器即可
- **启动命令** — `uv run python app.py`，`0.0.0.0:5000`，debug 模式
- **前端 15 个参数字段** — 通过 `params.js` 的 `createParamsForm` 统一管理
- **预设保存** — 15 个字段的子集通过 `PRESET_FIELDS` 白名单控制
- **双主题 + 双语** — CSS class `.theme-original` 切换，`localStorage` 持久化

## API 集成注意事项

- `complete` 事件：LD 返回 raw RGB 字节，`sse.complete_to_png_b64` 转为 PNG base64 存入 `png_image`（删除原 `image`）。如 `format` 为 "jpeg" / "png" 则直接透传
- 调度器字符串：`euler`、`euler_a`、`lcm`、`dpm++2m`、`dpm++2m_sde` — 未知值静默回退默认
- 可选参数只在非默认值时发送：`karras`/`use_opencl` 仅 true 时发，`clip_skip` 仅 >1 时发，`seed` 仅固定时发
- `local_dream_url` 字段（POST body）和 `?url=` 查询参数（health）允许覆盖默认地址，经 `resolve_ld_url` 校验白名单
- `aspect_ratio` 适用于 SDXL 模型："16:9"、"4:3"、"3:2" 等格式
- `output_format` 可选 "jpeg" 或 "png"（LD 侧编码），"raw" 为默认 RGB 字节
- 新事件类型只需在 `sse.EVENT_HANDLERS` 加一条 + 一个 handler 函数
- 前端 `parseSSEChunk` 优先 SSE `event:` 字段，回退 `data.type`

## 新增功能指南

- **后端**：在 `app.py` 加路由 + 在 `sse.py` 加事件 handler（如有需要）。路由简单追加即可
- **前端**：在 `templates/index.html` 加 HTML 控件 + JS 逻辑
- **参数**：新增参数字段需在 `static/params.js` 的 `fields` 表 + `DEFAULT_RULES` + 可选 `PRESET_FIELDS` 三处注册
- **测试**：后端加 `tests/test_*.py`；前端加 `tests-js/*.test.js`
- **运行质量门禁**：`uv run ruff check` → `uv run pytest` → `bun prettier --check .` → `bun test`

## 踩坑记录

### CodeGraph

- 修改文件后运行 `codegraph sync` 更新索引，否则查询返回过时数据
- 没有 `codegraph_context` 这个工具名 — 用 `codegraph_explore` 代替（传符号名或查询字符串）
- 符号名查不到时用 `codegraph_search` 找确切名称，再用 `codegraph_node` / `codegraph_explore` 看代码

### 前端（`static/app.js`）

- **内联→外置时去掉 HTML 包裹**：把 `<script type="module">` 内的代码提取为独立 `.js` 文件后，首行残留 `    <script type="module">` HTML 标签，导致浏览器解析失败（`Unexpected token '<'`）。提取后的文件必须是纯 JS。
- **`!= null` 是标准 JS 习惯用法**：用于同时检查 `null` 和 `undefined`。改成 `!== null && !== undefined` 会降低可读性，不是实质性改进。
- **`originalImgB64` 被覆盖**：`sendToImg2img` 每次都 `originalImgB64 = b64`（上一次输出），多轮迭代后丢失原始上传图。修复：`if (!originalImgB64) originalImgB64 = b64` 仅首次赋值。
- **填充案例 gen 拉伸**：`stitchFullToOriginal` 中 `img2imgPaddingOffset` 路径用 `drawImage(gen, 0, 0, ow, oh)` 把 padded 1024×1024 的 gen 拉伸到 unpadded 尺寸。修复：判断 `gw > origW` 时从 padding 偏移裁剪。
- **修改后运行格式化**：编辑 JS 文件后必须 `bun prettier --write .`，否则 prettier --check 报错。

### 后端（`app.py` / API）

- **aspect_ratio 需要 size=1024**：`aspect_ratio` 是 SDXL 特性，需配合 `size=1024` 使用。如果用户选了比例（如 2:3）但 size 是 512，LD 会忽略比例直接出方形图。修复：`buildWirePayload` 中检测到 `aspect_ratio` 非 none 时强制设 `wire.size = 1024`。
- **img2img 模式下清除 aspect_ratio**：发送到 img2img 时，原图的宽高比（3:4 等）被带到 crop canvas 请求中，LD 用它覆盖 `size=1024`，输出错误分辨率。修复：`buildWirePayload` 在 img2img 分支 `delete wire.aspect_ratio`。
- **compositeInpaint padding 坐标**：padding 分支中原图在 padded canvas 上占用的尺寸是 scaled 尺寸 (`sw=round(origW*sc)`)，而非原始 `origW/origH`。`drawImage` 源矩形、裁剪源尺寸、stitchFullToOriginal 放置坐标都必须用 scaled 尺寸。

<!-- BEGIN BEADS CODEX SETUP -->

## Beads Issue Tracker

Use Beads (`bd`) for durable task tracking. See `beads` skill for workflow guidance.

```bash
bd ready                # 可用任务
bd show <id>            # 查看详情
bd update <id> --claim  # 认领
bd close <id>           # 完成
bd prime                # 刷新 Beads 上下文
```

### Agent 工作流

1. `bd ready` 查可用任务
2. `bd update <id> --claim` 认领
3. 实现 + 测试
4. 发现新工作？`bd create ... --deps discovered-from:<parent-id>`
5. `bd close <id> --reason "Done"` 完成

### Git / Sync

- **Conservative 模式（默认）**：不自动 commit/push，只在 handoff 时报告
- 不要将 `.beads/issues.jsonl` 视为同步协议——Dolt DB 是 data source
<!-- END BEADS CODEX SETUP -->
