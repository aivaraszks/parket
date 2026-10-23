# UX spec: Floor visualizer (`/designer`)

Plan: `docs/plans/floor-visualizer.md` (limits from D3, formulas from D8). Visual styling is the designer's job; this file covers behaviour, content and copy.

## Users and goal

Home owners and renovators (also fitters and shop visitors) who want to see what a herringbone floor looks like in a room like theirs, and how much material to buy. Mostly on a phone, one-handed. Goal: in under a minute, set the room, pick a wood and an angle, look around, read "how many planks", and save a picture.

Principles: the 3D view is the hero; controls are secondary and never hide the floor more than necessary; every change is live (no Apply buttons); sensible defaults so the first view already looks good.

## User flow

1. Landing: user taps the CTA "Design your floor" and `/designer` opens.
2. Loading state, then the default room (5.00 x 4.00 x 2.70 m, golden oak, satin, 12% waste) in the Corner view. Returning users see their saved design.
3. User orbits the view (drag / pinch) or taps a view preset.
4. User changes things in the tabs: Room, Surfaces, Floor, Light. The view updates immediately.
5. User drags the Angle slider and watches the pattern rotate.
6. User reads the Estimate (always visible in the peek bar; full detail in the Estimate tab).
7. User taps Save image, gets a PNG.
8. Alternative: Reset design returns everything to defaults (with undo).
9. Alternative: user leaves and returns; the design is restored from localStorage.

## Layout

### Phone (< 900 px wide): full-screen view plus bottom sheet

```
+--------------------------------+
| [<] Parket          [Views][Save]|  top bar (over the view)
|                                |
|        3D VIEW (canvas)        |
|                                |
|                                |
+--------------------------------+
|  ---  (drag handle)            |
| 20.00 m2 | 38 planks incl. 12% |  peek bar (always visible)
| Room Surfaces Floor Light Est. |  tabs
| ...controls of active tab...   |
+--------------------------------+
```

Sheet has three stops: **Peek** (handle + estimate summary + tabs, about 25% of height), **Half** (default when a tab is opened, about 50%) and **Full** (about 85%, the view remains visible above). Tapping a tab while peeked opens to Half; tapping the active tab again, or the handle, collapses to Peek. Drag the handle to move between stops; the handle is also a button (tap cycles Peek / Half, Enter/Space too) so dragging is never required.

First visit: sheet opens at Half on the Floor tab (the most rewarding control) and the view is fully usable above it. Later visits: sheet stays at Peek.

Landscape phone: sheet becomes the desktop-style side panel when width >= 700 px and height < 500 px (about 45% width).

The canvas is sized to the area above the sheet and re-fitted when the sheet moves, so the room is never hidden behind it.

### Desktop (>= 900 px): right side panel

```
+-------------------------------+---------------+
| Parket            [Views][Save]| Room Surf ... |
|                               | tabs          |
|        3D VIEW                | controls      |
|                               |               |
|                               | ------------  |
|                               | Estimate card |
+-------------------------------+---------------+
```

Panel 360 px wide, full height, scrolls inside. Estimate summary is pinned at the panel bottom (same content as the peek bar), so the numbers are visible on every tab. Tabs are the same five.

### Top bar / view toolbar

- Back link "Parket" (to `/`), icon + text.
- **Views** menu button (opens a small popover with the three presets plus Zoom in / Zoom out). On desktop the presets are shown inline as three buttons.
- **Save image** button (icon + text; icon only below 440 px with an accessible name).
- Reset design lives in one place only: the Estimate tab footer (see Reset design).

## Tabs and controls

Order follows the user's mental model: space, surfaces, floor, light, result. Each tab is a `fieldset`-grouped form. All sliders use the shared pattern: label, range input, number input with unit; both stay in sync.

Slider field wireframe:

```
Length                       [ 5.00 ] m
|----o-------------------|   2.00 - 12.00
```

Range text under the slider is the hint (muted). Number input accepts typing; value is clamped on blur/Enter, not while typing; out-of-range typing shows the inline hint "Use 2.00 to 12.00 m" and clamps on blur.

### Tab 1: Room

