# Plan: Custom room shape with a 2D plan editor

Status: draft, awaiting user approval. Owner: architect. Date: 2026-10-22.
Builds on `docs/plans/floor-visualizer.md` (D1-D11 still apply unless replaced here).

## Goal

Next to the current "Simple rectangle" room, the user can switch to "Custom shape". This opens a full-screen 2D plan editor where they draw one room of any outline (L, T, angled walls). They drag corners and whole walls, type exact wall lengths, and place doors and windows on walls with exact sizes. The 3D view, the estimate and the PNG export use the active mode. The sun shines through the windows the user placed. Both modes are saved in localStorage independently, so switching back and forth never loses the custom shape. Existing saved designs keep working.

**Done when:**
- The mode toggle in the Room tab works. Custom mode starts as a copy of the current rectangle, including its window.
- The editor at `/designer/plan` is its own lazy chunk with no three.js in it. It supports every editing action below on a phone (touch), with a mouse and with the keyboard alone, and AXE passes.
- Invalid shapes cannot be produced, neither by editing nor from tampered storage.
- 3D shows the polygon walls with real openings, frames, glass, skirting with gaps at doors, and planks clipped exactly to the polygon. The camera stays inside the room. The sun patch enters through the user's windows.
- The estimate uses the polygon area.
- v1 designs load unchanged.
- Geometry and edit operations have unit tests.
- `npm run test:ci`, `npm run build:pages` and `npm run format:check` pass.
- Perf targets from the floor-visualizer plan hold at the limits.

## Decisions

### C1. One rendering path: everything is a polygon
- The scene stops knowing about `Room {length,width,height}`. It receives a `RoomShape`: an inner outline polygon, a height and a list of openings (contract in C11).
- Simple mode is converted to a 4-vertex `RoomShape` with the existing fixed window (`windowFor`, moved out of `room-builder.ts` into the three-free `plan/` code). Custom mode is converted from the `Plan`.
- This gives one code path for walls, floor clipping, camera and sun, so we do not maintain two builders. The rectangle is just the simplest polygon.

### C2. Data model (`plan/plan-model.ts`)
```ts
type Vec2 = { x: number; y: number };                   // metres
interface PlanVertex  { id: string; x: number; y: number }
interface PlanWall    { id: string; from: string; to: string }          // vertex ids
interface PlanRoom    { id: string; wallIds: string[]; height: number }  // closed loop
interface PlanOpening {
  id: string; wallId: string; kind: 'door' | 'window';
  offset: number;  // metres along the wall's inner face, from its `from` corner to the opening's near edge
  width: number; height: number;
  sill: number;    // bottom above floor; always 0 for doors
  anchor: 'floor' | 'ceiling';   // windows: which gap stays fixed (C4); doors: 'floor'
}
interface Plan { vertices: PlanVertex[]; walls: PlanWall[]; rooms: PlanRoom[]; openings: PlanOpening[]; nextId: number }
```
- **Units:** metres, stored rounded to 1 mm (0.001). The grid snap is 0.1 m.
- **Axes:** plan `x` is right and `y` is down. This is the same as SVG, and it maps 1:1 to scene `(x, z)`, which is also the top-down view orientation. Plan `y = 0` is the scene `-z` side (the side the sun comes from at azimuth 180).
- **Winding:** each room loop has a positive shoelace area in plan coordinates. That is counter-clockwise in a y-up frame and looks clockwise on screen. The outward normal of the edge `a->b` is `normalize(dy, -dx)`. Sanitize and edits normalise the winding (reverse if negative).
- **Coordinates are the inner face of the walls** (what you measure with a tape inside the room). Wall thickness is a scene constant (0.15 m) and grows outward.
- **Ids:** short strings `v12`, `w12`, `o12` from a per-plan counter `nextId`. They are deterministic and testable, with no `crypto` needed. Ids are stable across edits:
  - Splitting wall `w` at a new corner keeps `w` for the first part and gives the second part a new id. Its openings move to whichever part contains them.
  - Deleting a corner merges two walls into the first one. Openings of the second wall have the first wall's old length added to their offset, then they are re-fitted.
