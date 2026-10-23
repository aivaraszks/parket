# Work status

Handoff file for the main session. Updated after every phase change so work can resume after an interruption (`/resume`). Newest state at the top of each section.

## Waiting on the user

- Phone test of v0.3.0 (dock redesign) on the live site: orbit smoothness (≥ 30 fps with the full-screen canvas; fallback D1 if not), slider scrub, plan editor card, colour picker.
- After the device check passes, delete `scene/frame-debug.ts` (see docs/plans/dock-redesign.md spike result) and do plan task 14 (docs: superseded notes, final decisions).

## Committed

- `v0.3.0`: dock + tray redesign (full-screen 3D, dock, Camera menu, Colour without a mode, phone plan editor action bar + card, faster landing CTA). 884 tests, axe 0. Deployed.
- `v0.2.0`: share by link, multiple projects, landing Continue. Deployed.
- `v0.1.0`: wall/door/ceiling/skirting colouring, compact phone UI, 3D tap select on the Surfaces tab (674 tests, axe 0). Deployed.
- `e1ed09b` Floor visualizer + custom room shape.
- `c3f264a` Landing page.

## Versioning

- Semver tags `vX.Y.Z` on every deploy, with package.json version in sync. Feature = minor, fix = patch.

## Environment notes

- System Node 22.14 is too old: run Angular as `npx -y -p node@26 -- node node_modules/@angular/cli/bin/ng.js <cmd>`.
- Dev server for previews: `ng serve --host 0.0.0.0 --port 4200` (same npx prefix), LAN URL http://192.168.0.164:4200/.
- Overnight fallback: `scripts/claude-watchdog.ps1` runs `claude --continue -p "/resume"` when tasks are open and this file has been idle for 3 h. The user starts it manually.
