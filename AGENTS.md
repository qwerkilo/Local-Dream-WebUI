# AGENTS.md — Local Dream WebUI

## Language preference

这个项目的开发者是中文用户。与用户沟通时使用中文。

## 关于本机以及本项目的一些必要信息

### 本机环境

1.操作系统：windows 11 x64

2.已经安装：uv，bun，已安装nushell可通过nu命令进入nushell后使用nushell命令（如ls，grep，where，ps，pwd，rm，mv，mkdir，cat、less、more等）。

3.如果本项目需要使用python，请在项目根目录下使用uv创建虚拟环境venv并激活使用。

4.项目内的所有代码读取和查询优先使用codegraph，同时代码修改后及时使用codegraph sync增量更新索引。

5.需要联网搜索的话如果fetch后的结果不理想，可以使用opencli查询，详细请使用阅读opencli相关skill。



## 关于一些编码规范

1.尽可能符合阿里巴巴编码规范。

2.一定要添加中文注释。

3.使用 Prettier 统一格式化代码。

## 关于回答

1.询问和回答用户的时候请使用中文，思考的时候则使用英文。

2.brainstorming 服务器使用新的cmd窗口启动，不然你会卡在当前界面无法顺利运行。（或者类似的需要长期等待相应的都使用新的后台的cmd窗口进行启动，使用完成后请结束对应cmd进程）



## Repo at a glance

Source layout is small, with one shared module plus a single-file frontend:

- `app.py` — Flask server (4 routes) + `resolve_ld_url` / `HFAutomask` / `LD_ALLOWED_HOSTS` allowlist
- `sse.py` — SSE 解析 + 事件类型注册表 (`EVENT_HANDLERS`)，含 `complete` 与 `progress` 两个 handler
- `templates/index.html` — entire frontend, vanilla HTML/CSS/JS, single file
- `tests/` — 62 个 pytest 测试（`test_sse.py` / `test_app.py` / `test_routes.py`），约 0.5s 跑完
- `CONTEXT.md` — 领域词汇与接缝状态，未来 agent 必读

## Non-obvious facts

- **Tests use pytest** — `uv run pytest` 跑全套；`uv run pytest -m "not performance"` 跳过 4 个 perf。Mock `app.requests.post` / `app.requests.get`，不发真实 HTTP。
- **No typechecker, linter, or formatter.** No ruff, no prettier, no ESLint. Don't look for them.
- **No database, no migrations.** Everything in-memory or browser sessionStorage.
- **`.env` is gitignored.** Loaded manually in `app.py` via `os.environ.setdefault()`. Holds `HF_TOKEN` and (optionally) `LD_ALLOWED_HOSTS`.
- **Local Dream is an external service** — must be open on `127.0.0.1:8081` with a model loaded. Flask is a thin proxy.
- **SSE streaming** — `POST /generate` streams SSE. `sse.parse_sse()` 解析行流，`sse.EVENT_HANDLERS` 按事件类型派发 handler。`complete` 事件把 raw RGB → base64 PNG（`complete_to_png_b64`）；`progress` 事件附 `percent` 字段（防御性识别多种字段名）。
- **Trusted-host allowlist** — `LD_ALLOWED_HOSTS`（逗号分隔 `host:port`）。未配置 = 不限制（向后兼容）。配置后，不在白名单的 URL 静默回落默认，不抛错。
- **No build step** for frontend. Edit `index.html`, refresh browser.
- **Run with** `uv run python app.py` (or activate `.venv\Scripts\activate` first), serves on `0.0.0.0:5000`, debug mode on.

## If adding features

- Backend changes go in `app.py` (routes / helpers) or `sse.py` (event handlers). New routes are trivially additive. New event types are one entry in `sse.EVENT_HANDLERS` + a handler function.
- Frontend logic goes in `templates/index.html` — inline `<script>` at the bottom. `parseSSEChunk` 是 SSE 消费主入口，按 `event:` 字段（回退 `data.type`）分派。
- CSS is inline `<style>` at the top of `index.html`.
- Avoid adding a frontend build step, npm, or framework — the project deliberately has none.
- **读 `CONTEXT.md`** 了解领域词汇与已知接缝（已深化位置不要再建议）。

## API integration quirks

