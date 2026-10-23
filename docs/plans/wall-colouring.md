# Plan: Colouring mode (tap a surface in 3D, pick its colour)

Status: draft, awaiting user approval. Owner: architect. Date: 2026-10-23.
Builds on `docs/plans/floor-visualizer.md` and `docs/plans/custom-room-shape.md`. Their decisions still apply unless this plan replaces them.

## Goal

The user can turn on "Colour mode" in the 3D view. While it is on, tapping or clicking a surface selects and highlights it, and the controls sheet shows a palette for that surface. Each wall can have its own colour (accent walls). Each door, the skirting and the ceiling can be coloured too. Each palette is a curated set plus a custom colour. This works in Simple and Custom mode. Colours are saved with the design. A surface list in the Surfaces tab offers everything the 3D taps do, so keyboard and screen-reader users can do all of it without the 3D view.

**Done when:**
- Colour mode can be turned on and off. A tap selects the surface under the finger. A drag, pinch or two-finger pan never selects anything.
- The selected surface is highlighted in 3D. The PNG export never shows the highlight.
- Every wall, every door, the skirting and the ceiling can be coloured from a palette or the custom picker, in both modes.
- The Surfaces tab list does everything the 3D taps do. AXE reports 0 issues. WCAG AA holds.
- Colours survive a reload, mode switches and plan edits (split, merge, id compaction). v2 and v1 designs load unchanged.
- A colour change only updates materials. It never rebuilds geometry or the floor.
- `npm run test:ci`, `npm run build:pages` and `npm run format:check` pass.

## Decisions

### W1. Data model: base colours plus per-surface overrides
- The scene stays as it is today. The existing `wallColor` and `ceilingColor` are kept as the base. These fields are new in `Design`:
  ```ts
  skirtingColor: string | null;          // null = each skirting piece matches its wall (today's look)
  doorColor: string | null;              // null = auto (wood on light walls, white on dark, per the door's own wall)
  simpleWallColors: (string | null)[];   // exactly 4, index = simple outline edge (0 = window wall); null = base
  ```
- Custom-mode overrides live **inside the plan records**:
  - `PlanWall.color?: string`
  - `PlanOpening.color?: string` (doors only; sanitize drops it on windows).
- Why inside the plan: `compactIds()` renames ids, split and merge create and remove walls, and the editor's undo stack holds whole plans. Colours stored on the records follow every one of these for free. A separate id-keyed map would go stale.
- **Split** (`insertVertex`): the new second part copies the split wall's colour, so the room looks the same.
- **Merge** (`deleteVertex`): the merged wall keeps the first wall's colour, following the existing "first wall keeps its id" rule.
- **Deleted door or wall:** its colour goes with it. New walls and doors start at the base colour.
- `rectangleToPlan(room, simpleWallColors)` copies the 4 simple wall colours into the plan. This covers the first switch to Custom and the editor's "Start over".
- All colours are lowercase `#rrggbb` (the existing `HEX_COLOR` rule).

### W2. Surface identity
```ts
type SurfaceRef =
  | { kind: 'walls' } | { kind: 'wall'; id: string }
  | { kind: 'doors' } | { kind: 'door'; id: string }
  | { kind: 'ceiling' } | { kind: 'skirting' };
```
- `RoomShape` gets `wallIds: readonly string[]`, parallel to `outline` (wall i runs `outline[i] -> outline[i+1]`).
  - Custom mode uses the plan wall ids.
  - Simple mode uses the fixed ids `s0`..`s3`. They never collide with `ID_PATTERN`, and they stay stable when the rectangle is resized.
  - `roomShapesEqual` and `diffRoom` compare the ids too.
- Doors use the existing `ShapeOpening.id`.
- Labels follow the plan editor: "Wall N" and "Door N" in loop order. Simple mode adds "(window)" to wall 1. The UX spec owns the final copy.
- **Selection is UI state.** It is not persisted. It is cleared when its surface stops existing (a plan edit or a mode switch) and when Colour mode is turned off.