| Control | Type | Unit | Range | Step (slider / number) | Default |
| --- | --- | --- | --- | --- | --- |
| Length | slider + number | m | 2.00 - 12.00 | 0.1 / 0.01 | 5.00 |
| Width | slider + number | m | 2.00 - 12.00 | 0.1 / 0.01 | 4.00 |
| Ceiling height | slider + number | m | 2.20 - 4.00 | 0.05 / 0.01 | 2.70 |

Helper line: "The window is in one of the long walls." (the fixed window; Length is the longer-wall axis by definition of the model, no "swap" control needed). Changing room size refits the current view preset.

### Tab 2: Surfaces

| Control | Type | Options | Default |
| --- | --- | --- | --- |
| Wall colour | swatch radio group (6-8 presets) + "Custom" colour input | designer supplies presets | warm white `#efe9df` |
| Ceiling colour | same | same | white `#f7f5f0` |

Each swatch has a text name as accessible name (e.g. "Warm white"). Selected swatch: ring + check mark (not colour alone). Custom: a labelled `<input type="color">` ("Custom wall colour") that, once used, shows as a selected extra swatch.

### Tab 3: Floor

| Control | Type | Unit | Range | Step | Default |
| --- | --- | --- | --- | --- | --- |
| Wood | radio cards with small swatch + name (5-6 species) | - | designer list | - | Golden oak |
| Pattern | segmented control, one option "Herringbone" (disabled-looking extras are NOT shown) | - | - | - | Herringbone |
| Plank length | slider + number | mm | 300 - 1200 | 10 / 10 | 600 |
| Plank width | slider + number | mm | 40 - 200 | 5 / 5 | 100 |
| Planks per block | slider + number | - (no unit) | 1 - 10 | 1 / 1 | 1 |
| Angle | slider + number | deg | 0 - 179 | 1 / 1 | 0 |
| Finish | segmented control: Matte, Satin, Gloss | - | - | - | Satin |

- Pattern: show it as a static line "Pattern: Herringbone" until a second pattern exists; a one-option control is noise.
- Plank rule: length must be at least 2x the block width, where block width = planks per block x plank width (with 1 plank per block this is the old "length >= 2x width"). When the user pushes a value past the rule, the other value is not changed; the edited one clamps and the hint shows: "Plank length must be at least twice the width." (with more than 1 plank per block: "Plank length must be at least twice the block width (planks per block x width)."). The slider max for width is `floor(length / (2 x planks per block))` and the min for length is `2 x planks per block x width` (dynamic, shown in the range text).
- Planks per block: placed right after Plank width. Helper: "1 = classic herringbone". Each herringbone block is made of this many parallel planks side by side (the reference photo uses 4). Changing it never fails: if the current plank no longer fits the rule, the width shrinks first (never below 40 mm), then the length grows (up to 1200 mm), then planks per block is reduced; a status line says what changed, e.g. "Plank width set to 75 mm to fit the block." The estimate counts every strip as one plank.
- Angle helper: "0 deg = zigzag runs along the room's length. Patterns repeat after 180 deg." Number input shows "deg" and the value as `30°`. Slider has ticks at 0, 45, 90, 135 (decorative). Dragging updates the view live; no debounce.
- Wood cards show name only plus swatch (e.g. Golden oak, Walnut, Ash, ...). Final list from designer.
- Finish segmented control hint (selected one): Matte "Oiled, no reflections"; Satin "Soft sheen"; Gloss "Lacquered, mirror-like highlights".

### Tab 4: Light

| Control | Type | Unit | Range | Step | Default |
| --- | --- | --- | --- | --- | --- |
| Sunlight | switch | on/off | - | - | On |
| Sun direction | slider + number | deg | 90 - 270 (180 = straight through the window) | 1 / 1 | 135 |
| Sun height | slider + number | deg | 10 - 70 | 1 / 1 | 35 |
| Brightness | slider + number | x | 0 - 2.0 | 0.1 / 0.1 | 1.0 |

- When Sunlight is off, the three sliders are disabled (not hidden) and the helper reads "Turn sunlight on to adjust it."; room still has soft daylight.
- Helper under Sun direction: "Where the sun comes from, as seen from above. The patch of light enters through the window." The range is limited to the window side, so the sun always has an effect (see Open question O2).
- Number unit for Brightness shows "x" (e.g. 1.0 x); label "Brightness".

### Tab 5: Estimate

See the next section. Also holds the Waste control and the Reset action.