- **Multi-room later:** the graph (vertices + walls + rooms as wall loops) already allows shared walls (one wall in two loops) and interior walls (a wall in no loop). Today sanitize and validation enforce **exactly one room whose loop uses every wall**. Lifting that restriction is a later change (v3) with no format break for the vertex, wall and opening records.
- Per-wall thickness, per-room floors, and doors that swing are explicitly not modelled now.

### C3. Validation (`plan/plan-validate.ts`, pure, returns `PlanError[]`)
| Rule | Limit |
| --- | --- |
| Corners per room | 3 to 32 |
| Wall length (inner face) | >= 0.30 m, and long enough for its openings (sum of widths + gaps + corner margins) |
| Interior angle | 30° to 330°. 180° is allowed (a corner in the middle of a straight wall). Sharper angles make huge mitres. |
| Self-intersection | No two non-adjacent walls intersect or touch. Adjacent walls do not fold back onto each other (collinear overlap). |
| Clearance | Non-adjacent walls are at least 0.30 m apart (no slivers; the camera and skirting stay sane) |
| Size | Bounding box at most 20 x 20 m. Area 2 to 144 m². The 144 m² cap keeps the worst-case plank count at about 15k, as today. |
| Door | Width 0.60-2.40 m, height 1.80 m to (room height - 0.05) |
| Window | Width 0.30-4.00 m, height 0.30 m to (room height - 0.10), sill 0 to (room height - height - 0.05) |
| Opening placement | At least 0.05 m from both corners of its wall. Openings on the same wall do not overlap horizontally and keep a gap of at least 0.05 m (this applies to door/door, window/window and door/window alike; no transom windows above doors). |
| Openings total | At most 32 |

- Error codes, not strings: `self-intersection`, `wall-too-short`, `angle-too-sharp`, `walls-too-close`, `too-many-corners`, `too-large`, `area-out-of-range`, `opening-does-not-fit`, `openings-overlap`. UX maps them to copy.
- Cost is O(n²) segment checks with n <= 32, cheap enough to run on every pointer move.

### C4. Opening behaviour
- **Window sill vs distance from ceiling:** `sill` is stored, and the gap from the ceiling is derived (`height_room - sill - height`). The UI shows both fields, and editing either one sets `anchor` to that side:
  - When the window height or the room height changes, the anchored gap stays fixed and the other gap absorbs the change, clamped to the limits.
  - The default anchor is `floor`.
- **When a wall gets shorter:** openings keep their distance from the wall's `from` corner. If they would overrun the far end, they are pushed back toward the start in order (packed with the minimum gaps). Openings are **never shrunk or deleted automatically**. If they cannot fit, the edit is refused: the drag stops at the last valid position and a typed length clamps, with the message "Too short for its door/window" (UX copy). No silent data loss.
- **Room height lowered:** windows re-anchor as above, and doors clamp their height. If something still cannot fit, the height slider minimum is raised (dynamic min, like the plank rule).

