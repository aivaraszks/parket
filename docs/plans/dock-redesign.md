# Plan: Dock + tray redesign of the designer controls

Status: draft, awaiting user approval. Owner: architect. Date: 2026-10-23.
Source: `docs/ux/ui-review.md` (proposal A + "Answers (user, 2026-10-23)"). Starts after share + projects (`share-and-projects.md`) is tested, reviewed and committed; its UI (Projects chip and dialog, Share chip, shared-link prompt, landing Continue) is treated as existing code. Earlier plans' decisions still apply unless replaced here.

## Goal

The 3D view is always full-screen. A small top bar (Back, Project, Camera, Share, Save image) and a section dock (Room, Floor, Colour, Light, Estimate with the live plank count) float over it. One short tray at a time holds a section's controls: closed or open, no Peek/Half/Full. The room is framed in the area the tray and bars do not cover, without resizing the canvas. Colour has no separate mode: an open Colour section is the mode. Reset moves into the Projects row menu. The landing CTA appears sooner and says "New project" for returning users. The phone plan editor drops its 60% panel for an action bar and a short card. **The compact 0.8x phone scale stays** (targets >= 24 px, `--text-xs` floor 11.2 px).

**Done when:**
- Every feature in the review's feature map (section 2.9) is reachable at its new location; nothing in the "Deleted" list is left in code, styles, tokens or specs.
- Phone (360x640, 390x844): with the tray closed the room uses the screen above the dock; with any section open the room sits fully visible above the tray; opening, closing or switching a section never resizes the canvas (no flash) and never moves a control under the finger; dragging a slider fades the tray so the floor shows through.
- Taps in 3D select a surface only while Colour is open; no Colour mode toggle, badge, "Done" or Views item exists.
- Desktop (900, 1024, 1280, 1440 px): rail + collapsible column; the top bar never overflows; presets inline from 1200 px.
- Projects row menu has "Reset to defaults" (current project, Undo toast); Estimate has no Reset.
- Landing: CTA at about 2.4 s (first visit) / 0.8 s (returning); a tap on a pill navigates at once; returning users see "New project".
- axe 0 on every section, menu and dialog, in closed, open and no-WebGL states; WCAG AA holds (see Accessibility).
- `npm run test:ci`, `npm run build:pages`, `npm run format:check` pass; the landing chunk stays free of designer code; initial bundle budget unchanged.

## Decisions

### D1. Full-screen canvas, framing by camera view offset (spike first)
- The stage (canvas) covers the whole designer host on every layout. The canvas resizes only when the window does (existing `ResizeObserver` in `floor-scene.ts`), never when the tray, dock or desktop column changes.
- The shell measures the chrome that covers the view and publishes **frame insets** `{ top, right, bottom, left }` in CSS px: top = top bar, bottom = dock + open tray (phone), right = rail + open column (desktop / landscape phone). Measured with one `ResizeObserver` on the bars, dock and tray. Root service `ViewFrame` (`ui/view-frame.ts`) holds the insets as a signal and also writes them as CSS vars `--frame-top/right/bottom/left` on the designer host (used by viewport status, toasts, the colour hint chip).
- New scene API `setFrame(insets)`. `CameraRig` computes the frame rect `fw x fh` = canvas minus insets and sets `camera.aspect = fw / fh` and `camera.setViewOffset(fw, fh, -left, -top, W, H)`. In three.js this keeps the FOV and the principal point on the frame rect and extends the frustum over the covered strips, so the floor keeps rendering under the translucent tray. All-zero insets use `clearViewOffset()`.
- `presetPose` and the top-down fit use the **frame** aspect, so presets fit the visible rect.
- Inset changes tween over the tray duration through the existing on-demand loop (`rig.update` reports animating); instant under `prefers-reduced-motion`. Insets ignore the on-screen keyboard (layout viewport only), so typing in a number field does not re-frame.
- Picking needs no change: `Raycaster.setFromCamera` uses `projectionMatrixInverse`, which includes the view offset, with NDC over the full canvas. A test proves it.
- PNG export renders once with the view offset cleared and the full canvas aspect (room centred in the image), then restores the frame.
- **Fallback** if the spike fails (frame rate or visual): keep today's resize model (`--stage-bottom` / `--panel-w` from the measured insets). Everything else in this plan is unchanged.

