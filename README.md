# Local Dream WebUI

A web-based UI for [Local Dream](https://github.com/xororz/local-dream) — the Android Stable Diffusion app with Snapdragon NPU acceleration. Runs as a Flask proxy with a single-file frontend, no build step required.

## Features

- **txt2img / img2img / inpainting** with mask editor
- **Automask** — automatic clothing segmentation via Hugging Face
- **Aspect ratio control** for SDXL models (16:9, 4:3, 3:2, etc.)
- **Output format** selection (raw RGB / JPEG / PNG)
- **Preview format** and progress stride configuration
- **Upscaler presets** — Anime (Real-ESRGAN) / Realistic (UltraSharp)
- **Send to img2img** — reuse generated images and params in img2img
- **Real-time progress** streaming with per-step previews
- **Token count** display for prompts
- **Parameter presets** saved in browser localStorage
- **Dual theme** — Apple light / Original dark
- **Dual language** — English / 中文

## Quick Start

```bash
# Install dependencies
uv sync

# Start the server
uv run python app.py
```

Open http://localhost:5000 in a browser. Local Dream must be running on `127.0.0.1:8081` (configurable in UI).

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│  Browser     │────▶│  Flask Proxy  │────▶│  Local Dream     │
│  (index.html)│     │  (app.py)     │     │  (Android HTTP)  │
│              │◀────│  SSE stream   │◀────│  /generate       │
│              │     │  (sse.py)     │     │  /tokenize       │
│              │     │               │     │  /upscale        │
└──────────────┘     └──────────────┘     └──────────────────┘
```

### Backend (app.py)

Flask server with 8 routes:

| Route        | Method | Description                              |
| ------------ | ------ | ---------------------------------------- |
| `/`          | GET    | Renders frontend                         |
| `/health`    | GET    | Probes Local Dream reachability          |
| `/automask`  | POST   | Hugging Face clothing segmentation       |
| `/tokenize`  | POST   | Prompt token count from Local Dream      |
| `/upscale`   | POST   | Image upscaling via Local Dream          |
| `/save-temp` | POST   | Save images for inpainting composite     |
| `/compose`   | POST   | Composite inpainted result onto original |
| `/generate`  | POST   | Proxies generation with SSE streaming    |

SSE event stream processed in `sse.py` — raw RGB bytes converted to PNG base64, progress enriched with percent.

Utility modules:

- `lib/log.py` — structured JSON logging with correlation IDs, rotating file handlers

### Frontend (templates/index.html)

Single-file vanilla HTML/CSS/JS. No framework, no build step. 15 parameter fields, image upload with crop modal, mask editor, automask overlay, parameter presets, upscaler model presets, dual theme, dual language.

Reusable modules under `/static/`:

- `params.js` — `createParamsForm()`: DOM ↔ field value binding; `createParamsPayload()`: field → wire payload
- `sse-client.js` — `parse()`, `extractPercent()`, `events()`: SSE protocol layer

## Commands

```bash
uv run python app.py          # Start server (http://0.0.0.0:5000)

# Tests
uv run pytest                 # 93 Python tests (~1s)
uv run pytest -m "not performance"  # Skip perf tests
uv run pytest --cov           # With coverage report
bun test                      # 87 JS tests (~80ms)

# Code quality
uv run ruff check             # Lint all Python files
uv run ruff format            # Format all Python files
bun prettier --write .        # Format HTML / CSS / JS
```

## Test Coverage

| Module          | Coverage | Tests                             |
| --------------- | -------- | --------------------------------- |
| `sse.py`        | 100%     | 24 Python tests                   |
| `app.py`        | 87%      | 69 Python tests                   |
| `params.js`     | —        | 56 JS tests (payload + form)      |
| `sse-client.js` | —        | 17 JS tests                       |
| **Total**       | **—**    | **93 Python + 87 JS = 180 tests** |

## Trusted-host Allowlist

Set `LD_ALLOWED_HOSTS` environment variable to restrict which Local Dream URLs are accepted:

```bash
export LD_ALLOWED_HOSTS="127.0.0.1:8081,192.168.1.100:8081"
```

When configured, URLs not on the list silently fall back to the default — no error is returned (security by obscurity).

## Privacy

- All generation runs locally — no data leaves your network
- Automask uses Hugging Face's hosted inference API (requires HF_TOKEN)
- No telemetry, no analytics, no external requests beyond LD and Hugging Face

## Known Issues / Fixes

- **Mask brush opacity** — mask editor brush now uses fully opaque white (`#ffffff`) instead of 95% opacity. Previous versions produced masks with ~242/255 values, causing only 95% of the generated image to be applied in inpaint regions.
- **Inpainting padding coordinate alignment** — three coordinate bugs in `compositeInpaint` and `stitchFullToOriginal` padding branch where original unpadded dimensions (`origW/origH`) were used instead of scaled dimensions (`sw/sh`). Fixed: drawImage source rects and placement coordinates now correctly use scaled dimensions on the padded canvas.
- **Aspect ratio contaminating img2img** — when sending to img2img, the original image's `aspect_ratio` (e.g. "3:4") was sent to LD alongside the crop canvas, causing LD to output at the wrong resolution. Fixed: `buildWirePayload` deletes `wire.aspect_ratio` in img2img mode.
- **Crop result resolution mismatch** — LD returned 768×1024 instead of 1024×1024 for the crop canvas because `wire.aspect_ratio` overrode `wire.size=1024`. Fixed by clearing aspect_ratio in img2img mode (same as above).

## Acknowledgements

- [Local Dream](https://github.com/xororz/local-dream) — the amazing Android app this project proxies to
- [Hugging Face](https://huggingface.co/) — hosted inference for clothing segmentation