### W3. Resolved paint (pure, three-free, `plan/paint.ts`)
```ts
interface SurfacePaint {
  walls: Readonly<Record<string, string>>;     // wallId -> hex
  skirting: Readonly<Record<string, string>>;  // wallId -> hex (resolved "match walls")
  doors: Readonly<Record<string, string>>;     // opening id -> hex (resolved "auto")
  ceiling: string;
}
function resolvePaint(design: Design, shape: RoomShape): SurfacePaint;
function autoDoorColor(wallHex: string): string;   // today's doorColor() luminance rule, without three
function paintsEqual(a: SurfacePaint, b: SurfacePaint): boolean;
```
- `DesignState.paint = computed(() => resolvePaint(...), { equal: paintsEqual })`.
- Colours are **not** part of `RoomShape`, so changing a colour never triggers a shell rebuild.
- The scene falls back to the base colours for any id that is missing from the paint (this covers a frame where shape and paint arrive out of order).

### W4. State API (`DesignState`)
- `setSurfaceColor(ref: SurfaceRef, hex: string | null)` is the single entry point. It validates the hex. `null` means "back to the default" for walls, doors and skirting. For the ceiling, `null` is ignored.
  - `walls` sets `wallColor` and **clears every wall override in the active mode** (Q1).
  - `doors` sets `doorColor` (`null` = auto) and clears the door overrides.
  - `wall` / `door` write the override into `simpleWallColors` or into the plan record. They write the plan directly, with no `validatePlan` run, because geometry is untouched.
- `setWallColor` and `setCeilingColor` stay as thin wrappers so existing callers and tests keep working.
- **Undo/reset conventions are unchanged.** There is no per-edit undo, the same as for every other setting.
  - `reset()` restores the defaults, keeps the plan and **strips the plan's colour overrides**. This is consistent with "Reset resets everything except the shape".
  - The existing single-snapshot Undo restores everything.
  - Each surface's picker has a "Use default" option (Match walls / Auto / Same as other walls).

### W5. Storage v3
- `STORAGE_KEY = 'parket.design.v3'`.
- Load order: v3, then v2, then v1, then defaults. Every key goes through the same `sanitizeDesign`, and missing fields fall back to their defaults.
- v2 is read once as a migration source and never written again. v1 is unchanged.
- Sanitize treats every new field as hostile input:
  - Colours must be strings matching `HEX_COLOR` (the length check comes first). Anything else becomes `null` or absent.
  - `simpleWallColors` must be an array. Only its first 4 entries are read, and it is padded to 4.
  - `PlanWall.color` and `PlanOpening.color` are read in `plan-sanitize.ts` with the same test. On windows the colour is dropped.

### W6. Scene: per-surface materials
- **Materials.** `RoomBuilder` creates one `MeshStandardMaterial` per wall, one per skirting run of each wall, and one per door leaf, all on each shell rebuild. That is at most 32 + 32 + 32 materials. They share one shader program and are cheap to create.
  - Corner prisms use the material of the wall that starts at that corner.
  - Ceiling: one material, as today.
  - Window frames and door casings stay on the shared trim material (Q2).
- **Rejected alternatives.** Vertex colours would need attribute rewrites and make the highlight harder. A colour-keyed material cache would need mesh material swaps on every change.
- **Mesh tags.** Every pickable mesh gets `userData.surface: SurfaceHit`:
  - wall slab and corner prism: `{kind:'wall', id}`
  - skirting: `{kind:'skirting'}`
  - door leaf, handle and casing: `{kind:'door', id}`
  - ceiling: `{kind:'ceiling'}`
  - Glass, frames, subfloor, floor and sky are not tagged.
- **Paint updates.** `setPaint(paint)` stores the paint and sets a `paintDirty` flag. `syncScene()` applies it **after** any shell rebuild, by setting colours on the existing materials, then requests a render. No geometry is touched.
- **Highlight.** `setHighlight(ref | null)` sets an emissive tint on the selected surface's materials. The designer picks the colour and intensity so the tint is visible on both white and charcoal. `walls` and `doors` highlight all of them.
  - The highlight is static, so render-on-demand is kept and there is no pulsing loop.
  - An `EdgesGeometry` outline may be added in the build if the tint alone is too weak on white. Judge this in task 6.
  - `exportPng()` clears the highlight for its single render, then restores it.
- `FloorSceneApi`:
  - `setSurfaces(...)` is replaced by `setPaint(paint)`.
  - New `setPicking(on: boolean)` and `setHighlight(ref: SurfaceRef | null)`.
  - `SceneCallbacks` gains `onPick(hit: SurfaceHit | null)`.