### D2. Shell state: one open section or none
- `section = signal<SectionId | null>(null)` in `Designer`; `SectionId = 'room' | 'floor' | 'colour' | 'light' | 'estimate'` (order of the dock). Not persisted; every visit starts closed.
- First visit: tray stays closed (F12); the look-around toast stays. No-WebGL / error: opens Estimate.
- Replaces `SheetStop`, `stop`, `tab`, the `stop-*` host classes and all sheet drag logic.

### D3. Dock / rail is a toolbar of disclosure buttons, not tabs
- `<nav aria-label="Design sections">` containing `role="toolbar"` with roving tabindex, arrow keys (Left/Right and Up/Down both work), Home/End. Each button has `aria-expanded` and `aria-controls="designer-tray"`; the active one is marked visually.
- One component renders the bottom dock (phone) and the side rail (>= 900 px, and landscape phones >= 700x<500) by CSS only; `aria-orientation` follows the layout.
- The Estimate button shows the planks-to-buy number; its accessible name carries the result ("Estimate, 374 planks to buy, 22.40 square metres"). The debounced live sentence from `estimate-summary.ts` is kept (the component is reused as the button's content).

### D4. Tray
- One element `#designer-tray`, `role="region"`, labelled by its `h2` (`tabindex="-1"`). Header: section title + close chevron. Body: the section component.
- Height follows content, capped by a token (about 40% of the viewport height, with a minimum; designer sets the numbers at 0.8 scale); longer content scrolls inside.
- "More" content uses native `<details>/<summary>`; no new disclosure component.
- Desktop/landscape: the tray is the column beside the rail; activating the open section's rail item collapses it.

### D5. Scrub to see
- `SliderField` puts a `scrubbing` class on its host while a pointer holds the range thumb (pointerdown on the range until pointerup/cancel/lostpointercapture), and shows a value bubble above the thumb.
- The tray CSS uses `:has(app-slider-field.scrubbing)` to fade its background and every other row to the designer's scrub opacity; the active row stays opaque. No layout change. Keyboard use never triggers it. Under reduced motion the switch is instant (no transition).
- Range inputs get `touch-action: pan-y` (vertical pans scroll the tray; horizontal drags move the thumb), verified in the spike (F14).

### D6. Colour without a mode
- `ColouringState` loses `active`, `toggle`, `setActive`. `surfacesOpen` / `setSurfacesOpen` become `colourOpen` / `setColourOpen`; `picking = colourOpen`.
- Opening Colour selects "All walls" if nothing is selected; closing clears the selection.
- UI: "What" chip row (Walls / Doors / Ceiling / Skirting, radio group) and "Which" chip row (All, 1, 2, ... for Walls and Doors; radio group, scrolls sideways), then a one-row swatch strip, then the value line. All derived from the existing `surfaceItems` model; no data model change.
- A 3D tap updates both rows and scrolls the chip into view; the tray never changes size from a tap; focus stays on the canvas.
- Selection highlight fades 1.5 s after a colour pick (F17): new `ColouringState.highlight` computed signal (selected, or null once faded); the viewport feeds that to `setHighlight`.
- First-use hint chip over the view ("Tap a wall, door, skirting or the ceiling."), dismissed on first tap, remembered in `parket.colourHint.v1`.

### D7. Top bar and Camera menu
- `view-toolbar.*` keeps its file name (less churn) and becomes: Back (icon), Project chip, spacer, Camera menu, Share, Save image (primary).
- Camera menu = one popover (existing popover pattern, not ARIA menu): Corner, Doorway, Top-down, Zoom in, Zoom out, "How to look around" (expands the help text in place). Presets also inline from 1200 px. The "?" chip and the Views popover go.
- Phone: Share and Save are icon-only with accessible names; the project chip truncates (about 12 characters), icon-only at 320 px (as specced).

### D8. Reset lives with the project
- Projects dialog row menu gets "Reset to defaults" on the **current** row only (Reset acts on the active project, decision P6). Same behaviour as today: `state.reset()`, corner preset, toast "Design reset." with Undo, plus the "Your room shape is kept." sub-line when a plan exists. The dialog closes and focus returns to the Project chip.

### D9. Compact scale stays
- `_phone-scale.scss` and its media query are kept. New dock/tray/rail tokens are defined at 1x in `styles.scss` and scaled for phones in `_phone-scale.scss` (explicit values, no calc cycles, as today). Minimums: targets >= 24 px (WCAG 2.5.8; the scale gives 35 px), no text below `--text-xs` (11.2 px).

### D10. Plan editor (phone) and landing
- Plan editor phone: canvas full-screen; a bottom action bar (nothing selected: hint + room height; wall: length chip + Add door/window/corner + Delete; corner/opening: their actions); tapping the length chip opens an inline card capped at about 45% (length, Keep, Move wall, openings). The expanded 60% panel state goes. Snap, Start over and the Walls/Corners lists move into a top-bar overflow popover. Zoom -/+ hidden on coarse pointers; Fit stays. Desktop side panel unchanged except the tool cluster position.
- Landing: `--delay-cta` 2.4 s; returning users (summary present) 0.8 s; the pills accept pointer input during the intro, so a tap on a pill navigates (a tap elsewhere still only reveals); the second pill reads "New project".

## Deleted (and where it went)

| Removed | Files / tokens |
| --- | --- |
| Bottom sheet, handle, Peek/Half/Full, drag | `ui/controls-sheet.{ts,html,scss,spec.ts}`; `SheetStop`; `--sheet-peek/half/full`, `--sheet-handle-w/h`, `--dur-sheet`, `--z-sheet` (-> tray tokens); `--sheet-half-h`, `--stage-bottom`, `stop-*` classes in `designer.scss` |
| ARIA tabs | `ui/tab-list.{ts,scss,spec.ts}` (only the sheet uses it) |
| Colour mode | `ColouringState.active/toggle/setActive`; toolbar `.colour-toggle`, badge, `.colour-on`, `colourTitle`, Views "Colour mode" item; Surfaces hint + "Done" (`endColourMode`); designer effects for `active`, `onStageEscape` colour-off; viewport "Colour mode is on" help text (rewritten for the open Colour section) |
| "?" chip and Views popover | `view-toolbar.*` (moved into Camera menu) |
| Reset in Estimate | `estimate-tab` reset block and `.reset` styles (moved to Projects dialog) |
| `tabs/` folder | moved to `ui/sections/*-section.ts`; `tabs/tab.scss` -> `sections/section.scss` |
| Plan editor phone expanded panel | `EditorSession.panelExpanded`, `.panel-expanded`, `.handle` in `plan-panel`, "Skip to controls" handle branch |
| Sheet / Views sections of the old specs | `docs/design/design-system.md` ("Compact phone scale" kept), layout parts of `docs/ux/floor-visualizer.md`, `wall-colouring.md`, `share-and-projects.md` get "superseded by dock-redesign" notes |

## Tasks

Phases run in order; tasks inside a phase run in parallel. File ownership below is exclusive per track.

**Phase 1: Spike and spec deltas (parallel)**
1. `frontend` (track A) **Spike, framing.** Throwaway local build: full-screen stage, `CameraRig.setFrame` with `setViewOffset` as in D1, a hard-coded bottom inset toggled by a debug key. Measure at 390x844 (DPR cap 1.5) on a mid-range Android and an iPhone: orbit frame rate full-screen vs today's Half; visual jump on toggle; picking accuracy at the frame centre and under the tray edge; OrbitControls pan speed (FOV now maps to the frame height); `touch-action: pan-y` on a range in a scrolling container. Report numbers and a go / fallback call to the main session; architect records the result in `decisions.md`. Pass: orbit >= 30 fps where today's build gets it, no flash, picks correct.
2. `ux-expert` **Spec deltas** `docs/ux/dock-redesign.md`: only what the review leaves open, at 0.8 scale: final copy (section titles, "More" labels, Estimate accessible name, hint chip, Reset sub-line, "New project"), focus order and focus moves for every open/close/switch path, Escape layering (popover > tray > nothing), What/Which behaviour for simple vs custom rooms and rooms without doors, empty-tap rule (see Q2), plan editor phone action bar states and card contents, landing timings, 200%/400% zoom and 320 px behaviour.
3. `designer` (after 2) **Visual spec + tokens** `docs/design/components/dock.md`; tokens in `src/styles.scss` and phone values in `src/app/designer/_phone-scale.scss`: dock height, rail width, column width (320 px), tray cap/min, tray translucency (AA for all text over the worst-case floor), scrub opacity, value bubble, chip rows, swatch strip, 5 dock icons (inline SVG paths), landing `--delay-cta` / new `--delay-cta-return`; remove sheet tokens; update `design-system.md`.

**Phase 2: Contracts (track A, small, then frozen)**
4. `frontend` A: `ui/section-id.ts` (`SectionId`, `SECTIONS` with labels); `ui/view-frame.ts` (`ViewFrame` service: insets signal + CSS vars); `FloorSceneApi.setFrame(insets)` and `SceneCommands` pass-through; new `ColouringState` API from D6 (`colourOpen`, `setColourOpen`, `highlight`, `active` removed); `SliderField` host class name `scrubbing` (documented, implemented by C). Fakes in tests updated.

**Phase 3: Build (parallel tracks)**
5. `frontend` A **Frame + shell**: owns `scene/camera-rig.ts`, `scene/floor-scene.ts`, `scene/scene-api.ts`, `scene/scene-commands.ts`, `viewport/*`, `designer.{ts,html,scss}`, `ui/dock.*`, `ui/tray.*`, `ui/estimate-summary.*`, `ui/viewport-status.*`, `ui/toast-host.scss`, `ui/first-visit.ts`, `ui/view-frame.ts`. D1-D5 shell parts: full-screen stage, inset measurement, tween, export without offset, dock/rail, tray with focus rules and scrub CSS, Escape handling, no-WebGL opens Estimate, inert when covered. Deletes `controls-sheet.*`, `tab-list.*`.
6. `frontend` B **Top bar + project**: owns `ui/view-toolbar.*`, new `ui/camera-menu.*`, `ui/projects-dialog.*`. D7 and D8.
7. `frontend` C **Sections**: owns `ui/sections/{room,floor,light,estimate}-section.ts`, `ui/sections/section.scss`, `ui/slider-field.*`, `ui/wood-picker.*`, `ui/finish-control.*`, `ui/format.ts`. Moves tabs to sections with essentials + `<details>` "More" per review 2.2; wood strip (one row, scrolls sideways, still a radio group); `scrubbing` class + value bubble; `touch-action`; F15 copy from the UX deltas; removes Reset from Estimate.
8. `frontend` D **Colour**: owns `state/colouring-state.ts`, `ui/sections/colour-section.*` (from `tabs/surfaces-tab.*`), `ui/surface-list.*` (What/Which rows), `ui/surface-model.ts`, `ui/swatch-group.*`, `ui/colour-announcer.ts`, `ui/colour-confirm*`, new `ui/colour-hint.ts`. D6: rows, strip, highlight fade, hint chip, announcements, "All walls" confirm and custom colour kept.
9. `frontend` E **Landing**: owns `src/app/landing/*`. D10 landing part (tokens from task 3).
10. `frontend` F **Plan editor phone**: owns `plan-editor/*`. D10 plan editor part; keeps the selection model, error chip, focus and reveal rules from `custom-room-shape.md`.

Tracks E and F do not depend on A-D and can start right after phase 1. B, C, D start after task 4.

**Phase 4: Test**
11. `tester`: migrate and add specs (table below); axe on: dock closed, each section open, Camera menu, Projects dialog with row menu, colour confirm, no-WebGL, plan editor (nothing / wall / card), landing (first visit, returning); keyboard paths for dock, tray, Escape; full suite + build + format.

**Phase 5: Review**
12. `code-reviewer`: diff review (no dead code from the deleted list, no new cycles, no signal writes in the render loop, effects cleaned up).
13. `ux-expert`: built-UI review at 320x568, 360x640, 390x844, 430x932, landscape 844x390, 1024x768, 1280x800, 1440x900 on the LAN dev server; 200%/400% zoom; TalkBack/VoiceOver smoke test. Fixes go back to the owning track, then task 11 again.

**Phase 6: Docs**
14. `ux-expert` adds "superseded by" notes to the old UX docs; `designer` confirms `design-system.md`; `architect` appends the final decisions (spike outcome).

## Test migration

| Spec | Action |
| --- | --- |
| `ui/controls-sheet.spec.ts`, `ui/tab-list.spec.ts` | Delete; new `ui/dock.spec.ts`, `ui/tray.spec.ts` (open/close/switch, aria-expanded, roving focus, Escape, focus to heading and back) |
| `ui/tabs/tabs.spec.ts`, `ui/tabs/surfaces-tab.spec.ts`, `ui/tabs/estimate-tab.spec.ts` | Move to `ui/sections/`; drop Colour mode and Reset cases; add "More" contents, What/Which rows |
| `ui/view-toolbar.spec.ts` | Remove colour toggle, Views and "?" cases; add Camera menu (presets, zoom, help, Escape returns focus) |
| `ui/projects-dialog.spec.ts` | Add Reset to defaults (current row only, Undo toast, focus return) |
| `designer.spec.ts` | Replace stop/tab cases with section state, first visit closed, no-WebGL opens Estimate, colour open = picking |
| `viewport/viewport.spec.ts` | Help text, `setFrame` forwarding, highlight from `ColouringState.highlight` |
| `scene/camera-rig.spec.ts` | Frame aspect in presets, view offset values, cleared offset with zero insets |
| new `scene/surface-picker` frame test | Pick through an offset camera hits the expected mesh |
| `ui/slider-field.spec.ts` | `scrubbing` class on pointer only, bubble, no change on keyboard |
| `ui/estimate-summary.spec.ts` | Dock button content and accessible name |
| `landing/landing.spec.ts` | "New project" label, pill navigates during intro |
| `plan-editor/*.spec.ts` | Action bar, card, overflow menu; drop expanded-panel cases |

## Accessibility

- axe 0 and WCAG AA: contrast of tray text over the translucent background is checked against the lightest floor and wall presets (designer token); the faded scrub state applies only while a pointer holds a thumb.
- Dock: toolbar of disclosure buttons (D3), not ARIA tabs; visible focus ring on the 3D-coloured background.
- Tray focus: activating a dock button that opens or switches the tray moves focus to the tray heading. Escape (from the tray, the canvas or the dock) or the close chevron closes the tray and returns focus to its dock button; a dock button that closes its own tray keeps focus. A 3D tap never moves focus. Focus never sits behind the dock or a toast (2.4.11): the tray scrolls the focused control into view; toasts sit above `--frame-bottom`.
- Targets >= 24 px with the 0.8 scale (35 px actual); text >= 11.2 px; labels at `--text-sm`.
- Live regions kept: estimate sentence (debounced), colour announcements, project announcements; the hint chip is announced once via the colour announcer.
- `inert` on stage, tray and dock while a dialog or the plan editor is open (as today).
- Reduced motion: no tray slide, no frame tween, instant scrub fade.

## Files

Create: `src/app/designer/ui/{section-id,view-frame,colour-hint}.ts`, `ui/dock.*`, `ui/tray.*`, `ui/camera-menu.*`, `ui/sections/*` (moved), `docs/ux/dock-redesign.md`, `docs/design/components/dock.md`.
Change: `scene/{camera-rig,floor-scene,scene-api,scene-commands}.ts`, `viewport/*`, `designer.*`, `_phone-scale.scss`, `src/styles.scss`, `ui/{view-toolbar,projects-dialog,slider-field,wood-picker,finish-control,estimate-summary,viewport-status,surface-list,surface-model,swatch-group}.*`, `ui/toast-host.scss`, `state/colouring-state.ts`, `plan-editor/*`, `landing/*`, `docs/design/design-system.md`, old UX docs (notes only).
Delete: see "Deleted".

## Risks / open questions

- **GPU cost:** the full-screen canvas renders up to about 2x the pixels of today's Half stop. Mitigation: existing DPR cap; the spike measures; fallback D1.
- **OrbitControls pan scale** uses `clientHeight` while the FOV maps to the frame height: panning is slightly faster with the tray open. Accept, or scale `panSpeed` by `fh / H` (spike decides).
- **Translucent tray contrast** over a bright floor; the designer may need a near-opaque tray at rest (translucency only while scrubbing).
- **iOS dynamic toolbar / keyboard:** insets use the layout viewport; the number keyboard may cover the tray's lower rows; the tray scrolls the field into view.
- **Big diff across many specs:** tracks have exclusive files and a frozen contract (task 4) to limit merge conflicts.

Open questions (recommended default first):
- Q1. Ship the plan editor phone rework (track F) in the same release? **Yes, as v0.3.0; it is the first thing cut to a follow-up if it slips** / separate release.
- Q2. In Colour, a tap on empty space (floor, window, sky): **keeps the current selection** / goes back to "All walls" (today's behaviour with the mode off).
- Q3. First visit: **tray closed, look-around hint toast only** / open the Floor section like today.
- Q4. Saved image framing: **room centred on the full canvas (offset cleared)** / exactly what is visible above the tray.
- Q5. Scrub fade with reduced motion: **instant fade, no transition** / no fade at all.

## Answers (user, 2026-10-23)

- Plan approved. The build starts after share + projects is fixed, reviewed and committed.
- Q1: the phone plan-editor rework ships in the same release (v0.3.0), and it's the first cut if it slips.
- Q2: in Colour, a tap on empty space keeps the current selection.
- Q3: first visit keeps the tray closed and shows only the look-around hint.
- Q4, Q5: defaults. The saved image is the room centred on the full canvas. With reduced motion, the slider fade happens instantly.