## Estimate panel

### Always-visible summary (peek bar / pinned footer)

One consistent line (example for the default 5 x 4 m room, 600 x 100 mm planks):

> **20.00 m²** · **Buy 374 planks** (incl. 12% waste)

Format: numbers use locale grouping (1,234), area two decimals. If the user has changed waste, the percent updates.

### Estimate tab content

```
Your floor
  Floor area            20.00 m²
  Planks needed         334          (no waste)
  Waste allowance  [ 12 ] %   slider 0-30, step 1
  ----------------------------------------
  Area to buy           22.40 m²
  Planks to buy         374          <- emphasised

  How this is calculated  (disclosure, closed by default)
     Rectangular room. Fittings are not deducted. Waste covers
     cuts at walls and herringbone ends. Plank size 600 x 100 mm.
  [ Reset design ]
```

Controls: **Waste allowance** slider + number, unit %, 0 - 30, step 1, default 12. Helper: "10-15% is typical for herringbone."

Labels: "Floor area", "Planks needed (no waste)", "Area to buy (incl. waste)", "Planks to buy (incl. waste)". Results are read-only text, never inputs.

Assumptions text (disclosure "How this is calculated", also shown as a one-line muted note under the results on desktop):

> Estimate for a rectangular room. Fixed fittings (cupboards, stairs) are not deducted. The waste allowance covers cuts at the walls and the ends of the herringbone. Planks are rounded up. Check with your supplier before ordering.

Empty/invalid: cannot happen (values clamped); if any input is mid-edit and invalid, results keep the last valid numbers.

## Camera: presets and help

Presets (Views menu, desktop inline buttons):

| Preset | Description (tooltip/menu sub-text) |
| --- | --- |
| Corner (default) | "Eye level from a corner" |
| Doorway | "Looking in from the door" |
| Top-down | "Straight down on the pattern" |

Also in the menu: Zoom in, Zoom out (for users who cannot pinch or use a wheel). Active preset is marked only until the user moves the camera.

Help text (an info button "How to look around" next to Views opens a small dismissible popover; also shown once, as a toast-style hint over the view on first visit, auto-dismisses after 6 s or on first touch):

- Touch: "Drag to look around. Pinch to zoom. Two fingers to move."
- Mouse: "Drag to look around. Scroll to zoom. Right-drag to move."
- Keyboard (shown on desktop, when the view has focus): "Arrow keys to look around. + and - to zoom. 0 to reset the view."

The same text is the `aria-describedby` target of the canvas. Camera cannot leave the room; there is no error, it simply stops at the walls.

## Export flow (PNG)

1. User taps **Save image** (top bar).
2. Button shows a spinner and is disabled ("Saving..."); view stays interactive. Typically < 1 s.
3. Success: browser downloads `parket-herringbone-<species>-<angle>deg.png`; a toast (polite live region) says "Image saved." and disappears after 4 s.
4. The saved image is the view as seen right now, without UI.

iOS / no-download fallback: if the browser ignores `download` (iOS Safari versions that open or block it), open the image in a new tab/overlay and show a dialog instead of the toast:

> **Image ready**
> Press and hold the image, then choose "Save to Photos".
> [Close]

The dialog shows the image itself (`<img>` of the blob, with alt "Your floor design") so a long-press saves it, plus a visible "Open image" link. If the popup is blocked, the in-dialog `<img>` is the primary path, so a new tab is not required.

Errors: "Could not create the image. Try again." with a Retry action in the toast (assertive live region). Never silent.

## Reset design

Location: Estimate tab footer, button "Reset design" (secondary style, not red; it is recoverable).
Flow: tap, no confirm dialog; all values return to defaults, the camera returns to Corner, a toast appears: "Design reset. [Undo]" for 8 s. Undo restores the previous design. (Preferred over a confirm dialog: fewer steps, and undo is safer.) Toast action is keyboard reachable and focus is not stolen from the Reset button.

## States

