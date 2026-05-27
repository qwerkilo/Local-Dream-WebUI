# AGENTS.md — Local Dream WebUI

## Language preference

这个项目的开发者是中文用户。与用户沟通时使用中文。

## Repo at a glance

2 source files — that's it. Don't overthink.

- `app.py` — Flask server (4 routes, 111 lines)
- `templates/index.html` — entire frontend, vanilla HTML/CSS/JS, single file

## Non-obvious facts

- **No tests.** Zero. No test framework, no test files, no test dirs.
- **No typechecker, linter, or formatter.** No ruff, no prettier, no ESLint. Don't look for them.
- **No database, no migrations.** Everything in-memory or browser sessionStorage.
- **`.env` is gitignored.** Loaded manually in `app.py` via `os.environ.setdefault()`. For `HF_TOKEN`.
- **Local Dream is an external service** — must be open on `127.0.0.1:8081` with a model loaded. Flask is a thin proxy.
- **SSE streaming** — `POST /generate` streams SSE. Flask parses raw lines, converts `complete` event's raw RGB → base64 PNG via Pillow.
- **No build step** for frontend. Edit `index.html`, refresh browser.
- **Run with** `uv run python app.py` (or activate `.venv\Scripts\activate` first), serves on `0.0.0.0:5000`, debug mode on.

## If adding features

- Backend changes go in `app.py`. New routes are trivially additive.
- Frontend logic goes in `templates/index.html` — inline `<script>` at the bottom.
- CSS is inline `<style>` at the top of `index.html`.
- Avoid adding a frontend build step, npm, or framework — the project deliberately has none.

## API integration quirks

- Local Dream returns raw RGB bytes (not PNG) in `complete` SSE event. Must decode → Pillow → PNG → base64.
- The API adds 2 internal steps beyond what `steps` requests. UI compensates by displaying user-set steps.
- Scheduler strings: `euler`, `euler_a`, `lcm`, `dpm++2m`, `dpm++2m_sde`. Unknown values silently fall back to default.
- Only send non-default optional params (karras/use_opencl only if true, clip_skip only if >1, seed only if not random).
- **`local_dream_url` field** in `/generate` body and `?url=` query param on `/health` allow overriding the default `127.0.0.1:8081`. Frontend persists the URL in `localStorage`.
- **Health indicator** — green/red dot next to the URL input, refreshes every 10s via `checkHealth()` and on URL/toggle changes.
- **Parameter presets** saved in `localStorage` (`presets` key) — prompt, neg_prompt, size, steps, scheduler, cfg, karras.
- **Theme system** — `.theme-original` CSS class on `<body>` overrides all design tokens. Toggle button in sub-nav, preference in `localStorage` (`"theme"` key).
