# Work status

Handoff file for the main session. Updated after every phase change so work can resume after an interruption (`/resume`). Newest state at the top of each section.

## Waiting on the user

- Nothing. The dock redesign build is next.

## In progress: share by link + projects (`docs/plans/share-and-projects.md`, approved 2026-10-23)

| # | Task | Owner | State |
|---|------|-------|-------|
| 1 | Plan + answers | architect | done |
| 2 | UX spec `docs/ux/share-and-projects.md` (plan task 1, incl. landing Continue) | ux-expert | done (Q-A/Q-B answered) |
| 3 | Contracts (plan task 3 + `state/project-summary.ts`) | frontend A | done (frozen; adds state/project-meta.ts) |
| 4 | Visual specs + tokens (plan task 2, after 2) | designer | done (`docs/design/components/projects.md`) |
| 5 | Build A state / B share + routes + landing / C UI (plan tasks 4-6) | frontend A/B/C | done: 807 tests, build without warnings |
| 7 | Separate: full UI/UX review of the app (all areas) -> `docs/ux/ui-review.md`; the redesign is built AFTER share + projects | ux-expert | done; user chose dock + short tray, keep the 0.8 scale (answers in the review) |
| 8 | Redesign plan `docs/plans/dock-redesign.md` | architect | done, approved (answers in plan); build starts after share + projects commit |
| 6 | Tests + review (plan tasks 7-8), then ask user to deploy as v0.2.0 | tester, code-reviewer, ux-expert | done: all fixes in, 831 tests, axe 0, build + format clean; done; released as v0.2.0 |

## Committed

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