| State | Behaviour |
| --- | --- |
| Loading (lazy chunk + scene setup) | Route shows a full-screen dark floor-coloured background (`--color-floor-dark`) with the text "Preparing your room..." and an indeterminate progress bar (`role="status"`). Controls sheet is already rendered in Peek with the estimate (calculator works without WebGL) but the canvas area shows the loader. Texture generation happening after first frame: view shows the room with a flat floor and fades in the wood in about 300 ms (instant if reduced motion). |
| Species/plank change busy | No spinner (< 300 ms). If slower, subtle progress line at top of the view. |
| No WebGL / init failure | Canvas area replaced by a message card: title "3D view isn't available", body "Your browser or device can't show the 3D view. You can still work out how much flooring you need.", action "Try again" (re-init). Controls stay fully usable; the Estimate tab opens automatically; Save image and Views are disabled with a tooltip "Needs 3D view". |
| WebGL context lost | Overlay on the view: "Display paused. Restoring..."; on restore it disappears, otherwise falls back to the no-WebGL card. |
| Chunk fails to load (offline) | "Couldn't load the designer. Check your connection." with "Reload" button and a link back to home. |
| Disabled controls | Sun sliders when Sunlight is off; Save image while exporting or without WebGL. Disabled controls keep their value visible and are not removed. |
| Saved design restored | Silent. If saved data is invalid it is ignored and defaults are used silently. |
| Reduced motion | No preset camera animation, no damping, no fade-in, no sheet animation. |
| Permissions | None needed. localStorage unavailable (private mode): design works but is not remembered; no error shown. |

## Landing CTA

Placement: below the wordmark, under the hairline rule, centred, in the lower third on phone (about 12 vh below the wordmark) so it never overlaps the letters or the shine. It appears **after** the opening sequence: fade in and rise 8 px over 0.6 s, starting at about 3.6 s (just after the golden shine ends at 3.8 s the CTA is fully shown by 4.2 s). With reduced motion it is visible at once. Until it appears it is not focusable (`visibility: hidden` before the delay) so keyboard users do not land on an invisible control; after 4.2 s it is focusable. Users who tab early are not blocked: Tab on the landing page during the sequence is acceptable to skip the animation by showing the CTA immediately (any keydown or tap shows the CTA at once).

Copy:
- Button: **Design your floor**
- Optional one-line above it, small, uppercase, wide-tracked like the wordmark rule: "Herringbone, in 3D" (decorative reinforcement; keep if it fits; drop on screens under 360 px).

Style direction (for designer): quiet, elegant, a hairline-outlined or soft-filled pill in white on the veil, not a bright primary button; hover/focus raises the fill to golden `--shine-color`. Min target 48 x 48 px, visible focus ring (not removed), contrast >= 4.5:1 for text over the floor. It is a link (`routerLink="/designer"`), not a button element.

## Copy sheet (summary)

- Tabs: Room, Surfaces, Floor, Light, Estimate
- Buttons: Save image, Views, Reset design, Undo, Try again, Reload, Close
- Units: m, mm, deg (shown as °), %, x
- Toasts: "Image saved." / "Could not create the image. Try again." / "Design reset. Undo"
- Errors: "Use 2.00 to 12.00 m" (pattern: "Use {min} to {max} {unit}"), "Plank length must be at least twice the width."
- Tone: plain, short, no jargon, no exclamation marks.

## Accessibility

- Keyboard order: skip link / back link, Views, Save image, canvas (focusable view), sheet handle, tabs, active tab controls, estimate summary. On desktop the panel follows the canvas in DOM order.
- Tabs follow the ARIA tabs pattern: `role="tablist"`, arrows move between tabs (automatic activation), Home/End jump, tab panel labelled by its tab. Tab panel content is focusable in order.
- Sheet handle: `button` with `aria-expanded` and an accessible name "Controls panel"; stop changes are announced via the state ("Collapsed", "Expanded"). Dragging is optional.
- Sliders: native `<input type="range">` with visible label, plus a number input labelled identically with "(number)" suffix visually hidden; `aria-valuetext` includes the unit ("30 degrees"). Hints connected by `aria-describedby`.
- Radio groups (wood, colours, finish) with `fieldset`/`legend`; selection shown by shape (ring + check), not colour alone. Colour swatches have names.
- Canvas: `role="img"`, `tabindex="0"`, dynamic `aria-label` per the plan, `aria-describedby` = camera keyboard help. Keyboard: arrows orbit, +/- zoom, 0 reset. Focus ring visible on the canvas. Escape inside the canvas moves nothing; Tab leaves it (no keyboard trap).
- Live regions: Estimate results debounced about 500 ms in `aria-live="polite"` (one summary sentence: "20.00 square metres, 374 planks including 12 percent waste"). Toasts: `role="status"` (polite); errors `role="alert"`. The loading message is `role="status"`.
- Export fallback dialog: `role="dialog"`, `aria-modal`, labelled by its title, focus moves to the Close button, returns to Save image on close, Escape closes.
- Focus management: opening the Views popover moves focus to the first item and returns on close; sheet movement never steals focus; after Reset focus stays on the Reset button.
- Targets >= 44 x 44 px (slider thumbs at least 28 px visible with a 44 px hit area); spacing between adjacent targets >= 8 px. WCAG 2.2 AA: 2.5.7 dragging alternatives (number inputs, handle button, zoom buttons), 2.4.11 focus not obscured (peeked sheet must not cover a focused control; scroll into view above the sheet).
- Panel surfaces are opaque enough for 4.5:1 text and 3:1 for control boundaries/focus rings over the moving view.
- Reduced motion respected (see States). Zoom to 200% and 400%: panel scrolls, no clipped controls; text resizes with browser font size.
- Page `<title>`: "Floor designer - Parket"; one `<h1>` (visually hidden: "Floor designer"); tab panels use `<h2>` visually hidden or visible titles.

