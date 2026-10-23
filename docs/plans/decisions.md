# Architecture decisions

Append new entries at the bottom, dated.

## 2026-10-22 - Floor visualizer (plan: `docs/plans/floor-visualizer.md`, pending approval)

- 3D uses plain `three` (pinned) with no Angular wrapper. All three.js code lives under `src/app/designer/` behind the lazy `/designer` route, never in the initial bundle.
- Scene code is framework-free TS (`scene/*`); one `Viewport` component bridges signals to the scene through `effect()`s. The render loop never reads or writes signals and renders on demand.
- Design state is one root `DesignState` service of signals; limits live in one defaults file shared by state and UI.
- Parquet floor is instanced plank meshes with a procedural grain atlas, not a tiled floor texture. Patterns are pluggable generators returning plank placements (herringbone first).
- Herringbone angle range is 0-179° (180° symmetry); each pattern declares its own range.
- Units: room in metres, planks in millimetres.

## 2026-10-22 - Custom room shape (plan: `docs/plans/custom-room-shape.md`, pending approval)

- The scene only knows a `RoomShape` (inner outline polygon, height, openings). Simple rectangle mode is converted to a 4-vertex shape with its fixed window; there is one rendering path.
- Plan data model: a graph of vertices, walls (vertex id pairs), rooms (wall-id loops) and openings (wall id + offset from the wall's `from` corner). Metres rounded to 1 mm; plan x right / y down = scene x / z; loops have a positive shoelace area; coordinates are the inner wall face. The format is ready for shared and interior walls; one room using every wall is enforced for now.
- Ids are short counter-based strings (`v12`, `w12`, `o12`) that stay stable across splits and merges.
- Planks are clipped to arbitrary polygons with a stencil mask (renderer `stencil: true`), replacing clipping planes. The CPU culls fully outside planks. No CPU polygon clipping and no clipping dependency: the geometry library is our own pure code in `plan/polygon.ts`.
- Walls are extruded per edge with openings as `Shape` holes, plus corner prisms. No CSG.
- Openings are never shrunk or deleted automatically. An edit that would not fit them is refused.
- Windows store the sill height plus an `anchor` (floor/ceiling) saying which gap stays fixed.
- Storage key `parket.design.v2` = v1 fields + `mode` + `plan`. v1 is read once as a migration source and never written. A stored plan is sanitised as hostile input; an invalid geometry falls back to simple mode silently.
- The 2D editor is a lazy child route `/designer/plan`, rendered in SVG over the live designer. It has no three.js import. It commits to state once per finished gesture and has its own in-memory undo/redo.
- The sun azimuth is 0-359 in both modes, with a hint when no window faces the sun.

## 2026-10-23 - Wall colouring (plan: `docs/plans/wall-colouring.md`, pending approval)

- Colours are base values (`wallColor`, `ceilingColor`, `skirtingColor` null = match wall, `doorColor` null = auto) plus per-surface overrides. Custom-mode overrides live on the plan records (`PlanWall.color`, `PlanOpening.color`), so they survive id compaction, split (both parts keep the colour), merge (the first wall's colour wins) and editor undo. Simple mode stores 4 overrides in `simpleWallColors`.
- `RoomShape` carries `wallIds` (plan ids, or `s0`..`s3` in simple mode). Colours are not part of `RoomShape`: a resolved `SurfacePaint` keyed by id is a separate input, so recolouring never rebuilds geometry.
- The scene uses one material per wall, skirting run and door leaf, tagged with `userData.surface` for picking. The highlight is a static emissive tint (render on demand kept), and it is excluded from the PNG export.
- Tap vs drag is decided by a pure tap detector (one pointer, <= 8 px, <= 500 ms). A raycast runs once per tap against the tagged meshes only, never in the render loop.
- The selection and Colour mode are non-persisted UI state (`ColouringState`). The Surfaces tab surface list is the keyboard/screen-reader equivalent of tapping.
- Storage key `parket.design.v3`; v2 and v1 are read-only migration sources. Reset keeps the plan but strips its colour overrides; undo conventions are unchanged.

## 2026-10-23 - Share by link and multiple projects (plan: `docs/plans/share-and-projects.md`, pending approval)

- Projects are stored as an index key `parket.projects.v1` (`activeId` + metadata list) plus one key per project, `parket.project.<id>`, holding a `Design`. Ids are `p` + 8 random base36 chars. Max 50 projects. The index and every project are sanitised as hostile input; orphan keys are swept at startup.
- Migration: with no index, the legacy design (v3 → v2 → v1) becomes the first project; legacy keys stay read-only and unwritten. Without storage the app runs on one in-memory project.
- Writes: the project key first, then the index; roll back the project key if the index write fails. A failed autosave shows one error toast and keeps the in-memory design.
- `DesignState` stays the single owner of the active design (setters, debounce, flush) and now persists to the active project key. `DesignState.open(id, design)` is the only way to switch (flush, replace, clear reset undo). `ProjectIndex` (index I/O) and `Projects` (operations, delete undo) are separate root services; no injection cycle.
- Reset/Undo apply to the active project only. Delete has its own in-memory Undo (toast) and frees storage immediately.
- Share link: `<baseURI>#s=1.<base64url(deflate-raw(JSON {n, d}))>`, pointing at the site root (HTTP 200 on Pages). The payload is versioned by the leading number. It uses the browser `CompressionStream`, with no dependency. Encoder limit 8000 chars; decoder caps 16 000 input chars and 64 KB inflated output, then `sanitizeDesign`.
- A root-route guard redirects `#s=` links to `/designer` keeping the fragment; the designer reads `location.hash`, asks before adding the design as a NEW project, then clears the hash with `history.replaceState`. A shared design never overwrites an existing project.
- Share uses `navigator.share` on coarse-pointer devices, otherwise the clipboard plus a toast, with a read-only link dialog as the last fallback.

## 2026-10-23 - Dock + tray redesign (plan: `docs/plans/dock-redesign.md`, pending approval)

- The 3D canvas is always full-screen behind all chrome and resizes only with the window. The room is framed in the uncovered rectangle with `PerspectiveCamera.setViewOffset` driven by measured frame insets (`ViewFrame` service, `FloorSceneApi.setFrame`); presets use the frame aspect. Picking is unchanged; the PNG export clears the offset. Fallback if the spike fails: resize the stage to the insets as before.
- Shell state is one open section or none (`SectionId | null`), not persisted. The bottom sheet with Peek/Half/Full and the ARIA tab list are removed.
- The dock (phone) / rail (desktop) is one `role="toolbar"` of disclosure buttons (`aria-expanded`, `aria-controls` the single tray region), not an ARIA tabs widget.
- Colour mode is removed: picking in 3D is on exactly while the Colour section is open (`ColouringState.colourOpen`).
- Reset lives in the Projects dialog row menu (current project only).
- The compact 0.8x phone scale stays (user decision); new dock/tray tokens are scaled in `_phone-scale.scss`.
