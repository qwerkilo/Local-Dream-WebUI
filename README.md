# Local Dream WebUI

A Flask web UI for the [Local Dream](https://github.com/lunar-byte-dev/localdream) Android app's local HTTP API.

## Features

- **txt2img** — generate images from a text prompt
- **img2img** — generate from an input image + prompt
- **Inpainting** — draw a mask over the input image to repaint specific areas
- **Crop/position modal** — drag and pinch-zoom your image to fit the generation canvas; empty areas are automatically outpainted
- **Real-time progress** — SSE streaming shows step-by-step generation progress
- **Details panel** — shows Steps, CFG, Size, Seed, Scheduler, and generation time after each run
- **Session persistence** — uploaded image and mask survive page reloads (cleared when tab closes)

## Requirements

- [Local Dream](https://github.com/lunar-byte-dev/localdream) installed and running on Android with a model loaded
- Python 3.10+
- Termux (or any Linux environment)

## Setup

```bash
pip install flask requests pillow
python app.py
```

Open `http://127.0.0.1:5000` in a browser. For LAN access from other devices use `http://<your-phone-ip>:5000`.

Local Dream must be running with a model loaded before you hit Generate — the app talks to `http://127.0.0.1:8081`.

## Usage

1. Select a mode: **txt2img**, **img2img**
2. Enter a prompt (and optional negative prompt)
3. For img2img: tap to upload an image → position it in the crop modal → confirm
4. To inpaint: enable the **Mask** toggle → tap **Edit Mask** → draw over areas to repaint
5. Adjust parameters (steps, CFG, seed, scheduler, etc.)
6. Tap **Generate**

## Privacy

No images are saved to disk or sent anywhere. All image data stays in your browser's session storage and is cleared when the tab closes.
