# Local Dream WebUI

A Flask web UI for the [Local Dream](https://github.com/xororz/local-dream) Android app's local HTTP API.

## Features

- **txt2img** — generate images from a text prompt
- **img2img** — generate from an input image + prompt
- **Inpainting** — draw a mask over the input image to repaint specific areas
- **Automask** — one-tap clothing/body segmentation via HuggingFace; select segments to build a mask automatically
- **Full-res inpaint composite** — generated content is composited back onto the original image at its original resolution, not the 512px crop
- **Crop/position modal** — drag and pinch-zoom your image to fit the generation canvas; empty areas are automatically outpainted
- **Mask overlay** — active mask shown as a purple tint directly on the image preview
- **Real-time progress** — SSE streaming shows step-by-step generation progress
- **Size options** — 512, 640, 768, 1024, or custom (up to 2048)
- **Details panel** — shows Steps, CFG, Size, Seed, Scheduler, and generation time after each run
- **Session persistence** — uploaded image, mask, and crop region survive page reloads (cleared when tab closes)

## Requirements

- [Local Dream](https://github.com/xororz/local-dream) installed and running on Android with a model loaded
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
5. To automask: tap **Automask** → enter your HuggingFace token → select segments → tap **Apply Mask**
6. Adjust parameters (steps, CFG, seed, scheduler, etc.)
7. Tap **Generate** — inpaint output is composited back onto your original image at full resolution

### Automask

Automask uses the [mattmdjaga/segformer_b2_clothes](https://huggingface.co/mattmdjaga/segformer_b2_clothes) model via the HuggingFace Inference API to segment clothing and body parts. A free HuggingFace account and API token are required. The token can be entered in the UI (persisted in `localStorage`) or set in a `.env` file:

```
HF_TOKEN=hf_...
```

## Privacy

No images are saved to disk or sent anywhere. All image data stays in your browser's session storage and is cleared when the tab closes.

## Credits

This project is a third-party web UI for [Local Dream](https://github.com/xororz/local-dream) by [xororz](https://github.com/xororz). It is not affiliated with or endorsed by the Local Dream project. See [NOTICE](NOTICE) for details.