### W7. Tap vs drag, raycasting
- **Tap detection.** A pure `scene/tap-detector.ts` makes the decision. FloorScene feeds it `pointerdown`, `pointermove`, `pointerup` and `pointercancel` events from the canvas. The listeners are passive, so OrbitControls is unaffected. A tap needs all of the following:
  - exactly one active pointer the whole time (a second pointer cancels);
  - the primary button for a mouse;
  - movement of at most 8 CSS px;
  - at most 500 ms between down and up.
  - A pinch, a pan, a drag or a long press is never a tap.
- **Raycast.** The tap is raycast only when picking is on, once per tap and never per frame.
  - The `Raycaster` uses the canvas rect to get NDC and `rig.camera` with its matrices from the last render. It tests only the tagged meshes, with `recursive` off on a flat list kept by RoomBuilder.
  - The first tagged hit is reported. Glass is not in the list, so a tap through a window reaches the sky (no hit).
  - The ceiling is `FrontSide`, so from the top view a tap passes through it, which matches what the user sees.
  - A miss (floor, window, sky) reports `null`, and the selection is cleared.
- **Render loop.** The render loop never raycasts and never reads signals. A pick calls `callbacks.onPick` synchronously. The Viewport turns the hit into a `SurfaceRef` and sets the selection, and the highlight effect then calls `setHighlight`, which requests one render.
- **Cursor.** The canvas cursor becomes `pointer` while picking is on. There is no hover highlight, because it would cost a raycast on every move.

### W8. UI
- **`ColouringState`** (root `@Service`, `state/colouring-state.ts`):
  - `active` signal and `selected` signal of `SurfaceRef | null`;
  - `lastTap` counter, so the designer can react to selections made in 3D;
  - `setActive`, `select(ref, source: 'tap' | 'list')`, `clear()`.
  - It is not persisted, and Colour mode is off on every visit.
- **Toggle.** A "Colour" toggle button (`aria-pressed`) goes in the view toolbar, next to the Views controls, where the taps happen. It also goes into the phone "Views" popover.
  - Turning it on opens the sheet to Half on the Surfaces tab, with the hint "Tap a wall, door, skirting or the ceiling."
  - Escape (with focus in the stage) or a second press turns it off.
  - While the 3D view is unavailable it is `aria-disabled`, the same as the other view tools.
- **A tap selection** (`source: 'tap'`) switches the sheet to the Surfaces tab and moves it from Peek to Half. A polite live region announces "Wall 3 selected".
- **Surfaces tab** (rewritten):
  - **Surface list.** A radio group, with a colour chip on each item:
    - All walls, Wall 1..n
    - Ceiling, Skirting
    - All doors, Door 1..m (in Simple mode there are no doors, so the door section is hidden)
  - Picking an item in the list selects it and highlights it in 3D, even with Colour mode off. This gives sighted keyboard users the same feedback.
  - **Palette.** Below the list is the palette for the selected surface. The existing `SwatchGroup` gains an optional "default" swatch (`defaultLabel` input, emits `null`).
  - Leaving the Surfaces tab clears the selection (owned by the designer).
- **Palettes** go in `state/palettes.ts`. The designer chooses names and hexes, about 8-12 per set:
  - `WALL_PAINTS`, also used for the ceiling (whites first);
  - `DOOR_COLOURS` (wood tones plus painted white, grey and black);
  - `SKIRTING_COLOURS` (white, warm white, wood, black).
  - The custom colour is the existing `<input type="color">` in `SwatchGroup`.

## Tasks

Owners: `ux` = ux-expert, `designer`, `frontend` A/B/C = up to three frontend-dev instances in parallel, `tester`, `review` = code-reviewer.

**File ownership:**
- Track A owns `plan/*` and `state/*`, except `state/colouring-state.ts` after task 3.
- Track B owns `scene/*` and `viewport/*`.
- Track C owns `ui/*`, `designer.ts|html|scss` and `state/colouring-state.ts`.

The contract files from task 3 are frozen after task 3. Changes go through the main session.

### Phase 1: Spec + contracts (parallel)
1. `ux`: write `docs/ux/wall-colouring.md`. It covers:
   - toggle placement and states, and the tap flow on phone and desktop;
   - sheet behaviour on a tap, list structure and labels, the "Use default" copy per surface;
   - live-region messages, the empty or unavailable states (no WebGL, Simple mode without doors);
   - focus order, and how this fits the Surfaces tab.

   Done: every W8 action has a touch, a mouse and a keyboard/screen-reader path, plus copy.
