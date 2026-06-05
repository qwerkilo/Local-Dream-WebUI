# Local Dream WebUI

A Flask web UI for the [Local Dream](https://github.com/xororz/local-dream) Android app's HTTP API.

## Stack

- **Backend**: Python 3.10+, Flask, Pillow, requests
- **Frontend**: Single-page vanilla HTML/CSS/JS (`templates/index.html`)
- **Tests**: pytest (62 tests, `tests/`)
- **Environment**: Termux on Android (no PC) — also works on desktop via uv

## Running

```bash
# Desktop (with uv):
uv sync
uv run python app.py
# Open http://127.0.0.1:5000

# Termux (without uv):
pip install flask requests pillow
python app.py
# Open http://127.0.0.1:5000
```

Local Dream must be open with a model loaded before the API is available at `http://127.0.0.1:8081`.

For development with tests:

```bash
uv sync --group dev
uv run pytest
```

## Project Structure

```
app.py                  # Flask server — routes, resolve_ld_url, HFAutomask, LD_ALLOWED_HOSTS allowlist
sse.py                  # SSE 解析 + 事件类型注册表 (EVENT_HANDLERS) + complete/progress handlers
templates/index.html    # Entire frontend (single file)
tests/                  # 62 pytest tests
  test_sse.py           # parse_sse / complete_to_png_b64 / progress_handler / EVENT_HANDLERS
  test_app.py           # resolve_ld_url + allowlist + HFAutomask
  test_routes.py        # End-to-end route dispatch + perf benchmarks
.env                    # Optional — HF_TOKEN and LD_ALLOWED_HOSTS (not committed)
.shortcuts/Local Dream  # Termux widget shortcut — starts server and opens browser
```

## Architecture

### Backend

Four routes in `app.py`:

- `GET /` — serves the UI
- `GET /health` — checks if Local Dream is reachable; URL via `?url=` (resolved by `resolve_ld_url`)
- `POST /generate` — proxies the request to Local Dream, streams SSE back to browser
- `POST /automask` — `HFAutomask` adapter calls HuggingFace segformer_b2_clothes, returns segment list

Shared helpers in `app.py`:
- `resolve_ld_url(override)` — single URL-resolution entry; falls back to `DEFAULT_LD_URL` on empty/non-string; if `LD_ALLOWED_HOSTS` is set, also enforces netloc allowlist (silent fallback, no error to avoid probing).
- `HFAutomask(token, timeout=60)` — wraps the HF Router call; `ENDPOINT` constant + `segment(png_bytes) -> dict`.

SSE plumbing lives in `sse.py`:
- `parse_sse(lines) -> Iterator[Event]` — pure SSE line parser (W3C-compliant).
- `EVENT_HANDLERS` — registry mapping event type to handler. Add a new event type by registering one entry.
- `complete_to_png_b64` — converts raw RGB bytes in `complete` events to base64 PNG (replaces `image` with `png_image`).
- `progress_handler` — defensively recognizes `step`+`total` / `step`+`max_steps` / `step`+`steps` / standalone `progress` (0-1 or 0-100) and adds a `percent` field; otherwise passes through unchanged.

`HF_TOKEN` is read from `.env` at startup if present; the UI can also pass it per-request (body token wins, env fallback).

Payload is passed through as-is. Only non-default optional params are sent (karras/use_opencl only if true, clip_skip only if >1, seed only if not random) to stay close to what the native app sends.

### Trusted-backend allowlist (optional security)

Set `LD_ALLOWED_HOSTS` in `.env` to a comma-separated list of `host:port` to refuse untrusted backends. Unlisted URLs silently fall back to default. Not set = no restriction.

### Frontend (`templates/index.html`)

Single-page app, no framework. Key sections:

**Modes**: txt2img, img2img (with optional mask/inpaint toggle)

**Size & scheduler**: Size options are 512 (default), 640, 768, 1024, and custom. Scheduler defaults to the API default (blank); other options: `euler`, `euler_a`, `lcm`, `dpm++2m`, `dpm++2m_sde`. OpenCL checkbox label: "Use OpenCL (Enables GPU for CPU Models)".

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

**SSE streaming**: Uses `fetch()` + `ReadableStream` reader. Chunks split on `\n\n`, events parsed manually. Dispatch order: prefer the SSE `event:` field (from the backend `EVENT_HANDLERS` registry), fall back to JSON `data.type` for older Local Dream builds. Progress bar prefers backend's `data.percent` field; falls back to `step / total` (with `total` / `total_steps` / `max_steps` / `steps` all accepted). Display total uses the user's chosen steps to hide the API's 2 internal extra steps.

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


<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:6cd5cc61 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

## Agent Context Profiles

The managed Beads block is task-tracking guidance, not permission to override repository, user, or orchestrator instructions.

- **Conservative (default)**: Use `bd` for task tracking. Do not run git commits, git pushes, or Dolt remote sync unless explicitly asked. At handoff, report changed files, validation, and suggested next commands.
- **Minimal**: Keep tool instruction files as pointers to `bd prime`; use the same conservative git policy unless active instructions say otherwise.
- **Team-maintainer**: Only when the repository explicitly opts in, agents may close beads, run quality gates, commit, and push as part of session close. A current "do not commit" or "do not push" instruction still wins.

## Session Completion

This protocol applies when ending a Beads implementation workflow. It is subordinate to explicit user, repository, and orchestrator instructions.

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Handle git/sync by active profile**:
   ```bash
   # Conservative/minimal/default: report status and proposed commands; wait for approval.
   git status

   # Team-maintainer opt-in only, unless current instructions forbid it:
   git pull --rebase
   git push
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**
- Explicit user or orchestrator instructions override this Beads block.
- Do not commit or push without clear authority from the active profile or the current user request.
- If a required sync or push is blocked, stop and report the exact command and error.
<!-- END BEADS INTEGRATION -->