### C5. Edit operations (`plan/plan-edit.ts`, pure, each returns `EditResult`)
```ts
type EditResult = { ok: true; plan: Plan } | { ok: false; errors: PlanError[] };
moveVertex(plan, vertexId, to: Vec2, snap: SnapOptions): EditResult
moveWall(plan, wallId, distance: number, snap: SnapOptions): EditResult   // along the outward normal
setWallLength(plan, wallId, length: number, keep: 'start' | 'end'): EditResult
insertVertex(plan, wallId, at: number): EditResult                       // metres from `from`
deleteVertex(plan, vertexId): EditResult
addOpening(plan, wallId, kind, at?: number): EditResult                   // defaults: door 0.90 x 2.10, window 1.20 x 1.40 sill 0.90
updateOpening(plan, openingId, patch: Partial<OpeningFields>): EditResult
removeOpening(plan, openingId): Plan
setPlanHeight(plan, height: number): EditResult
rectangleToPlan(room: Room): Plan                                         // used by the first switch to Custom
type SnapOptions = { grid: boolean; angle: boolean; tolerance: number }   // tolerance in metres (screen px / zoom)
```
- **Move wall:** the wall moves parallel to itself. Its endpoints slide along the lines of the neighbouring walls (line intersection), so the neighbours keep their direction (CAD "push/pull"). If a neighbour is nearly parallel (within 5°), that endpoint is just translated.
- **Set length:** the end opposite `keep` moves along the wall direction, and the next wall is pushed parallel (same rule as move wall). In a rectangle, setting the bottom wall to 6 m makes the top wall 6 m too. Default `keep: 'start'`. UX may expose a "keep left/right end" choice.
- **Snapping (both toggleable, default on):** the grid snap rounds to 0.1 m on the plan grid anchored at plan (0, 0). The angle snap turns each wall next to the dragged element to the nearest multiple of 90° when within 5°, which in practice aligns x/y with the neighbouring corners. Typed values are never snapped.

### C6. Mode and persistence
- `Design` (v2) = the v1 fields + `mode: 'simple' | 'custom'` + `plan: Plan | null`.
  - `room` stays the simple-mode rectangle.
  - Floor, surfaces, light and waste are shared by both modes (Q1).
  - The ceiling height is per mode: `room.height` for simple, `plan.rooms[0].height` for custom.
- **Storage key `parket.design.v2`.** Load order is v2, then v1 (passed through the existing `sanitizeDesign`, then `mode: 'simple', plan: null`), then defaults. v1 is never written again and is left in place (about 0.5 kB, allows a rollback).
- **First switch to Custom:** `plan = rectangleToPlan(room)`, including the fixed window as a real window opening. After that, switching modes just flips `mode`; both rooms stay saved.
- **Sanitising a stored plan (`plan/plan-sanitize.ts`)** treats it as hostile:
  - Check the shape of the data. Array lengths are capped before iterating. Ids must match `/^[vwo]\d{1,6}$/` and be unique. References must resolve. The walls must form one closed loop with the room using all of them.
  - Numbers must be finite. They are rounded to mm and clamped to +-50 m.
  - Fix the winding, then run `validatePlan`.
  - Bad openings are dropped one by one. If the geometry itself is invalid, `plan = null` and `mode = 'simple'`. This is silent, as the UX spec already says for invalid storage.
- **Editor writes:** the editor commits to `DesignState.setPlan(plan)` once per finished gesture (pointerup, a committed input, a button). This means there are no 3D rebuilds or storage writes per pointer move, and the work survives a killed phone tab. There is no Cancel: the editor has its own undo/redo stack (in memory, 50 plans, cleared on close).
- **Reset design** (Q2, default): resets the shared settings and the simple room to defaults and sets `mode = 'simple'`, but **keeps `plan`**. The existing single-snapshot Undo still restores everything. The editor offers its own "Start over from rectangle" action (undoable in the editor).

### C7. 2D editor: architecture (details for the ux-expert)
- **Child route** `designer/plan` (`loadComponent`, lazy), rendered through a `<router-outlet>` in `designer.html` as a full-screen overlay above the live designer.
  - The WebGL scene stays alive, and the Android/browser back button closes the editor.
  - The route redirects to `/designer` when `mode !== 'custom'`.
  - While it is open, the designer's `main` and the sheet are `inert`.
  - Load failure reuses the `load-error` pattern.
- **SVG, not canvas.**
  - There are at most 32 corners, 32 walls and 32 openings plus labels, so the DOM size is trivial.
  - SVG gives crisp lines and text at any zoom, hit testing per element, CSS tokens for colours, focusable elements for the keyboard, and it is testable in jsdom.
  - Canvas would need its own hit testing and a separate accessibility layer.
