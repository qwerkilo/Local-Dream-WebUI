# Local Dream WebUI

面向 [Local Dream](https://github.com/xororz/local-dream)（Android 上的 Stable Diffusion 应用，支持骁龙 NPU 加速）的 Web 界面。通过 Flask 代理转发，单文件前端，无需构建步骤。

## 功能特性

- **文生图 / 图生图 / 局部重绘**，含遮罩编辑器
- **自动遮罩** — 基于 Hugging Face 的衣物分割
- **SDXL 宽高比**控制（16:9、4:3、3:2 等）
- **输出格式**选择（原始 RGB / JPEG / PNG）
- **预览格式**和进度显示步长配置
- **放大模型预设** — 动漫（Real-ESRGAN）/ 真实（UltraSharp）
- **发送到图生图** — 一键复用生成图像和参数
- **实时进度**流式展示，支持每步预览
- **Token 计数**实时显示
- **参数预设**，保存在浏览器 localStorage
- **双主题** — Apple 浅色 / Original 深色
- **双语** — 英文 / 中文

## 快速启动

```bash
# 安装依赖
uv sync

# 启动服务
uv run python app.py
```

浏览器打开 http://localhost:5000。Local Dream 需在 `127.0.0.1:8081` 运行（可在界面中配置）。

## 架构

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│  浏览器       │────▶│  Flask 代理   │────▶│  Local Dream     │
│  (index.html)│     │  (app.py)     │     │  (Android HTTP)  │
│              │◀────│  SSE 流       │◀────│  /generate       │
│              │     │  (sse.py)     │     │  /tokenize       │
│              │     │               │     │  /upscale        │
└──────────────┘     └──────────────┘     └──────────────────┘
```

### 后端 (app.py)

Flask 服务器，共 8 个路由：

| 路由         | 方法 | 说明                       |
| ------------ | ---- | -------------------------- |
| `/`          | GET  | 渲染前端页面               |
| `/health`    | GET  | 探测 Local Dream 可达性    |
| `/automask`  | POST | Hugging Face 衣物分割      |
| `/tokenize`  | POST | 查询 prompt token 计数     |
| `/upscale`   | POST | 图片无损放大               |
| `/save-temp` | POST | 保存图片用于重绘合成       |
| `/compose`   | POST | 将重绘结果合成回原图       |
| `/generate`  | POST | 代理生成请求，SSE 流式返回 |

SSE 事件流由 `sse.py` 处理 —— raw RGB 字节转 PNG base64，progress 事件附加百分比。

工具模块：

- `lib/log.py` — 结构化 JSON 日志，带关联 ID 和滚动文件处理器

### 前端 (templates/index.html)

单文件纯 HTML/CSS/JS。无框架，无构建步骤。15 个参数字段，图片上传+裁剪模态框，遮罩编辑器，自动遮罩叠加，参数预设，放大模型预设，双主题，双语。

可复用模块位于 `/static/`：

- `params.js` — `createParamsForm()`: DOM ↔ 字段值双向绑定；`createParamsPayload()`: 字段 → 网络请求载荷
- `sse-client.js` — `parse()`、`extractPercent()`、`events()`: SSE 协议层

## 命令

```bash
uv run python app.py            # 启动服务 (http://0.0.0.0:5000)

# 测试
uv run pytest                   # 93 个 Python 测试（约 1 秒）
uv run pytest -m "not performance"  # 跳过性能测试
uv run pytest --cov             # 含覆盖率报告
bun test                        # 87 个 JS 测试（约 80 毫秒）

# 代码质量
uv run ruff check               # lint 所有 Python 文件
uv run ruff format              # 格式化所有 Python 文件
bun prettier --write .          # 格式化 HTML / CSS / JS
```

## 测试覆盖率

| 模块            | 覆盖率 | 测试数                             |
| --------------- | ------ | ---------------------------------- |
| `sse.py`        | 100%   | 24 Python                          |
| `app.py`        | 87%    | 69 Python                          |
| `params.js`     | —      | 56 JS                              |
| `sse-client.js` | —      | 17 JS                              |
| **总计**        | **—**  | **93 Python + 87 JS = 180 个测试** |

## 可信后端白名单

设置 `LD_ALLOWED_HOSTS` 环境变量以限制允许的 Local Dream URL：

```bash
export LD_ALLOWED_HOSTS="127.0.0.1:8081,192.168.1.100:8081"
```

配置后，不在白名单的 URL 将静默回落为默认值 —— 不返回错误（安全考虑）。

## 隐私声明

- 所有生成在本地运行 —— 数据不离开你的网络
- 自动遮罩使用 Hugging Face 的托管推理 API（需要 HF_TOKEN）
- 无遥测、无分析、无外部请求（LD 和 Hugging Face 除外）

## 已知问题 / 修复

- **遮罩笔刷不透明** — 遮罩编辑器的笔刷改为完全不透明白色（`#ffffff`），替代之前的 95% 不透明度。旧版产生的遮罩值约为 242/255，导致重绘区域仅应用了 95% 的生成图。
- **重绘 padding 坐标对齐** — `compositeInpaint` 和 `stitchFullToOriginal` 的 padding 分支中存在三个坐标 bug：原图 unpadded 尺寸（`origW/origH`）被错误用于 scaled canvas 的 drawImage 源矩形和放置坐标。修复：padding 分支全部改用缩放后的尺寸（`sw/sh`）。
- **宽高比污染图生图** — 发送到 img2img 时，原图的 `aspect_ratio`（如 "3:4"）被带到 crop canvas 的请求中，导致 LD 输出错误分辨率。修复：`buildWirePayload` 在 img2img 模式下 `delete wire.aspect_ratio`。
- **crop_result 分辨率不匹配** — LD 返回 768×1024 而非 1024×1024，原因同上（aspect_ratio 覆盖 size）。修复同上。

## 致谢

- [Local Dream](https://github.com/xororz/local-dream) — 本项目代理的 Android 应用
- [Hugging Face](https://huggingface.co/) — 衣物分割的托管推理服务