2. `designer` (after a draft of 1):
   - curated palettes (names and hexes) and the highlight tint (colour and intensity, readable on white and on charcoal);
   - the toggle's pressed style and the list row with its colour chip;
   - tokens go in `src/styles.scss` and `docs/design/design-system.md`, with contrast documented.

   Done: palettes are listed in the design doc, and 3:1 holds for the chips' borders and the toggle states.
3. `frontend` A (parallel with 1-2), contracts:
   - `plan/paint.ts`: types (`SurfaceRef`, `SurfaceHit`, `SurfacePaint`) plus stub signatures;
   - `RoomShape.wallIds` in `plan/room-shape.ts`;
   - `color?` on `PlanWall` and `PlanOpening` in `plan-model.ts`;
   - the new `Design` fields (W1);
   - the `FloorSceneApi` / `SceneCallbacks` changes in `scene/scene-api.ts`;
   - `state/colouring-state.ts` in full (it is small).

   Done: the app compiles, with stubs where needed, and the existing tests still pass.

### Phase 2: Build (parallel after task 3)
4. `frontend` A, model and storage:
   - `resolvePaint`, `autoDoorColor`, `paintsEqual`;
   - `toRoomShape` fills `wallIds`, and `roomShapesEqual` compares them;
   - in `plan-edit.ts`: `insertVertex` copies the colour, `deleteVertex` keeps the first wall's colour, and `rectangleToPlan` takes `simpleWallColors`;
   - `plan-sanitize.ts` reads the colours (and `compactIds` keeps them);
   - `design-defaults.ts`: new fields, keys v3 and v2;
   - `design-state.ts`: the sanitizer, v3 → v2 → v1 loading, `paint`, `setSurfaceColor`, and `reset` stripping the plan colours.

   Done: the W-tests in the list below pass for track A.
5. `frontend` B, scene:
   - per-surface materials, tags and `setPaint` in `room-builder.ts` and `materials.ts` (`doorColor` moves to `plan/paint.ts` as `autoDoorColor`);
   - `scene/tap-detector.ts` (pure) and `scene/surface-picker.ts` (raycast over the tagged list);
   - `floor-scene.ts`: listeners, `setPicking`, `setHighlight`, `paintDirty` in `syncScene`, and export without the highlight;
   - `room-change.ts` compares `wallIds`.

   Done: recolouring 32 walls does not create a new geometry; there are no material leaks after 20 rebuilds (count the materials disposed); a tap selects and a drag does not.
6. `frontend` B, `viewport/viewport.ts`:
   - the effects for `paint`, `ColouringState.active` → `setPicking`, and `selected` → `setHighlight`;
   - `onPick` → `SurfaceRef` → `select(ref, 'tap')`;
   - clear the selection when its surface no longer exists in `roomShape`;
   - an aria-description that mentions Colour mode while it is on.

   Done: the viewport spec with the fake scene passes. Also check the highlight visually on white and charcoal walls.
7. `frontend` C, UI:
   - the toolbar toggle (inline and in the popover);
   - a new `ui/surface-list.ts`;
   - the rewritten `ui/tabs/surfaces-tab.ts`;
   - the `SwatchGroup` default swatch;
   - the live region;
   - in `designer.ts`, react to `lastTap` (tab + Half) and clear the selection on a tab change;
   - Escape handling.

   Done: matches the UX spec, and the component specs pass.

### Phase 3: Verify
8. `tester`:
   - complete the tests below, then run `test:ci`, `build:pages` and `format:check`;
   - manual devices: iOS Safari, Android Chrome and desktop. Check tap vs orbit, vs pinch and vs two-finger pan; a tap through a window; the top view through the ceiling; an L-shape with 2 doors; split and merge a coloured wall in the editor, then go back; reload; the PNG without the highlight.

   Done: all green.
9. `review`: check sanitize hardening, material disposal, no signal reads or raycasts in the render loop, and that the listeners are removed on dispose. `ux`: review the built UI against the spec. Done: issues fixed and re-tested.

