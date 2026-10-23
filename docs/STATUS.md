# Work status

Handoff file for the main session. Updated after every phase change so work can resume after an interruption (`/resume`). Newest state at the top of each section.

## Waiting on the user

- Answers given 2026-10-23 for the next feature (wall/door colouring): per-wall colour, palette + custom picker, also skirting and ceiling. Plan not written yet.

## Committed

- Floor visualizer + custom room shape (562 tests, phone-tested and approved by the user 2026-10-23). Not pushed.
- `c3f264a` Landing page (deployed to Pages).

## Environment notes

- System Node 22.14 is too old: run Angular as `npx -y -p node@26 -- node node_modules/@angular/cli/bin/ng.js <cmd>`.
- Dev server for previews: `ng serve --host 0.0.0.0 --port 4200` (same npx prefix), LAN URL http://192.168.0.164:4200/.
- Overnight fallback: `scripts/claude-watchdog.ps1` runs `claude --continue -p "/resume"` when tasks are open and this file has been idle for 3 h. The user starts it manually.
