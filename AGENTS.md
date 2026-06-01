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

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:970c3bf2 -->
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
   bd dolt push
   git push
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**
- Explicit user or orchestrator instructions override this Beads block.
- Do not commit or push without clear authority from the active profile or the current user request.
- If a required sync or push is blocked, stop and report the exact command and error.
<!-- END BEADS INTEGRATION -->

<!-- BEGIN BEADS CODEX SETUP: generated by bd setup codex -->
## Beads Issue Tracker

Use Beads (`bd`) for durable task tracking in repositories that include it. Use the `beads` skill at `.agents/skills/beads/SKILL.md` (project install) or `~/.agents/skills/beads/SKILL.md` (global install) for Beads workflow guidance, then use the `bd` CLI for issue operations.

### Quick Reference

```bash
bd ready                # Find available work
bd show <id>            # View issue details
bd update <id> --claim  # Claim work
bd close <id>           # Complete work
bd prime                # Refresh Beads context
```

### Rules

- Use `bd` for all task tracking; do not create markdown TODO lists.
- Run `bd prime` when Beads context is missing or stale. Codex 0.129.0+ can load Beads context automatically through native hooks; use `/hooks` to inspect or toggle them.
- Keep persistent project memory in Beads via `bd remember`; do not create ad hoc memory files.

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.
<!-- END BEADS CODEX SETUP -->