- **Pan/zoom** through the `viewBox`, with the math in a pure `view-transform.ts` (screen to plan, zoom about a point, fit to the shape). Zoom is clamped to 0.5-20 m visible width.
- **Gestures** (Pointer Events + `setPointerCapture`, `touch-action: none` on the SVG):
  - one finger on empty space pans; two fingers pinch-zoom and pan; the mouse wheel zooms;
  - dragging a corner handle moves it; dragging a wall body moves the wall parallel; a tap selects;
  - a "+" ghost handle at each wall's midpoint adds a corner when tapped, which avoids a tap-on-wall conflict with selection;
  - delete and add-door/window actions sit in a toolbar or the selected item's panel, not behind a long-press (long-press is undiscoverable; UX may add it as a shortcut).
- **Hit targets:** handles are drawn at a constant screen size (radius scaled by 1/zoom), with a hit area of at least 44 px, and invisible 44 px strokes over the walls.
- **Live feedback:** the inner length of each wall is shown along the wall, along with the total area and wall count. During an invalid drag the shape stays at the last valid state and a short reason chip shows (the error code mapped to copy).
- **Keyboard and accessibility alternatives** (WCAG 2.5.7):
  - Corners, walls and openings are focusable SVG elements (`role="button"`, a descriptive `aria-label`). Arrows nudge by 0.1 m (Shift 0.01 m), and Delete removes.
  - A panel lists Walls (with length, and doors/windows per wall), Corners (x/y number inputs) and the selected item's form: wall length plus which end to keep, add door/window, opening width/height/offset/sill/top gap.
  - Every edit is possible from that panel without the SVG.
  - Changes are announced in a polite live region.
- The editor imports only `plan/*`, `state/*` and Angular. It does **not** import `scene/*` or `three`, so its chunk stays small.

### C8. Geometry library: own code, no dependency (`plan/polygon.ts`)
- Functions: `signedArea` (shoelace), `perimeter`, `bbox`, `pointInPolygon` (even-odd, with an explicit on-edge rule), `segmentsIntersect` (with collinear/touching cases), `closestPointOnSegment`, `distanceSegmentSegment`, `offsetPolygon` (miter offset, used for the outer wall face and the skirting inset; safe because C3 bans sharp angles and slivers), `rectIntersectsPolygon` (oriented plank rectangle vs polygon), `clampPointInside(p, polygon, margin)` (camera), `interiorPoint` (a pole-of-inaccessibility approximation for L/U shapes where the centroid lies outside).
- About 300 lines and fully unit-testable.
- `polygon-clipping` or `clipper2` would only be needed for CPU clipping of planks, which C9 avoids. Both add 15-60 kB and solve a bigger problem than we have.

### C9. Clipping planks to an arbitrary polygon: stencil mask
| Option | Realism | Phone perf (~15k instances) | Estimate | Verdict |
| --- | --- | --- | --- | --- |
| Clipping planes (today) | Exact, but only for convex shapes (planes intersect) | Free | - | Fails on L/T shapes |
| Convex decomposition + planes per part | Exact | Draw calls x parts, duplicate instances on seams | - | Complex |
| CPU polygon clipping of the ~1k boundary planks into merged non-instanced meshes | Exact, real cut faces | Rebuild per angle-slider frame, new buffers | Exact cut-piece count possible | Heavy for live rotation; worth it only for a "pieces incl. cuts" feature later |
| Skirting cover only | Planks poke past walls (visible from the top view and through doors/windows) | Free | - | Not enough |
| **Stencil mask** | Exact for plank tops (they lie in the mask plane); sides at the cut are hidden by the skirting and door thresholds | +1 draw call, no CPU work per frame | Unchanged (area based) | **Chosen** |

