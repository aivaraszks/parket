# Work status

Handoff file for the main session. Updated after every phase change so work can resume after an interruption (`/resume`). Newest state at the top of each section.

## Waiting on the user

- Next feature: share a design by link + multiple projects in localStorage. Answers so far: link only (design packed in the URL hash, no upload); the phone share sheet, falling back to copy on desktop; opening a link asks, then loads it as a separate project; the user can have multiple projects. Plan not started.

## Committed

- `v0.1.0`: wall/door/ceiling/skirting colouring, compact phone UI, 3D tap select on the Surfaces tab (674 tests, axe 0). Deployed.
- `e1ed09b` Floor visualizer + custom room shape.
- `c3f264a` Landing page.

## Versioning

- Semver tags `vX.Y.Z` on every deploy, with package.json version in sync. Feature = minor, fix = patch.

## Environment notes

- System Node 22.14 is too old: run Angular as `npx -y -p node@26 -- node node_modules/@angular/cli/bin/ng.js <cmd>`.
- Dev server for previews: `ng serve --host 0.0.0.0 --port 4200` (same npx prefix), LAN URL http://192.168.0.164:4200/.
- Overnight fallback: `scripts/claude-watchdog.ps1` runs `claude --continue -p "/resume"` when tasks are open and this file has been idle for 3 h. The user starts it manually.
