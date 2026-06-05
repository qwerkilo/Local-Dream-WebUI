# Local Dream WebUI

[Local Dream](https://github.com/xororz/local-dream) Android 应用 HTTP API 的 Flask 网页界面。 [English](README.md)

## 功能

- **文生图** — 从文本提示词生成图像
- **图生图** — 从输入图像 + 提示词生成
- **局部重绘** — 在输入图像上绘制蒙版，指定要重新绘制的区域
- **自动蒙版** — 通过 HuggingFace 一键衣物/人体分割；选择区域自动生成蒙版
- **全分辨率重绘合成** — 生成内容以原始分辨率合成回原图，而非 512px 裁剪
- **裁剪/定位** — 拖拽和双指缩放图像以适配画布；空白区域自动外绘
- **实时进度** — SSE 流式显示逐步生成进度
- **尺寸选项** — 256、384、512、640、768、1024 或自定义（最高 2048）
- **详情面板** — 显示步数、CFG、尺寸、种子、调度器和生成耗时
- **会话持久化** — 上传的图像、蒙版和裁剪区域在页面刷新后保留（关闭标签页后清除）
- **多语言** — 支持中文和英文界面，顶部导航栏一键切换
- **参数预设** — 保存和加载提示词、负面提示词、尺寸、步数、调度器、CFG 和 Karras 设置
- **可配置后端** — 设置自定义 Local Dream IP/端口，适用于不同设备
- **实时连接检测** — URL 变更时自动执行健康检查，即时反馈后端状态
- **主题切换** — 通过导航栏按钮在 Apple 浅色主题和原版暗色紫色主题之间切换
- **Apple 风格设计** — 浅色羊皮纸背景、白色卡片、深色输出面板、胶囊按钮、蓝色强调色

## 环境要求

- 已安装并加载模型的 [Local Dream](https://github.com/xororz/local-dream)
- Python 3.10+

## 安装

```bash
uv sync
uv run python app.py
# 或先激活虚拟环境：
# .venv\Scripts\activate  (Windows)
# source .venv/bin/activate  (Linux/macOS)
# python app.py
```

在浏览器中打开 `http://127.0.0.1:5000`。其他设备可通过 `http://<手机IP>:5000` 访问。

Local Dream 必须在点击"生成"之前运行并加载模型。默认连接 `http://127.0.0.1:8081` —— 在标题下方的开关可以设置自定义地址。

## 使用

1. 选择模式：**文生图**、**图生图**
2. 输入提示词（和可选的负面提示词）
3. 图生图：点击上传图像 → 在裁剪模态框中定位 → 确认
4. 局部重绘：启用**蒙版**开关 → 点击**编辑蒙版** → 在要重绘的区域上绘制
5. 自动蒙版：点击**自动蒙版** → 输入 HuggingFace 令牌 → 选择分割区域 → 点击**应用蒙版**
6. 调整参数（步数、CFG、种子、调度器等）
7. 点击**生成** —— 局部重绘输出将以全分辨率合成回原图

### 自动蒙版

自动蒙版使用 [mattmdjaga/segformer_b2_clothes](https://huggingface.co/mattmdjaga/segformer_b2_clothes) 模型通过 HuggingFace Inference API 进行衣物和人体分割。需要免费的 HuggingFace 账户和 API 令牌。令牌可在界面中输入（保存在 `localStorage`）或在 `.env` 文件中设置：

```
HF_TOKEN=hf_...
```

### 语言

点击顶部导航栏的 **EN** / **中文** 切换界面语言。偏好设置保存在 `localStorage` 中。

### 可信后端白名单（可选）

默认情况下，WebUI 会把"生成"请求代理到用户输入的 URL（或 `http://127.0.0.1:8081`）。如需拒绝未授权后端，可在 `.env` 中设置逗号分隔的白名单：

```
LD_ALLOWED_HOSTS=127.0.0.1:8081,192.168.1.42:8081
```

任何 `local_dream_url` 的 `host:port` 不在列表中时，会静默回落默认 URL。不抛错——这是有意为之，避免攻击者通过错误响应探测后端存在性。

## 开发

安装开发依赖并运行测试：

```bash
uv sync --group dev
uv run pytest              # 完整套件（62 个测试，约 0.5s）
uv run pytest -m "not performance"   # 跳过 4 个性能基准
```

测试覆盖 SSE 解析、事件 handler、URL 解析、可信后端白名单、HF Automask 适配器，以及带 mock 后端的端到端路由派发。不会向 Local Dream 或 HuggingFace 发送真实 HTTP。

## 界面截图

![Apple 主题 — 参数面板](./assets/image-20260527155403713.png)
![原始主题 — 生成界面](./assets/image-20260527155418444.png)
![裁剪模态框](./assets/image-20260527155438678.png)

## 隐私

所有图像数据仅保存在浏览器会话存储中，关闭标签页后自动清除。不会保存到磁盘或发送到任何地方。

## 致谢

本项目是 [Local Dream](https://github.com/xororz/local-dream)（作者 [xoróz](https://github.com/xororz)）的第三方网页界面，与其无隶属关系。详见 [NOTICE](NOTICE)。
