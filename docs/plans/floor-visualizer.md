# Plan: 3D parquet floor visualizer and calculator

Status: draft, awaiting user approval. Owner: architect. Date: 2026-10-22.

## Goal

A `/designer` page where the user builds a room (length, width, height), picks wall/ceiling colours, a wood species, plank size, finish and sunlight, and sees a realistic herringbone floor in a live 3D perspective view they can look around in. A 1° slider rotates the pattern in real time. A panel shows floor area and planks needed including waste. The view can be downloaded as a PNG. Phone first.

**Done when:** the landing CTA opens `/designer` (lazy, three.js not in the initial bundle); all controls listed below update the 3D view within one frame; the estimate matches the formulas in this plan (unit-tested); PNG export works on iOS Safari, Android Chrome and desktop; AXE passes on the page; it runs smoothly (target 60 fps idle-free, 30+ fps while orbiting) on a mid-range phone; `npm run test:ci`, `npm run build:pages` and `npm run format:check` pass.

## Decisions

### D1. Routing and bundle
- New lazy route `designer` via `loadComponent` in `src/app/app.routes.ts`, placed before `**`. Everything that imports `three` lives under `src/app/designer/` and is only imported from that route, so it lands in a lazy chunk.
- Landing gets a "Start designing" `routerLink="/designer"` CTA (UX/designer to place it so it does not compete with the wordmark animation).
- GitHub Pages deep links already work: `deploy.yml` copies `index.html` to `404.html`.
- Dependencies: `three` (pinned exact minor) and `@types/three` (dev). Import addons from `three/addons/...` (OrbitControls, RoomEnvironment, RoundedBox not needed, see D4).
- Budget: initial stays under 500 kB (landing must not grow beyond the CTA). Add an `anyScript` budget to `angular.json` (warning 900 kB, error 1.3 MB) so the three.js chunk is watched. three tree-shakes poorly because `WebGLRenderer` pulls in most of the core; expect about 550-700 kB raw / 150-180 kB gzip for the designer chunk.
- No wrapper library (angular-three / ngt): plain three.js in plain TS modules, owned by one Angular component. Fewer deps, no version lock to a wrapper, full control of the render loop.

### D2. Architecture: Angular shell, framework-free scene
```
src/app/designer/
  designer.ts|html|scss          route shell: layout = viewport + controls overlay
  state/design-state.ts          @Service singleton, all design signals + computed estimate
  state/design-defaults.ts       defaults, limits (min/max/step) used by state and UI
  calc/calculator.ts             pure functions (area, planks, packs, cost)
  data/species.ts                wood species presets (palette + grain params)
  data/finishes.ts               matte/satin/gloss -> material params
  patterns/pattern.ts            PatternGenerator interface + PlankPlacement type
  patterns/herringbone.ts        herringbone generator (chevron/straight later)
  viewport/viewport.ts           <canvas> host; creates FloorScene, bridges signals -> scene
  scene/floor-scene.ts           facade: renderer, loop, resize, dispose, exportPng()
  scene/room-builder.ts          walls (one with a window opening), ceiling, skirting
  scene/floor-builder.ts         instanced plank meshes from placements
  scene/wood-texture.ts          procedural grain atlas on a canvas (seeded)
  scene/materials.ts             floor/wall/ceiling materials, finish mapping
  scene/lighting.ts              sun, environment (IBL), ambient
  scene/camera-rig.ts            OrbitControls, clamping, view presets
  scene/random.ts                seeded PRNG (shared with texture + variation)
  controls/                      overlay UI: controls-sheet (tabs), room-panel,
                                 surfaces-panel, floor-panel, light-panel,
                                 estimate-panel, view-toolbar
  shared/slider-field.ts         label + range + number input + unit, reused everywhere
```
- `scene/*` are plain TS classes/functions with no Angular imports, so they can be unit-tested or mocked and reused.
- `Viewport` is the only bridge: it reads state signals in `effect()`s and calls scene setters. Scene never writes signals.
- Components are small; panels only read/write `DesignState`.

### D3. State model (single `DesignState` service)
`@Service()` (root) so the design survives leaving and re-entering `/designer`. Writable signals, grouped:

| Signal | Shape / units | Default |
| --- | --- | --- |
| `room` | `{ length, width, height }` metres, step 0.01 | 5.0 x 4.0 x 2.7 |
| `wallColor`, `ceilingColor` | hex string (presets + custom) | warm white `#efe9df`, white `#f7f5f0` |
| `species` | id from `species.ts` | `golden-oak` (matches landing) |
| `plank` | `{ length, width }` mm, length 300-1200 step 10, width 40-200 step 5 | 600 x 100 |
| `planksPerBlock` | integer 1-10; planks side by side in one herringbone block (1 = classic) | 1 |
| `pattern` | `'herringbone'` (union, extensible) | herringbone |
| `angle` | integer degrees 0-179 | 0 |
| `finish` | `'matte' \| 'satin' \| 'gloss'` | satin |
| `sun` | `{ on, azimuth 90-270, elevation 10-70, intensity 0-2 }` | on, 135, 35, 1 |
| `wastePercent` | integer 0-30 | 12 |

- Computed: `floorArea`, `plankArea`, `planksNet`, `planksWithWaste`, `areaWithWaste` (all via `calculator.ts`), and `placementsKey` (room + plank + pattern + angle) for the floor rebuild.
- Setters clamp to limits from `design-defaults.ts` (one source of truth for UI `min/max/step` and validation). Plank length must be at least 2x the block width (`planksPerBlock x width`; equals 2x width when planksPerBlock is 1). Changing `planksPerBlock` auto-fits: width shrinks first (min 40), then length grows (max 1200), then `planksPerBlock` is clamped down. UI shows a hint when clamped. Saved designs without `planksPerBlock` load with 1 (same storage key; no migration needed).
- Persist to `localStorage` (debounced, versioned key `parket.design.v1`, ignore invalid data). Default yes, see open question Q4.
- Units: room in metres, planks in millimetres (how floor products are sold). Internally the scene uses metres.

### D4. Floor rendering: instanced plank meshes (recommended) vs procedural texture

| Criterion | Procedural canvas texture on one plane | Instanced plank meshes |
| --- | --- | --- |
| Realism | Grain, seams and bevels baked; bevels only fake via normal map; visible tile repetition | Real geometry with chamfered top edges catching light; per-plank tint and grain variant; real seams (gap over a dark subfloor) |
| Arbitrary rotation | `texture.rotation` is free, but the tile must be seamless | Regenerate placements (O(n), about 1 ms for a few thousand planks) and update instance matrices |
| Plank size change | Needs a seamless tile for the L:W ratio; non-integer ratios do not give a rectangular repeat, so the texture must be regenerated and is large | Just regenerate placements; any L and W |
| Cut planks at walls | Free | Clipping planes at the walls + skirting boards hide cut ends |
| Phone performance | Cheapest (2 triangles) but a large texture (2-4k) for crisp seams | ~1-3k instances x 18 triangles in ~12 draw calls; fine on mid-range phones |
| Estimate tie-in | None | Placements can later give an exact "pieces incl. cuts" count |

**Recommendation: instanced meshes + a procedural grain atlas.**
- Geometry: one low-poly plank (top face + 4 chamfer strips of ~1.5 mm + 4 sides, no bottom, ~18 triangles), size 1x1 scaled per instance. Slight gap (~0.5 mm) between planks over a dark subfloor plane gives seams.
- Texture: `wood-texture.ts` paints a grain atlas on a canvas (port the grain logic of `docs/design/generate-parquet.mjs`: wavy grain lines, cathedral arches, pores, flecks, rare knots), seeded, per species: N = 12 strips in a 2048 x 1024 atlas (1024 x 512 when `maxTextureSize` or memory is low). Regenerated only when species changes.
- Variation without shader patches: 12 `InstancedMesh`es, one per grain strip (geometry UVs mapped to its strip), planks assigned randomly by a seeded hash of their lattice index; per-instance colour tint (+-6% lightness) via `instanceColor`; random 180° flip. Later polish option: an `onBeforeCompile` per-instance UV offset for unlimited variation.
- Pattern code: `PatternGenerator { id; angleRange; generate(params, bounds): PlankPlacement[] }`, `PlankPlacement = { x, z, rotation, length, width, seed }`. Chevron needs mitred ends (a second plank geometry), straight plank is trivial; neither needs changes elsewhere.
- Herringbone math (hint for the developer, verify by test): with axis-aligned planks L x W, cell k has a horizontal plank at `(kW, kW) + [0,L]x[0,W]` and a vertical one at `(kW - W, kW) + [0,W]x[0,L]`; the second lattice vector is `(L, -L)`. Rotate the whole set by 45° + user angle about the room centre, generate only cells whose bounds touch the room rectangle (inverse-rotate the room into pattern space).
- Angle range **0-179**: herringbone is symmetric under 180° rotation, so 180-359 would repeat. Each generator declares its own range (chevron may need 0-359). Angle 0 = zigzag spine along the room length.
- Clip at walls with 4 `clippingPlanes` on the floor materials (`renderer.localClippingEnabled = true`); skirting boards (about 60 mm, wall colour) hide the open cut faces.
- Instance cap: limits (room max 12 x 12 m, plank min 300 x 40 mm) keep the worst case near 15k instances, so the flat-top fallback applies there; strips count as planks, so more planks per block needs longer planks and lowers the count; if the count exceeds ~8k on a phone, show the floor with fewer chamfer segments (flat top) rather than a different technique. Measure on a device in phase 3.