- The renderer is created with `stencil: true`. The mask mesh (inner polygon, `ShapeGeometry`, at the plank top height, `renderOrder -1`, `colorWrite/depthWrite/depthTest false`) writes stencil 1. The floor material sets `stencilWrite: true`, `stencilFunc: EqualStencilFunc`, `stencilRef: 1`. `wallClippingPlanes` and `localClippingEnabled` are removed.
- The herringbone generator still culls by CPU: it walks the lattice over the polygon's bounding box and drops planks that do not touch the polygon (bbox test first, then `rectIntersectsPolygon`). The instance count stays proportional to the area.
- `PatternBounds` becomes `{ outline: readonly Vec2[] }`. The pattern rotates about the bbox centre, which is the scene origin (C11).
- Doorways get a thin wooden threshold strip over the cut line, so the floor ends cleanly between the jambs.

### C10. 3D construction (no CSG)
- **Walls:** for each edge, `ExtrudeGeometry` of the wall's elevation (a `Shape` of inner length x height, with every opening as a `Path` hole), depth = thickness, placed on the inner face and extruded outward. This is today's window-wall technique, and the extrusion gives the jamb/reveal faces for free.
  - Convex corners get a corner prism (inner corner, two outer offset points, the mitre point) to close the wedge.
  - At reflex corners the extrusions overlap outside, which is harmless.
- **Ceiling and subfloor:** a `ShapeGeometry` (triangulated by `ShapeUtils`) of the outer offset polygon, so the shell is light-tight for the sun. The ceiling keeps the one-sided material with `shadowSide = DoubleSide`.
- **Skirting:** per wall, a strip between the inner edge and its 14 mm inset (mitred by `offsetPolygon`), extruded 70 mm, split at doors and at windows whose sill is below 0.08 m.
- **Window:** a frame (4 bars), a sill board, one mullion/transom only when the window is wider or taller than 1.0 m, and glass as a thin quad (`MeshPhysicalMaterial`, no transmission, opacity about 0.12, low roughness, `castShadow false`).
- **Door:** an open doorway with a casing (3 bars), a threshold strip, and a short dim "hallway" box (wall material, 1 m deep) behind it so you do not look out into the sky (Q3).
- **Outside:** the single sky plane becomes a large back-side sky sphere with the same gradient texture, so the view is right through any window in any direction.
- **Scene origin:** `toRoomShape` centres the outline on its bbox centre, so presets, the shadow frustum and the pattern pivot keep working around (0, 0).

### C11. Scene contract (`plan/room-shape.ts`, three-free)
```ts
interface ShapeOpening { kind: 'door' | 'window'; wall: number; start: number; end: number; bottom: number; top: number }
// `wall` = index i of edge outline[i] -> outline[i+1]; start/end in metres along the inner face from outline[i].
interface RoomShape { outline: readonly Vec2[]; height: number; openings: readonly ShapeOpening[] }
function toRoomShape(design: Design): RoomShape   // active mode; centred on the bbox centre, positive area
function windowFor(room: Room): ...               // moved here from room-builder.ts
```
- `FloorSceneApi.setRoom(room: Room)` becomes `setRoom(shape: RoomShape)`. `DesignState` exposes `roomShape = computed(() => toRoomShape(design))` (structurally memoised: a new object only when the values change).
- `RoomBuilder`, `FloorBuilder`, `Lighting` and `CameraRig` all take a `RoomShape`.

### C12. Camera
- **Clamp:** `clampPointInside(position, outline, 0.25)`.
  - If the position is outside or within the margin of an edge, it is projected to the nearest edge point plus the inward normal x the margin. This is iterated twice to handle corners.
  - If no valid point is found (a very narrow notch), the camera stays at the last valid position.
  - The target is clamped to the outline without a margin. The top-down "elevated" rule is unchanged.