## Open questions

- **O1. Room length/width vs window wall.** Assumed: Length is along the wall with the window; no rotation control. Recommend: keep, since swapping length and width achieves the same.
- **O2. Sun direction semantics.** Resolved: the slider is limited to the window-facing half (90-270 deg), since the other directions put the sun behind solid walls and do nothing. The "sun behind the window wall" hint is therefore not needed.
- **O3. Room max 12 m and plank limits** (300-1200 x 50-200 mm) are my proposal within D3/D4's cap reasoning. Recommend: adopt; tester verifies performance at the extremes.
- **O4. Reset without a confirm dialog but with Undo (8 s).** Recommend: adopt; it needs a small undo buffer in `DesignState` (frontend).
- **O5. First-visit sheet open at Half on the Floor tab** vs always Peek. Recommend: Half on first visit only.
- **O6. Wall/ceiling presets and species list** come from the designer; this spec assumes 6-8 colour presets and 5-6 species.
- **O7. Skip-animation on early input on landing** (tap/keydown shows the CTA at once). Recommend: adopt; it is cheap and avoids an invisible-link trap.

## Resolved (main session, 2026-10-22)

O1–O7 resolved by adopting the recommendations above. O6 is delivered by the designer.

## Review (built UI)

Reviewed 2026-10-22 from code only (no browser). Paths are under `src/app/designer/` unless noted. Items marked "verify" need a check in a real browser at the stated size. Already-known fixes (sun range 90-270, CTA opacity and focus reveal, inert body at Peek, 3-col wood grid, icon-only Save below 440 px, axe region fix) look correct in code and are not repeated.

What matches the spec and is fine: copy (tabs, units, hints, toasts, errors, dialog), tab ARIA pattern with roving tabindex, Home/End and arrows, sheet handle as a button with `aria-expanded`/`aria-controls`, drag alternatives (handle button, number inputs, zoom buttons), radio groups with legend and shape-based selected state (ring plus check), disabled sun sliders kept visible, switch with visible state text, debounced polite estimate sentence, reduced-motion handling, Reset without confirm plus Undo, export fallback dialog with focus move, trap, Escape and focus return.

### Must-fix

1. **Help and Views popovers clip off the left edge on phones narrower than about 384 px.** **Fixed** (popovers anchor to the toolbar with 12 px side insets and width caps). `ui/view-toolbar.scss:69-93`. `.popover` is `right: 0` of its small `.menu` wrapper, so the help popover (width `min(20rem, 100vw - 2rem)`) extends left from the "?" button. At 360 px wide its left edge is about -24 px, at 320 px about -64 px, so the start of every help line is cut off. The Views popover (min-width 14rem) clips similarly at 320 px. Expected: both popovers fully inside the screen with at least 8 px margin on every phone width. Fix: make `.menu` `position: static` below 900 px (the `.bar` is already the nearest positioned box via `:host`) and give `.popover` `right: var(--space-3); left: auto; max-width: calc(100vw - 2 * var(--space-3))`, or use `position: fixed` with the same insets. Verify at 320, 360, 375, 390.