### D5. Lighting and finish
- Environment: `RoomEnvironment` through `PMREMGenerator` as IBL (no HDR download, works offline, small). Plus a weak `HemisphereLight` for warm bounce.
- Sun: `DirectionalLight` (warm, about 5500 K tint) shining through a single window opening in one long wall, so it paints a sunlit patch on the floor. Walls cast shadows, floor receives. Shadow map 2048 (1024 on phones), `PCFSoftShadowMap`, tight shadow camera fitted to the room. `shadowMap.autoUpdate = false`; mark `needsUpdate` only when room, sun or floor changes (we render on demand anyway). Sun off = window still there, only IBL + hemisphere.
- Floor material: `MeshPhysicalMaterial` with the atlas as `map`, finish mapping in `finishes.ts`:

| Finish | roughness | clearcoat | clearcoatRoughness |
| --- | --- | --- | --- |
| Matte (oiled) | 0.75 | 0 | - |
| Satin | 0.55 | 0.35 | 0.35 |
| Gloss (lacquer) | 0.4 | 1.0 | 0.05 |

- Walls/ceiling: `MeshStandardMaterial`, roughness 0.9, colour from state.
- Renderer: `outputColorSpace = SRGBColorSpace`, `ACESFilmicToneMapping`, exposure about 1.0.
- Later polish: a roughness/normal map derived from the grain atlas (pores read under gloss).

### D6. Camera
- `OrbitControls` "inside the room": target at room centre, height 1.0 m; camera position clamped every `change` to the room box minus 0.25 m, `maxPolarAngle` slightly below horizontal-down limits so the user can look from low eye level to near top-down; `maxDistance` from room size; damping on (off with `prefers-reduced-motion`); one-finger orbit, two-finger pinch/pan on touch.
- Moving the camera changes where you look from, which shifts the perspective on the pattern as asked. First-person / pointer-lock was rejected: poor on phones.
- View presets (buttons): Corner (default, eye level 1.6 m from a corner), Doorway, Top-down. Animated transitions, instant under reduced motion. Presets refit when room size changes.
- Keyboard on the focused canvas: arrows orbit, `+`/`-` zoom, `0` reset; buttons offer the same for non-keyboard users.

### D7. Render loop and zoneless caveats
- Zoneless: rAF callbacks do not trigger change detection, so the loop needs no `NgZone`. Rule: the loop and scene never read or write signals.
- Render on demand: `requestRender()` schedules at most one rAF. Triggers: controls `change`, state effects, resize, texture ready. While damping/preset animation is active, `controls.update()` keeps requesting frames until it settles. Nothing renders when idle (battery).
- Signals -> scene: `Viewport` `effect()`s (one per concern: room, surfaces, floor placements, material/finish, sun, species texture) call scene setters then `requestRender()`. The angle slider fires per input event; effects coalesce, and placement rebuild runs at most once per frame.
- Init in `afterNextRender` (canvas exists, browser only). Dispose in `DestroyRef.onDestroy`: cancel rAF, disconnect `ResizeObserver`, `controls.dispose()`, dispose every geometry/material/texture/render target and PMREM, `renderer.dispose()`.
- Resize via `ResizeObserver` on the host element (not window). Pixel ratio `min(devicePixelRatio, 2)`, lowered to 1.5 on small screens (`min(innerWidth, innerHeight) < 500`). Antialias on.
- Handle `webglcontextlost`/`restored` (rebuild scene); no-WebGL fallback: a message plus the estimate panel still works.