- **Presets** (pure `presetPose(name, shape, aspect)`):
  - *Corner:* the convex corner farthest from `interiorPoint`, at eye height, 0.35 m in along the corner bisector, looking at `interiorPoint`.
  - *Doorway:* just inside the first door, looking across to `interiorPoint`. Without doors, the middle of the longest wall.
  - *Top:* fits the bbox, as today.

### C13. Sun
- The azimuth range becomes **0-359 in both modes**. Old values (90-270) stay valid.
- The Light tab shows a hint when no window faces the sun: `sunHitsWindow(shape, azimuth)` is true when some window's outward normal · the horizontal sun direction > 0.15. Example hint: "The sun is behind the walls. Turn it towards a window."
- The helper "180 = straight through the window" is dropped.
- The shadow camera fits the outer polygon's bbox (centre plus a radius from the bbox diagonal and the height). The shadow map size is unchanged. Walls, corner prisms, frames and the ceiling cast shadows; glass does not.

### C14. Calculator
- `estimate(area, plank, waste)` now takes the area directly, and the area is `signedArea(shape.outline)` for both modes. The formulas are otherwise unchanged.
- Optional (Q4): `skirtingLength = perimeter - sum(door widths)` in metres, shown in the Estimate tab.
- The assumptions text says "Estimate for the floor area of your room", replacing "rectangular room".
- The PNG filename is unchanged.

### C15. Bundle and performance
- New lazy chunk `plan-editor` with no three. Target under 60 kB raw.
- `plan/*` is shared by the designer and editor chunks, and the CLI splits it automatically.
- Herringbone generation for an L-shape at the 144 m² cap with 300 x 40 mm planks must stay under 16 ms on desktop and under 40 ms on a mid-range phone (it is measured).
- Rebuilding the room takes about 32 extrusions and only happens on a committed edit.

### C16. Testing strategy
- **Geometry (critical, `plan/*.spec.ts`)**:
  - Write table tests and seeded random tests with `scene/random.ts`; there is no fast-check dependency.
  - Area/winding cases: a square, an L, and a reversed winding.
  - Point in polygon on edges and vertices.
  - Segment intersection: collinear overlap, touching endpoints, parallel.
  - Self-intersection: a bow-tie, and one corner dragged across a wall.
  - Offset: convex and reflex corners, and an angle at the 30° limit.
  - `clampPointInside` in an L notch.
  - `rectIntersectsPolygon` with a plank fully inside, crossing, fully outside the concave notch, and containing a polygon vertex.
- **Edit ops**:
  - Every op keeps `validatePlan(plan) == []`.
  - Openings are pushed but never lost.
  - Ids stay stable on split and merge.
  - A refused edit returns errors and leaves the input plan unchanged.
  - Push/pull keeps the neighbours' directions.
  - Set length on a rectangle keeps it rectangular.
  - The window anchor rules.
- **Sanitize/migration:**
  - Fuzz with garbage: NaN, huge arrays, duplicate or dangling ids, a self-intersecting loop, the wrong winding.
  - A v1 to v2 round-trip; v2 wins over v1.
  - `mode = custom` with a bad plan falls back to simple.
- **Pattern:** in an L-shape, every sample point inside the polygon is covered by a plank, and no emitted plank lies fully outside.
- **Scene (jsdom, no WebGL):** pure parts only. `toRoomShape`, the wall/skirting segment layout (export a pure `wallLayout(shape)`), presets inside the polygon, and `sunHitsWindow`. The viewport test uses the fake scene with `setRoom(RoomShape)`.
- **Editor components:** keyboard nudge and delete; panel inputs commit through `setPlan`; undo/redo; the route guard; AXE-relevant attributes (labels, live region).
- **Manual (tester):** on iOS Safari, Android Chrome and desktop, test drag, pinch, back button, an L-shape plus a 45° wall, the sun through a window on each side, the top view showing no planks outside, and perf at the limits.

## Tasks

Owners: `ux` = ux-expert, `designer`, `frontend` = frontend-dev (up to three instances in parallel: tracks A, B, C), `tester`, `review` = code-reviewer. No backend or devops work.