### Should-fix

2. **Number box can show a value that is not the real value.** **Fixed** (the box resyncs to the real value after every commit). `ui/slider-field.ts:94-108`. `commit()` clamps to the absolute `min/max` and writes that to the DOM, but the parent may clamp further (plank width max `floor(length / 2)`, plank length min `2 x width`). If the state value does not change (the field is already at its dynamic limit), Angular does not re-bind and the box keeps the typed value. Example: length 300, width already 150, type 200 in Width: box shows 200, state is 150, the plank rule error shows. Expected: after commit the box always shows the actual `value()`. Fix: after emitting, schedule a re-sync (`afterNextRender` or `queueMicrotask`) that writes `format(this.value())` to the input; or clamp to `effectiveMin/effectiveMax` before emitting and write that.
3. **Validation messages are not announced.** **Fixed** (persistent polite live region for the message (the Floor tab's own plank-rule paragraph in `floor-tab.ts` is not covered here, owned by the other dev)). `ui/slider-field.html:46` and `ui/tabs/floor-tab.ts:9`. The hint paragraph that carries "Use 2.00 to 12.00 m" and "Plank length must be at least twice the width." is not a live region, so screen reader users get no feedback when the value is refused (the red text and `aria-invalid` are only read on re-focus). Expected: the message is spoken once when it appears. Fix: give the error text its own persistent `aria-live="polite"` wrapper (not the whole hint, so range text is not re-read), or `role="alert"` on the error span only.
4. **Undo toast is hard to reach by keyboard and times out too fast to find.** **Fixed** (toast host now follows the sheet in DOM order and the timer pauses on hover and focus). `designer.html:1-8`, `ui/toasts.ts:55`, `ui/tabs/estimate-tab.ts:66-76`. The toast host sits in `<main>` before the sheet in DOM order, so after pressing Reset design (inside the sheet) a keyboard user must Shift+Tab back through the whole page to reach Undo within 8 s. The timer also keeps running while the toast has focus or hover (WCAG 2.2.1 Timing Adjustable, and the same for the Retry action on the 8 s error toast). Expected: Undo is one Tab away from Reset, and the toast does not vanish while hovered or focused. Fix: pause the timer on `pointerenter`/`focusin` and resume on leave; render the toast host after the sheet in `designer.html` (it is absolutely positioned, so the layout does not change) so Tab from Reset lands on Undo; optionally also accept Ctrl/Cmd+Z while the undo toast is up.
5. **Canvas stays focusable and announced while the 3D view is not there.** **Fixed** (canvas is `tabindex -1`, `aria-hidden` and unlabelled unless status is ready). `viewport/viewport.ts:43-51` with `ui/viewport-status.ts`. During Loading, No WebGL, Error and Context lost the overlay covers the canvas visually, but the canvas keeps `tabindex="0"`, `role="img"` and the label "3D view: 5.00 by 4.00 m room...", so keyboard and screen reader users land on a view that does not exist, and keyboard focus is invisible under the overlay. Expected: not focusable unless status is `ready`. Fix: bind `[attr.tabindex]="ready() ? 0 : -1"` and `[attr.aria-hidden]` (or a different label) when not ready; alternatively make the overlay `inert`-covering via the same condition.
6. **Loading message may not be announced.** **Fixed** (persistent empty `role=status` region, text set after first render; visible text is `aria-hidden`). `ui/viewport-status.ts:9-14`. A `role="status"` element inserted already containing its text is often skipped by screen readers; the live region must exist first. Expected: "Preparing your room..." is announced once. Fix: keep a persistent `<p role="status" class="visually-hidden">` in the template whose text changes with the status, and keep the visible text `aria-hidden` or non-live. The same applies to "Display paused. Restoring..." (`.paused`).
7. **Keyboard/DOM order differs from the spec.** **Fixed** (toolbar now precedes the canvas). `designer.html:2-6`. Order is canvas, then toolbar, then toasts, then sheet. Spec: back link, Views, Save image, then canvas. Keyboard users Tab into the canvas first and hit three or four toolbar items only after leaving it; there is also no skip link. Expected: toolbar before canvas in DOM, canvas below it, sheet last. Fix: move `<app-view-toolbar />` above `<app-viewport />` (it is absolutely positioned and has `z-index`, so no visual change). Keep `<app-viewport-status />` after the canvas.
8. **First-visit hint shows touch wording to everyone.** **Fixed** (wording follows `(pointer: coarse)`; keydown in the stage also dismisses). `designer.ts:46-52`. A desktop or keyboard user reads "Pinch to zoom. Two fingers to move." Expected: wording matches the input device (spec "Camera: presets and help"). Fix: pick the string with `matchMedia('(pointer: coarse)')`: touch text, otherwise "Drag to look around. Scroll to zoom. Right-drag to move." Also the hint dismisses on any `pointerdown` in `.stage`, including the toolbar; that is fine, but keyboard users should also dismiss it on first key press in the stage (6 s auto-dismiss covers it otherwise).
9. **Half stop leaves almost no room for controls on short phones.** **Fixed** (Half = `min(max(50%, 24.4rem), 65%)`; verify in browser). `ui/controls-sheet.scss:19-25`, `designer.scss:12-25`. Half is 50% of the height with the handle (44), estimate summary (~40) and tab row (44) always on top, about 130 px of fixed chrome. On a 568 to 667 px high phone (SE, small Androids with browser bars) only 150 to 200 px is left, about one slider field, and the first-visit default (Half on Floor) shows a wood picker cut in half. Expected: at Half at least one full field plus its hint is visible without scrolling at 640 px height. Verify at 360x640 and 375x568. Possible fix: use `max(var(--sheet-half), 22rem)` as the Half height, capped so at least 35% of the view stays visible; or hide the summary line at Half and show it only at Peek and Full (the numbers are on the Estimate tab).
10. **Landing CTA can fall off the screen on short landscape phones.** **Fixed** (short-height media query plus clamped `top`; verify in browser). `landing/landing.scss:210-229`. `top: calc(50% + max(6rem, 14vh))` plus a roughly 80 px high CTA block: at 320 px viewport height that is 160 + 96 + 80 = 336 px, past the bottom edge (`:host` is `overflow: hidden`, so it cannot be scrolled to). Expected: the CTA is fully visible and tappable at 667x320 and 568x320. Verify. Fix: `top: min(calc(50% + max(6rem, 14vh)), calc(100dvh - 6.5rem - env(safe-area-inset-bottom)))`, or switch `.cta` to a normal-flow grid row under the lockup for landscape.
11. **First tap on the landing page does not activate the CTA.** **Fixed** (reveal is instant (`animation: none`, opacity 1) on first tap; the tap itself still does not navigate, as specified). `landing/landing.scss:219-228`, `landing.ts:10`. While the CTA is transparent it has `pointer-events: none`, so a tap on it reveals it (O7, as specified) but the tap itself goes nowhere and a second tap is needed. That is acceptable, but then the tap should still be visible feedback: make sure the reveal is instant (animation `none` plus opacity 1 is set, good) and check there is no flash. Verify on a touch device that revealing is immediate, not a 0.6 s fade, and that the hit area is already live under the finger on the second tap.

### Nice-to-have

12. **No active-preset indication.** `ui/view-toolbar.html:18-28,64-68`. Spec: the active preset is marked until the camera is moved. Add `aria-pressed` and a visible selected style on the preset buttons/items, cleared when the user orbits. Needs a "preset active" signal from `SceneCommands`.
13. **Popovers do not close on Tab-away.** `ui/view-toolbar.ts:20,73-77`. Escape and outside click close, but tabbing out of the popover leaves it open over the view. Close on `focusout` when focus leaves the menu wrapper.
14. **Help popover focus lands on "Close", not on the text.** `ui/view-toolbar.ts:38-41`. Focus goes to the first button, so a screen reader announces "Close" before it reads the help. Give the popover `tabindex="-1"` and focus it (name from `aria-label`) for the help variant; keep first-item focus for Views.
15. **Views/Save tooltip says "Needs 3D view" while merely loading.** `ui/view-toolbar.ts:29-30`. Use `null` while status is `loading` and the tooltip only for `no-webgl`/`error`. Also `title` is invisible on touch, so the disabled state has no explanation for phone users; consider a short visible hint in the no-3D card ("Saving and views need the 3D view.").
16. **Back link name is just "Parket".** **Fixed** (accessible name is "Back to Parket home"). `ui/view-toolbar.html:2-14`. Make it "Parket home" (`aria-label`) so its purpose is clear out of context.
17. **Arrow keys on the tab row at Peek change the tab silently.** `ui/tab-list.ts:50-73`, `ui/controls-sheet.ts:47-54`. With the sheet collapsed nothing visible happens (the body is inert, content hidden). Acceptable, but consider opening to Half on the first arrow press for sighted keyboard users.
18. **`aria-controls` points to panels that are not in the DOM.** **Fixed** (`aria-controls` only on the selected tab). `ui/tab-list.ts:23` and `controls-sheet.html:18-46` only render the selected panel. Not harmful in practice; to be clean, render all panels with `hidden` or drop `aria-controls` on unselected tabs.
19. **Duplicate region name.** **Fixed** (tablist renamed "Sections"). `controls-sheet.html:1` (`aria-label="Design controls"`) and `tab-list.ts:15` (tablist `aria-label="Design controls"`). Rename the section to "Controls" or the tablist to "Sections".
20. **Assumptions text appears twice on desktop.** `ui/tabs/estimate-tab.ts:46-50`, `estimate-tab.scss:57-66`. The note and the disclosure repeat the same paragraph at >= 900 px. Show the full text only inside the disclosure, plus a one-line "Estimate only. Check with your supplier." note on desktop.
21. **Brightness unit is read as "times".** `ui/slider-field.ts:5-11`. `aria-valuetext` reads "1.0 times". Better: map `x` to "times normal" or drop the unit name, giving "1.0 brightness" via the label.
22. **Save icon-only breakpoint is 440 px, spec said 360 px.** **Fixed** (spec line updated to 440 px (the `title` on the icon-only button is not added)). `ui/view-toolbar.scss:142`. Fine and intentional (room for Parket, Views, ?), but update the spec line "icon only below 360 px" to 440 px to keep the documents consistent. The icon-only button also has no `title`, so sighted mouse/long-press users see no label; add `title="Save image"` when below 440 px (or always).
23. **Peek has no explicit hint that the sheet can be dragged.** The handle looks right and is a labelled button, so this is fine; just verify the handle bar contrast (`--control-border` on `--surface-overlay`) reaches 3:1.

### To verify in a browser

- Popover positions at 320, 360, 375, 390, 412 px (item 1) and in landscape 667x375.
- Peek, Half, Full on 360x640, 375x568, 390x844, 412x915: nothing in the focused tab hidden behind the sheet; at 200% zoom and 400% zoom the panel scrolls with no clipped controls; the 5-tab row scrolls horizontally at 320 px and the focused tab scrolls into view.
- Keyboard-only pass: Tab order (item 7), arrows/Home/End in tabs, handle Enter/Space, Escape in popovers, Reset then Undo (item 4), dialog trap and focus return after Save on an iOS user agent.
- Focus visibility and 3:1 contrast: range thumb ring, wood cards and swatches over the translucent sheet (`--surface-overlay` with backdrop blur, over bright floor), the selected ring `--accent` against the panel, the canvas inset ring.
- Landing CTA text and border contrast at the revealed state over the brightest part of the floor (axe cannot measure over images and blur); CTA position on 667x320 (item 10); Tab as the very first key shows the CTA and focuses it; reduced motion shows it immediately.
- Number input behaviour on a phone keyboard: `inputmode="decimal"` shows a decimal pad; typing "4." and "4,5" (comma locales) is not rejected; blur clamps; the spinner/arrow-key steps apply immediately.
- Screen reader smoke test (TalkBack or VoiceOver): tab names, slider value text "30 degrees", switch state, loading message (item 6), validation message (item 3), estimate sentence announced once after a slider drag.
- No WebGL: disable WebGL in the browser flags, confirm the Estimate tab opens at Half, Views and Save are disabled with the explanation, and Try again recovers.
- Slow network: the "Couldn't load the designer. Check your connection." state from the States table. There is no handling for it: `app.routes.ts:10` uses a bare `loadComponent` and nothing in `src/app` shows that message, so an offline first visit ends in a blank or failed navigation. This was a should-fix (item 24). **Fixed**: `loadDesigner()` in `app.routes.ts` catches the import error and renders `load-error/designer-load-error.ts` ("Couldn't load the designer", Try again, link home).