### D8. Calculator (pure, `calculator.ts`)
- `floorArea = length x width` (m², room is rectangular).
- `plankArea = (plankLength / 1000) x (plankWidth / 1000)` (m²).
- `areaWithWaste = floorArea x (1 + waste / 100)`.
- `planksNet = ceil(floorArea / plankArea)`; `planksWithWaste = ceil(areaWithWaste / plankArea)`.
- Default waste 12% (herringbone typical 10-15%), adjustable 0-30%.
- Display: area to 2 decimals in m², counts as integers; the epsilon guard (`ceil(x - 1e-9)`) avoids float artefacts like 50.000000001 -> 51.
- Optional (Q3): `packs = ceil(areaWithWaste / packArea)`, `cost = packs x packPrice`.
- Assumptions shown in the UI: rectangular room, no deduction for fixed fittings, waste covers cuts at walls and the herringbone ends.

### D9. PNG export
- No `preserveDrawingBuffer` (it costs performance on mobile). `exportPng()` does `renderer.render(scene, camera)` and then `canvas.toBlob('image/png')` synchronously in the same task, which captures the fresh buffer.
- Download via an `<a download>` with an object URL, filename `parket-herringbone-<species>-<angle>deg.png`; revoke the URL after. iOS fallback: if `download` is ignored, open the blob in a new tab.
- Export at current canvas size and DPR (cap 2). Hi-res export is a later option.

### D10. UI, responsiveness, accessibility
- Phone: full-screen canvas; bottom sheet with tabs (Room, Surfaces, Floor, Light, Estimate), collapsible to a peek bar that always shows area and planks. Desktop (>= 900 px): right-side panel. View toolbar (presets, export) floats top-right. Exact layout from UX.
- Every control has a visible `<label>`; groups use `fieldset`/`legend`. `slider-field` pairs `<input type="range">` with a number input and unit, both labelled, keyboard native (arrows = 1 step, PageUp/Down = 10). Colour presets are a radio group; custom colour is a labelled `<input type="color">`.
- Canvas wrapper: `role="img"`, `tabindex="0"`, dynamic `aria-label` (e.g. "3D view: 5.00 by 4.00 m room, golden oak herringbone floor at 30 degrees, satin finish") and `aria-describedby` pointing at the keyboard instructions.
- Estimate results in a polite live region, updated debounced (about 500 ms) so slider drags do not spam screen readers.
- Overlay panels use an opaque-enough surface token so text over the moving 3D view keeps 4.5:1; visible focus rings; touch targets >= 44 px.

### D11. Testing
- Vitest unit tests (jsdom) for the pure parts: `calculator.ts` (formulas, rounding, edge cases), `herringbone.ts` (no overlaps on samples, covered area >= room area, angle range, plank count scales with size), `design-state.ts` (defaults, clamping, L >= 2W rule, computed values, localStorage round-trip and invalid data), `random.ts` (deterministic).
- jsdom has no WebGL or canvas 2D: `Viewport` gets the scene through an injection token (`FLOOR_SCENE_FACTORY`); component tests provide a fake that records setter calls. No real three.js rendering in unit tests.
- Panel component tests: labels present, inputs update state.
- Manual device checklist (tester): iOS Safari, Android Chrome, desktop Chrome/Firefox; orbit, presets, angle slider smoothness, export, rotate device, leave and re-enter the route (no leaked contexts: re-enter 10 times without warnings).

## Tasks

### Phase 1: Spec
1. `ux` - Designer page UX spec in `docs/ux/floor-visualizer.md`: phone bottom sheet + desktop panel layout, tab contents and order, control types/ranges/copy (use D3 limits), estimate panel wording and assumptions text, camera help text, export flow, no-WebGL and loading states, landing CTA placement and copy, a11y notes. Done: every control in D3 specified with label, unit, range, states.
2. `designer` - Tokens and visual specs: overlay surface/panel colours with contrast checks, controls (slider, swatch, tabs, buttons), CTA style on the landing, spacing scale extension; species palettes (base colours + grain colours, 5-6 species) and wall/ceiling preset colours. Update `src/styles.scss` and `docs/design/design-system.md`. Done: tokens exist, contrast ratios documented, species table ready for `species.ts`.

