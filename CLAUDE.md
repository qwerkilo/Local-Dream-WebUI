# Local Dream WebUI

A Flask web UI for the [Local Dream](https://github.com/xororz/local-dream) Android app's HTTP API.

## Stack

- **Backend**: Python 3.13, Flask, Pillow, requests
- **Frontend**: Single-page vanilla HTML/CSS/JS (`templates/index.html`)
- **Environment**: Termux on Android (no PC)

## Running

```bash
pip install flask requests pillow
python app.py
# Open http://127.0.0.1:5000
```

Local Dream must be open with a model loaded before the API is available at `http://127.0.0.1:8081`.

## Project Structure

```
app.py                  # Flask server — proxy + raw RGB→PNG conversion + automask proxy
templates/index.html    # Entire frontend (single file)
.env                    # Optional — set HF_TOKEN here (not committed)
.shortcuts/Local Dream  # Termux widget shortcut — starts server and opens browser
```

## Architecture

### Backend (`app.py`)

Four routes:

- `GET /` — serves the UI
- `GET /health` — checks if Local Dream is reachable on port 8081
- `POST /generate` — proxies the request to Local Dream, streams SSE back to browser
- `POST /automask` — proxies image to HuggingFace segformer_b2_clothes, returns segment list

`HF_TOKEN` is read from `.env` at startup if present; the UI can also pass it per-request.

The only server-side transformation on `/generate`: the Local Dream API returns raw RGB bytes (not PNG) in the `complete` event. Flask decodes these with Pillow and replaces `image` with `png_image` (base64 PNG) before forwarding to the browser.

Payload is passed through as-is. Only non-default optional params are sent (karras/use_opencl only if true, clip_skip only if >1, seed only if not random) to stay close to what the native app sends.

### Frontend (`templates/index.html`)

Single-page app, no framework. Key sections:

**Modes**: txt2img, img2img (with optional mask/inpaint toggle)

**Image upload flow** (img2img):
1. User taps upload → file picker opens
2. Image loads → **Crop/Position modal** opens automatically
3. User drags/pinch-zooms image within the target canvas size
4. On confirm: composited image exported as `imgB64`; crop parameters saved as `lastCropRegion`; any empty canvas areas auto-generate an outpaint mask
5. "Adjust crop" button overlaid on preview lets user reopen the modal with state preserved

**Mask editor** (inpaint):
- Full-screen modal with drawing canvas overlaid on the image
- White brush = area to repaint, black = keep
- Undo/clear/invert controls, adjustable brush (4–300px, default 80)
- Active mask shown as a purple tint canvas overlay on the image preview

**Automask** (inpaint):
- Sends `imgB64` to `/automask` → HuggingFace segformer_b2_clothes
- Full-screen modal: image with colored segment overlays, chip buttons to select/deselect segments
- Padding slider dilates segment masks (sliding-window max, horizontal + vertical passes)
- Clothing segments pre-selected by default; apply writes combined mask to `maskB64`
- Result cached per image — reopening skips the API call if image unchanged

**Inpaint compositing** (`compositeInpaint`):
- If `rawUploadedImg` and `lastCropRegion` are available, composites at the original image's resolution
- Reverse-maps the 512px generated image back to original coordinates: `srcX = -cropX / cropScale`, `srcW = 512 / cropScale`
- Draws generated and mask at those coordinates on an original-size canvas, then blends pixel-by-pixel
- Falls back to crop-size compositing if original image or crop region is unavailable

**Session persistence**: `imgB64`, `maskB64`, raw image src, `lastCropRegion`, and mask-enabled state are saved to `sessionStorage` after crop confirm and mask done. Restored on page reload (survives Flask restarts, cleared when tab closes).

**SSE streaming**: Uses `fetch()` + `ReadableStream` reader. Chunks split on `\n\n`, events parsed manually. Progress bar driven by `step/total_steps` from API (display uses user-set steps to hide the API's 2 internal extra steps).

**Details panel**: Shows Steps, CFG, Size, Seed, Mode, Scheduler, Time after generation.

## Local Dream API Notes

- Endpoint: `POST http://127.0.0.1:8081/generate`
- Response: Server-Sent Events (`text/event-stream`)
- Image in `complete` event is **raw RGB bytes**, not PNG — must convert with Pillow
- The API adds 2 internal steps on top of the requested `steps` value
- Optional params behave differently when omitted vs sent as false/default — send only when non-default
- Confirmed scheduler strings: `euler`, `euler_a`, `lcm`, `dpm++2m`, `dpm++2m_sde`
- Unknown scheduler strings silently fall back to default (no error)
- Punctuation in prompts affects tokenization and output even with the same seed