- Local Dream returns raw RGB bytes (not PNG) in `complete` SSE event. `sse.complete_to_png_b64` 负责 decode → Pillow → PNG → base64，并删除 `image` 字段、添加 `png_image` 字段。
- The API adds 2 internal steps beyond what `steps` requests. UI compensates by displaying user-set steps.
- Scheduler strings: `euler`, `euler_a`, `lcm`, `dpm++2m`, `dpm++2m_sde`. Unknown values silently fall back to default.
- Only send non-default optional params (karras/use_opencl only if true, clip_skip only if >1, seed only if not random).
- **`local_dream_url` field** in `/generate` body and `?url=` query param on `/health` allow overriding the default `127.0.0.1:8081`. Frontend persists the URL in `localStorage`. URL 经 `resolve_ld_url` 解析（allowlist 校验）。
- **Health indicator** — green/red dot next to the URL input, refreshes every 10s via `checkHealth()` and on URL/toggle changes.
- **Parameter presets** saved in `localStorage` (`presets` key) — prompt, neg_prompt, size, steps, scheduler, cfg, karras.
- **Theme system** — `.theme-original` CSS class on `<body>` overrides all design tokens. Toggle button in sub-nav, preference in `localStorage` (`"theme"` key).
- **Progress events** — `sse.progress_handler` 附 `percent` 字段；前端 `parseSSEChunk` 优先用 `data.percent`，回退 `step / total`（多字段名兜底）。Local Dream 的 progress wire format 未确认时不要破坏 event 注册。

<!-- BEGIN BEADS INTEGRATION v:1 profile:full hash:19cc25d9 -->
## Issue Tracking with bd (beads)

**IMPORTANT**: This project uses **bd (beads)** for ALL issue tracking. Do NOT use markdown TODOs, task lists, or other tracking methods.

### Why bd?

- Dependency-aware: Track blockers and relationships between issues
- Git-friendly: Dolt-powered version control with native sync
- Agent-optimized: JSON output, ready work detection, discovered-from links
- Prevents duplicate tracking systems and confusion

### Quick Start

**Check for ready work:**

```bash
bd ready --json
```

**Create new issues:**

```bash
bd create "Issue title" --description="Detailed context" -t bug|feature|task -p 0-4 --json
bd create "Issue title" --description="What this issue is about" -p 1 --deps discovered-from:bd-123 --json
```

**Claim and update:**

```bash
bd update <id> --claim --json
bd update bd-42 --priority 1 --json
```

**Complete work:**

```bash
bd close bd-42 --reason "Completed" --json
```

### Issue Types

- `bug` - Something broken
- `feature` - New functionality
- `task` - Work item (tests, docs, refactoring)
- `epic` - Large feature with subtasks
- `chore` - Maintenance (dependencies, tooling)

### Priorities

- `0` - Critical (security, data loss, broken builds)
- `1` - High (major features, important bugs)
- `2` - Medium (default, nice-to-have)
- `3` - Low (polish, optimization)
- `4` - Backlog (future ideas)

### Workflow for AI Agents

1. **Check ready work**: `bd ready` shows unblocked issues
2. **Claim your task atomically**: `bd update <id> --claim`
3. **Work on it**: Implement, test, document
4. **Discover new work?** Create linked issue:
   - `bd create "Found bug" --description="Details about what was found" -p 1 --deps discovered-from:<parent-id>`
5. **Complete**: `bd close <id> --reason "Done"`

### Quality
- Use `--acceptance` and `--design` fields when creating issues
- Use `--validate` to check description completeness

### Lifecycle
- `bd defer <id>` / `bd supersede <id>` for issue management
- `bd stale` / `bd orphans` / `bd lint` for hygiene
- `bd human <id>` to flag for human decisions
- `bd formula list` / `bd mol pour <name>` for structured workflows

### Sync

bd stores issue history in Dolt:

- Each write auto-commits to Dolt history
- Use `bd dolt push`/`bd dolt pull` for remote sync
- Do not treat `.beads/issues.jsonl` as the sync protocol

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

### Important Rules

- ✅ Use bd for ALL task tracking
- ✅ Always use `--json` flag for programmatic use
- ✅ Link discovered work with `discovered-from` dependencies
- ✅ Check `bd ready` before asking "what should I work on?"
- ❌ Do NOT create markdown TODO lists
- ❌ Do NOT use external issue trackers
- ❌ Do NOT duplicate tracking systems

For more details, see README.md and docs/QUICKSTART.md.

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