### Phase 2: Core (frontend, parallel where noted)
3. `frontend` - Add `three` + `@types/three`; lazy `designer` route; empty `Designer` shell; `anyScript` budget in `angular.json`. Done: `/designer` loads, initial bundle unchanged except router entry, build passes.
4. `frontend` - `calculator.ts`, `design-defaults.ts`, `design-state.ts` (with localStorage), `random.ts`. Done: unit tests from task 11 pass (can be written together with tester).
5. `frontend` - `patterns/pattern.ts` + `herringbone.ts`. Done: generator tests pass, angle 0-179 supported.
6. `frontend` - Scene: `floor-scene.ts` (renderer, on-demand loop, resize/DPR, dispose, context loss, `exportPng`), `room-builder.ts`, `lighting.ts`, `camera-rig.ts`, `materials.ts`. Done: room with walls/window/ceiling renders, orbit clamped inside, presets work, no leaks on route exit.
7. `frontend` - `wood-texture.ts` atlas + `floor-builder.ts` (instanced planks, chamfer geometry, clipping, skirting, tint/variant). Done: herringbone floor visible, rotation by slider smooth, plank size and species changes apply in under ~300 ms on a phone.
8. `frontend` - `Viewport` bridge (effects -> scene, factory token, aria-label). Done: every state change reflects in the view; component test with fake scene passes.

### Phase 3: UI
9. `frontend` - Controls overlay per UX/design: `slider-field`, controls sheet, panels, estimate panel with live region, view toolbar (presets, PNG export), landing CTA. Done: matches spec on phone and desktop, keyboard-only usable, AXE clean.
10. `frontend` - Performance pass on a real phone: instance count, shadow map size, DPR; fix hotspots. Done: targets in Goal met, numbers noted in the PR.

### Phase 4: Verify
11. `tester` - Unit tests per D11, run `npm run test:ci`, `npm run build:pages` (check budgets and that three is only in the lazy chunk), `npm run format:check`, manual device checklist. Done: all green, checklist results reported.
12. `ux` - Review built UI against the spec (copy, states, a11y). Done: issues listed or none.

No `backend` or `devops` tasks (static site; Pages 404 fallback already in place).

## Files

Create: everything under `src/app/designer/` listed in D2, plus their `.spec.ts` files; `docs/ux/floor-visualizer.md`.

Change: `src/app/app.routes.ts` (designer route), `src/app/landing/landing.html|ts|scss` (CTA), `src/styles.scss` and `docs/design/design-system.md` (tokens), `package.json`/`package-lock.json` (three, @types/three), `angular.json` (anyScript budget).

## Risks

- **Phone GPU/memory**: shadows + clearcoat + thousands of instances may drop frames on low-end phones. Mitigation: render on demand, DPR cap, shadow map 1024, limits on room/plank size, measured in task 10.
- **Visual realism** depends on the grain atlas quality; the landing SVG generator is a good base but canvas port takes tuning.
- **Grain repetition** with 12 variants may be noticeable on big rooms; fallback is the per-instance UV offset shader patch.
- **iOS download** behaviour for blobs varies by version; fallback opens a new tab.
- **three.js upgrades** break APIs often; pin the version.
- **Bundle**: designer chunk around 600 kB raw; fine for a lazy chunk, but first visit to `/designer` on slow mobile takes a moment, so show a loading state.

## Open questions (recommended default first)

- **Q1. Wrapper library?** Plain three.js (recommended) / angular-three (ngt).
- **Q2. Window and sunlight patch:** One fixed window in a long wall with a sun patch on the floor (recommended) / No window, sun as general directional light only / User-placeable window (later).
- **Q3. Packs and cost:** Leave out for now, planks + m² only (recommended) / Add pack size (m² per pack) and packs count / Also add price per m² or per pack and total cost.
- **Q4. Remember the design between visits (localStorage):** Yes (recommended) / No.
- **Q5. Default waste:** 12% (recommended) / 10% / 15%.

## Answers (user, 2026-10-22)

Plan approved. Q1 plain three.js; Q2 one fixed window in a long wall with a sun patch; Q3 m² and planks only (no packs/cost); Q4 yes, remember the design in localStorage; Q5 default waste 12%.