**File ownership (avoids collisions):**
- Track A owns `plan/*`, `state/*` and `calc/*`.
- Track B owns `scene/*`, `patterns/*` and `viewport/*`.
- Track C owns `plan-editor/*`, `ui/*`, `designer.html|ts|scss` and `app.routes.ts`.

The contract files from task 3 are frozen after that task. Changes to them go through the main session.

### Phase 1: Spec + contracts (parallel)
1. `ux`: write `docs/ux/custom-room-shape.md`, covering the mode toggle in the Room tab, the editor layout (phone and desktop), toolbar, gestures, selection and the panel forms, the error-code-to-copy map, live dimensions, empty and first-use hints, the back/close and focus flow, a11y and the Light/Estimate copy changes. Done: every C5 action has a touch, mouse and keyboard path and copy.
2. `designer` (after a draft of 1): plan editor tokens and visual specs (grid, wall stroke, selection, handles, ghost "+", door and window symbols, dimension labels, error chip) in `src/styles.scss` and `docs/design/design-system.md`, with contrast documented. Done: tokens exist and 3:1 holds for handles and walls on the grid.
3. `frontend` A (parallel with 1-2): add the contract files `plan/plan-model.ts` (types, limits from C3), `plan/room-shape.ts` (C11 types plus `toRoomShape` and `windowFor`), `plan/polygon.ts` (C8) and stubbed signatures for `plan-edit.ts`, `plan-validate.ts` and `plan-sanitize.ts`. `tester` writes the geometry specs alongside. Done: the contracts compile, and the polygon tests pass.