## Tests
- **State and model (A):**
  - fuzz the new fields: non-strings, `#fff`, `#12345g`, 1 MB strings, arrays longer than 4 or not arrays, a colour on a window;
  - v2 → v3 migration (no colours → defaults, the look is unchanged), v3 wins over v2, and v1 still loads;
  - split copies the colour, merge keeps the first wall's colour, and `compactIds` keeps the colours;
  - `rectangleToPlan` copies the simple colours;
  - `setSurfaceColor` for every `SurfaceRef` kind in both modes, including that `walls` clears the overrides of the active mode only;
  - `reset` strips the plan colours and keeps the shape, and Undo restores them;
  - `resolvePaint`: auto door per its wall, skirting that matches the walls, a missing id falls back;
  - `roomShapesEqual` compares `wallIds`.
- **Scene (B, jsdom-safe parts):**
  - `tap-detector` table tests: threshold, the time limit, a second pointer, right button, `pointercancel`;
  - mapping a hit mesh to a `SurfaceHit`;
  - `diffRoom` with changed ids;
  - RoomBuilder material count and tags for a sample shape (no WebGL needed: geometry and materials only).
- **Viewport (B):** the fake scene gets `setPaint`, `setPicking` and `setHighlight` at the right times; `onPick` with `null` clears the selection; the selection clears after a plan edit removes its wall.
- **UI (C):**
  - list items per mode; radio semantics and labels; a palette pick calls `setSurfaceColor`; the default swatch emits `null`;
  - `aria-pressed` on the toggle; a tap selection opens the Surfaces tab at Half; a live-region message;
  - Escape turns the mode off.

## Files

**Create:**
- `src/app/designer/plan/paint.ts` (+spec)
- `src/app/designer/state/palettes.ts`
- `src/app/designer/state/colouring-state.ts` (+spec)
- `src/app/designer/scene/tap-detector.ts` (+spec)
- `src/app/designer/scene/surface-picker.ts`
- `src/app/designer/ui/surface-list.ts` (+spec)
- `docs/ux/wall-colouring.md`

**Change:**
- `plan/plan-model.ts`, `plan/room-shape.ts`, `plan/plan-edit.ts`, `plan/plan-sanitize.ts` (+specs)
- `state/design-defaults.ts`, `state/design-state.ts` (+specs, `design-migration.spec.ts`)
- `scene/scene-api.ts`, `scene/floor-scene.ts`, `scene/room-builder.ts`, `scene/materials.ts`, `scene/room-change.ts` (+specs)
- `viewport/viewport.ts` (+spec)
- `ui/tabs/surfaces-tab.ts`, `ui/swatch-group.ts|html|scss`, `ui/view-toolbar.ts|html|scss` (+specs)
- `designer.ts|html`
- `src/styles.scss`, `docs/design/design-system.md`

## Risks
- **Highlight visibility.** An emissive tint on a near-white wall can wash out after tone mapping. The designer's values plus the optional edges outline mitigate this; verify in task 6.
- **Tap vs OrbitControls on iOS.** Make sure passive listeners still get `pointerup` after OrbitControls captures the pointer, and that damping after a flick never counts as a tap (movement cancels the tap).
- **Contract change to `RoomShape`** touches every consumer of the fake shapes in specs (camera, lighting, wall layout). It is mechanical, but do it in task 3 so the tracks start green.
- **Material count.** Up to about 100 materials on the largest room. They share programs, so this should be fine; check the frame time at the limits.
- **Editor interplay.** The editor commits whole plans. Colours ride along because the editor starts from `state.plan()`, and colours cannot change while the editor is open (the designer is inert).

## Open questions (recommended default first)
- **Q1. Setting "All walls" when some walls have their own colour:** paint every wall and clear the accent walls (recommended, it is what "all" means; Reset/Undo is not involved) / keep the accent walls and change only the walls without their own colour.
- **Q2. What a door colour paints:** the door leaf only, with the casing staying white like the window frames (recommended) / the leaf and its casing.

## Answers (user, 2026-10-23)

- Plan approved.
- **Q1:** If some walls have their own colour, picking a colour for "All walls" first asks the user to confirm that every wall colour will change. Use an in-app confirm, not a browser dialog. On confirm, every wall gets the colour and the accent walls are cleared. On cancel, nothing changes. With no accent walls, apply right away with no confirm.
- **Q2:** A door colour paints the door leaf AND its frame/casing. The window frames are unchanged.