### Phase 2: Build (tracks run in parallel after task 3)
4. `frontend` A: `plan-validate.ts`, `plan-edit.ts` (all C5 ops, snapping, the C4 opening rules) and `plan-sanitize.ts`. Done: the C16 edit, sanitize and fuzz tests pass.
5. `frontend` A: `design-defaults.ts`/`design-state.ts` v2 (`mode`, `plan`, `roomShape`, `setMode`, `setPlan`, mode-aware `setRoomHeight`, sun 0-359, migration, Reset per C6), and `calculator.ts` takes the area (plus skirting if Q4 = yes). Done: the state and migration tests pass, and v1 fixtures load.
6. `frontend` B: `herringbone.ts` with polygon bounds and culling, and `floor-builder.ts` with the stencil mask (renderer `stencil: true`, clipping planes removed) and door thresholds. Done: an L-shape shows no planks outside from any view, and the angle slider is still smooth.
7. `frontend` B: `room-builder.ts` per C10 (walls with holes, corner prisms, ceiling and subfloor, skirting with gaps, window frames and glass, door casing and hallway box, sky sphere) and a pure `wallLayout`. Done: a rectangle looks like today; an L with 2 doors and 3 windows renders with no light leaks.
8. `frontend` B: `lighting.ts` (polygon frustum) and `camera-rig.ts` (polygon clamp, presets), plus `scene-api.ts`, `floor-scene.ts` and `viewport.ts` switched to `RoomShape`, and the aria-label for custom rooms. Done: the camera cannot leave an L; presets are sensible on 3 sample shapes; the viewport test with the fake scene passes.
9. `frontend` C (after 1, 2 and 4's signatures): `plan-editor/` route component, SVG canvas, `view-transform.ts`, gestures, toolbar, panel forms and lists, undo/redo, live region, route guard, and the `<router-outlet>` plus `inert` in the designer. Done: everything in the UX spec works on touch, mouse and keyboard, AXE is clean, and the chunk is under 60 kB.
10. `frontend` C: Room tab mode toggle and "Edit shape" button; Light tab range 0-359 plus the window hint; Estimate copy (and skirting line). Done: matches the UX spec, and the panel tests are updated.

### Phase 3: Verify
11. `tester`: complete the C16 tests and run `test:ci`, `build:pages` (check that the editor chunk has no three) and `format:check`. Then the manual device checklist and the perf numbers at the limits (task 6/C15 targets). Done: all green, with numbers reported.
12. `review`: review the diff (focus on sanitize hardening, disposal of the new geometries, stencil state, no signal reads in the render loop). `ux`: review the built editor against the spec. Done: issues fixed and re-tested.

## Files

**Create:**
- `src/app/designer/plan/plan-model.ts`, `polygon.ts`, `plan-validate.ts`, `plan-edit.ts`, `plan-sanitize.ts`, `room-shape.ts`, each with a `.spec.ts`.
- `src/app/designer/plan-editor/plan-editor.ts|html|scss`, `plan-canvas.ts`, `plan-panel.ts`, `plan-toolbar.ts`, `view-transform.ts`, `pointer-gestures.ts`, with specs.
- `docs/ux/custom-room-shape.md`.

**Change:**
- `src/app/app.routes.ts` (the `plan` child route).
- `designer/designer.html|ts`.
- `state/design-defaults.ts`, `state/design-state.ts` (+spec).
- `calc/calculator.ts` (+spec).
- `patterns/pattern.ts`, `patterns/herringbone.ts` (+spec).
- `scene/scene-api.ts`, `floor-scene.ts`, `room-builder.ts`, `floor-builder.ts`, `materials.ts`, `lighting.ts`, `camera-rig.ts` (+specs).
- `viewport/viewport.ts` (+spec).
- `ui/tabs/room-tab.ts`, `light-tab.ts`, `estimate-tab.ts` (+specs).
- `src/styles.scss`, `docs/design/design-system.md`.
- `docs/ux/floor-visualizer.md` (the sun range and Room tab notes point to the new spec).

## Risks

- **Stencil edge cases:** a camera very close to the floor at a grazing angle shows the chamfer and sides of cut planks slightly past the mask. They are hidden by the skirting and thresholds, so check in task 6.
- **Wall mitres at sharp angles and overlaps at reflex corners** can z-fight on outer faces seen through a window. The 30° rule limits this; check visually.
- **Gesture conflicts on phones:** pinch vs handle drag, browser back-swipe at the screen edges, iOS page bounce. Mitigate with `touch-action: none`, pointer capture, and handles kept away from the edges by the fit-to-view padding.
- **Push/pull and set-length surprises** on non-orthogonal shapes. The unit tests cover them, and the UX gives the "keep which end" choice plus undo.
- **Sanitize is the security boundary** for localStorage (a tampered blob must not hang the page with a 1e6-vertex array). Lengths are capped before any loop.
- **Three parallel devs:** contract drift. The task 3 files are frozen; changes go through the main session.

## Open questions (recommended default first)

- **Q1. What differs between modes?** Only the room (shape, height, doors, windows), with floor, colours, light and waste shared (recommended) / everything separate per mode.
- **Q2. "Reset design" in the Estimate tab:** resets everything except the custom shape, which the editor's "Start over" handles (recommended) / also resets the custom shape (Undo for 8 s).
- **Q3. Doors in 3D:** an open doorway with a frame and a dim hallway behind it (recommended) / a closed door leaf / a door leaf ajar.
- **Q4. Skirting length in the estimate** (perimeter minus doors, in metres): show it (recommended) / leave it out.

## Answers (user, 2026-10-22)

Plan approved. Q1: only the room (shape, height, doors, windows) differs between modes; everything else is shared. Q2: Reset keeps the custom shape; the editor has its own "Start over". Q3: doors render as a CLOSED door (door leaf in a frame), not an open doorway, so no hallway box is needed. Q4: yes, show the skirting length (perimeter minus doors) in the estimate (main-session default; the user can still say no).

Main session, 2026-10-23: plan-editor chunk budget raised from 60 kB to 80 kB raw (actual 74.4 kB raw / 18.3 kB transfer; most is component CSS). Not worth cutting features.
