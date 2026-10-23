# UX spec: Colour mode and per-surface colours

Plan: `docs/plans/wall-colouring.md` (W8, answers Q1/Q2). Builds on `docs/ux/floor-visualizer.md` (Surfaces tab, view toolbar, sheet) and `docs/ux/custom-room-shape.md` (names "Wall N" / "Door N"). Visual styling is the designer's job.

## Users and goal

Home owners trying wall, door, skirting and ceiling colours with their floor. Mostly on a phone. Goal: tap the thing you want to change, pick a colour, see it at once. Same result without 3D taps (keyboard, screen reader, no WebGL): choose the surface from a list.

Principles: one tap selects, one tap colours; the list does everything the taps do; no new modes to learn beyond one toggle; no Apply buttons.

## User flow

Happy path (touch):
1. User taps **Colour** in the top bar. The sheet opens to Half on the Surfaces tab. Hint: "Tap a wall, door, skirting or the ceiling."
2. User taps a wall in the 3D view. It is highlighted. The sheet shows "Wall 3" and its palette. Live region: "Wall 3 selected."
3. User taps a swatch (or Custom). The wall changes at once.
4. User taps another surface, or taps empty space (floor, window, sky) to deselect, or taps **Colour** again to leave the mode.

Alternatives:
- **List path (any input).** Open Surfaces, pick a surface in the list (highlights in 3D, works with Colour mode off), pick a colour.
- **All walls with accent walls (Q1).** Picking a colour for "All walls" when any wall has its own colour asks first (see Confirm). Without accent walls it applies at once.
- **Door (Q2).** A door colour paints the leaf and its frame. Window frames never change.
- **Use default.** Each surface has a default swatch that removes its own colour.
- Drag, pinch, two-finger pan and long press never select. Tapping is the only way (so orbiting is unaffected).

## Screens

### 1. View toolbar: Colour toggle

- Toggle button "Colour" (`aria-pressed`), icon (paint drop) + text, after the Views group; text hides below 440 px like Save image (icon-only keeps the accessible name).
- Phone: also an item in the Views popover, "Colour mode" with `aria-pressed`, sub-text "Tap surfaces to colour them". Choosing it closes the popover and turns the mode on.
- Pressed state: filled, plus a check/dot (not colour alone).
- No 3D view: `aria-disabled="true"`, title "Needs 3D view". The list path still works (see States).

```
[<] Parket        [Corner][Doorway][Top-down][-][+] [Colour] [?] [Save image]
```

### 2. Surfaces tab (rewritten)

Purpose: choose a surface, then a colour. Order: list, then palette.

```
Surfaces
Tap a wall, door, skirting or the ceiling.   <- hint, only while Colour mode is on

Walls
 (o All walls) ( Wall 1 window ) ( Wall 2 ) ( Wall 3 ) ( Wall 4 )
Doors                                   <- Custom shape with doors only
 ( All doors ) ( Door 1 ) ( Door 2 )
Other
 ( Ceiling ) ( Skirting )

Colour for Wall 3                        <- h3, names the target
 [Same as other walls] [swatch][swatch]...[swatch] [+ Custom]
 Wall 3 is Warm white.                   <- one muted line, current value
```

- List = one radio group per section (`fieldset` + `legend`: Walls, Doors, Other), wrapped pill chips, each with a small colour chip of the current colour (shape: ring + check on the selected one, not colour alone). Chips scroll with the tab; with many walls (up to 32) the sections just wrap.
- One selection across all three groups (a single `role="radiogroup"` is not possible across fieldsets, so selecting in one group clears the others; arrows move within a group, Tab moves between groups).
- Palette: the existing `SwatchGroup` plus an optional first **default swatch** (text chip, not a colour).
- Opening the tab with nothing selected selects "All walls" (palette always visible; same as today's Wall colour control). Leaving the tab clears the selection and the highlight.
- Tap selection in 3D: the list updates, the sheet goes to Half if lower, the palette heading scrolls into view. **Focus is not moved** (the user is on the canvas).
- Desktop: same content in the 360 px panel; chips wrap.

### 3. Palette and "Use default" copy

| Surface | Default swatch (selected when no own colour) | Notes |
| --- | --- | --- |
| All walls | none | Sets the base colour and clears accent walls |
| Wall N | "Same as other walls" | Removes this wall's own colour |
| Ceiling | none | Always has a colour |
| Skirting | "Match walls" | Each piece follows its wall |
| All doors | "Auto" | Wood on light walls, white on dark |
| Door N | "Auto" | Same rule for that door |

- Hint under Doors palettes: "Paints the door and its frame."
- Custom, details below.

### 4. Custom colour

Recommendation: keep the native `<input type="color">` behind the "+ Custom" swatch (already built). It works on iOS Safari 12.2+ (system colour sheet, with spectrum, sliders and eyedropper) and Android Chrome (system dialog), and desktop (native popup, Firefox/Chrome/Safari). No library, no extra code, accessible by default. A home-made picker adds a lot of work and touch problems for little gain.

Behaviour:
- The swatch shows "+" until used; once the current colour is not a preset, it shows that colour with a check.
- Update live while the user drags in the picker (`input` event): materials only, cheap. The value is kept when the picker closes.
- **Hex readout.** Under the palette: "Custom: #a1b2c3" (shown only when the colour is custom, muted). It lets people note or compare a colour. No hex text field in v1 (see Q-A).
- Pickers are system UI: on phone they may cover the sheet and view while open; this is normal, the colour is already applied when it closes.
- Exception for the confirm: for "All walls" with accent walls, a custom colour is applied on the picker's `change` (close), not on every `input`, so the confirm shows once.
- Accessible name per target: "Custom colour for Wall 3", "Custom ceiling colour", etc.

### 5. Confirm: change all walls (Q1)

In-app dialog (not `window.confirm`), shown when "All walls" gets a colour while at least one wall has its own colour.

```
+------------------------------------+
| Change all walls?                  |
| Wall 2 and Wall 4 have their own   |
| colours. They will all become this |
| colour.                            |
|        [Cancel] [Change all walls] |
+------------------------------------+
```

- Names the walls up to 3 ("Wall 2, Wall 4 and Wall 5"); more: "5 walls have their own colours."
- Confirm: every wall gets the colour, accent walls are cleared, toast "All walls changed. Undo" (8 s, same Undo as Reset).
- Cancel / Escape / backdrop: nothing changes; the swatch selection stays on the old value. Colour mode and selection unchanged.
- Without accent walls: no dialog.
- `role="alertdialog"`, `aria-modal`, labelled by the title, described by the body. Focus goes to **Cancel** (safe default); returns to the swatch that opened it (or Colour chip). Background `inert`.

## States

| State | Behaviour |
| --- | --- |
| Colour mode off | Surfaces tab works from the list; canvas taps do nothing; toggle not pressed. |
| Colour mode on, nothing selected | Palette area shows "Select a surface to colour it." (hint stays). Reached by tapping empty space. |
| Colour mode turned off | Selection and highlight clear. If the Surfaces tab is open, it falls back to "All walls" selected. |
| Simple mode | Walls: All walls, Wall 1 (window) to Wall 4; Other: Ceiling, Skirting. Doors section replaced by a muted line "Doors can be added in a custom room shape." |
| Custom mode, no doors | Same: doors section shows that line. |
| Selected surface disappears (plan edit, mode switch) | Selection clears; tab falls back to "All walls" if open. No error. |
| No WebGL / 3D unavailable | Colour toggle disabled with title "Needs 3D view". List and palettes stay fully usable; the Estimate-tab auto-open rule from the visualizer spec is unchanged. |
| Loading | Toggle disabled until the scene is ready. |
| Plan editor open | Designer is inert; nothing to colour. |
| Export | The saved PNG never contains the highlight. No UI feedback needed. |
| Reset design | Colours return to defaults (accent colours removed, shape kept); toast and Undo as before. |
| Reduced motion | Highlight appears without fade; sheet moves without animation. |
| Permissions | None. |

## Copy

- Toggle: "Colour"; popover item: "Colour mode" / "Tap surfaces to colour them".
- Hint (mode on): "Tap a wall, door, skirting or the ceiling."
- Empty palette: "Select a surface to colour it."
- Groups: "Walls", "Doors", "Other". Chips: "All walls", "Wall 1 (window)" (Simple mode only), "Wall N", "All doors", "Door N", "Ceiling", "Skirting".
- Palette heading: "Colour for {surface}" (e.g. "Colour for all walls", "Colour for Door 2").
- Current value line: "{Surface} is {colour name}." / custom: "Custom: #a1b2c3". Default state: "Wall 3 is the same as other walls." / "Skirting matches the walls." / "Door 2 is automatic."
- Default swatches: "Same as other walls", "Match walls", "Auto".
- Door hint: "Paints the door and its frame."
- Confirm: see screen 5. Toast: "All walls changed." with Undo.
- Live region (polite, persistent, in the Surfaces tab so it exists when the tab is closed too: lives in the designer shell):
  - "Wall 3 selected." / "All doors selected." / "Selection cleared." (empty tap)
  - "Colour mode on. Tap a surface." / "Colour mode off."
  - "Wall 3: Warm white." After a custom colour: "Wall 3: custom colour a1b2c3", debounced 500 ms, announced once per drag.
  - "Wall 3: same as other walls." / "Door 2: automatic."
  - "All walls: Warm white. Accent walls cleared."

## Accessibility

- Every action has three paths:

| Action | Touch | Mouse | Keyboard / screen reader |
| --- | --- | --- | --- |
| Turn Colour mode on/off | Tap toggle | Click toggle | Tab to toggle, Enter/Space; Escape in the stage turns it off |
| Select a surface | Tap in 3D, or list chip | Click in 3D, or list chip | Surfaces list (arrows within a group, Tab between groups) |
| Deselect | Tap empty space | Click empty space | Escape (nothing in the list is "none"; selecting All walls is the neutral state) |
| Pick a colour | Tap swatch | Click swatch | Arrows in the swatch radio group, native picker via Enter on Custom |
| Use default | Tap default swatch | Click | Same radio group |
| Confirm all walls | Tap button | Click | Focus on Cancel, Tab to confirm, Escape cancels |

- Tab order in the tab: hint, Walls group, Doors group, Other group, palette heading, default swatch, presets, Custom, current value line. The 3D canvas is not in this order; canvas has no pick-by-keyboard (the list is the path). Tell screen readers via the canvas `aria-description` while the mode is on: "Colour mode is on. Use the Surfaces tab to pick a surface from a list."
- Radio semantics: each group is a `fieldset` with a `legend`; chips are native radios with visible text names; selected = ring + check. Colour chip inside each list item is decorative; the text name carries meaning, and the current colour name is in the item's `aria-describedby` ("Warm white").
- Toggle: `aria-pressed`, name "Colour"; disabled uses `aria-disabled` (stays focusable, like Views).
- Escape order: confirm dialog first; then the Views popover (existing); then, with focus in the stage or toolbar, Colour mode off. Escape never closes the sheet.
- Selecting in 3D never moves focus. Focus changes only when a dialog opens/closes.
- Live region as in Copy; do not announce hover or highlight changes; custom-colour drags announce once.
- Contrast: chip borders and ring 3:1; the toggle's pressed state differs by fill and a mark, not hue only; the 3D highlight must be visible on white and charcoal walls (designer; if the tint is too subtle, add an edge outline). The highlight is not the only indicator: the list and heading name the target.
- Targets >= 24 px (WCAG 2.5.8) by `--target-min`; with the compact phone scale (2.2rem) list chips and swatches stay >= 35 px with 8 px gaps. Text inputs keep 16 px (no iOS zoom).
- Pointer: tap vs drag threshold is 8 px / 500 ms (plan W7); 2.5.7 is met because every drag-free path exists in the list.
- No time limits; no auto-closing messages except the Undo toast (pauses on hover and focus).

## Questions

- **Q-A. Hex entry for Custom.** Native picker only with a hex readout (recommended) / add a hex text field next to Custom for people who know a code.
- **Q-B. Default selection on entering the Surfaces tab.** "All walls" selected and highlighted (recommended, keeps the old one-tap wall colour) / nothing selected until the user chooses.

## Answers (user, 2026-10-23)

- Custom colour: native picker plus a hex readout only. No hex text field.
- Entering the Surfaces tab without a tap selects "All walls" and highlights them.

## Review (built UI)

Reviewed 2026-10-23 against this spec, the plan answers and `docs/design/components/colouring.md`. Read only; no code changed. Not run in a browser, so items marked "verify" need a device check. Most of the spec is met: radio fieldsets per section, ring plus check on the selected chip, default swatches, hex readout (no hex field), deferred custom colour for "All walls", confirm dialog (Cancel focus, Escape, scrim, inert, focus return), Escape order, live region in the shell, no focus move on 3D taps.

### Must

None found. No blocker for keyboard, screen reader or touch use.

### Should

1. **Sentence-case bug in the value line and announcements.** (Fixed) `ui/tabs/surfaces-tab.ts` `subjectOf()` returns `item.name`, which is lowercase for "all walls", "all doors", "the ceiling", "the skirting". Result: "all walls are Warm white.", "the ceiling is White.", and announcements "the ceiling: White." Spec copy is "All walls: ...", "Ceiling: ...". Fix: give `SurfaceItem` a separate `subject` field (sentence start: "All walls", "Ceiling", "Skirting", "All doors", "Wall 3") in `ui/surface-model.ts`, and use it in `valueLine`, `announce()` and `askAllWalls`. Keep `name` for the heading ("Colour for the ceiling").
2. **Palette can sit below the fold after a 3D tap.** (Fixed) `surfaces-tab.ts` `scrollToPalette()` scrolls the `h3` heading with `block: 'nearest'`; at Half (or on a phone) the heading lands at the bottom edge and the swatches stay hidden, so "one tap selects, one tap colours" needs a scroll. Fix: put the `#heading` ref on the `<section class="palette">` (or its swatch group) and scroll with `block: 'end'`/`'nearest'` so the whole palette is visible; with up to 32 walls the list above is long.
3. **Colour mode is invisible and hard to leave on a phone.** (Fixed) Below 900 px the toggle is only an item inside the Views popover (`ui/view-toolbar.html`, `.colour-toggle { display: none }` in `view-toolbar.scss`). With the popover closed nothing shows the mode is on, and turning it off takes three taps (Views, item, auto-close); Escape does not exist on a phone. Fix: (a) when `colouring.active()`, give the Views button a pressed look plus a dot/check and add "Colour mode on" to its `aria-label` (or a visually hidden text); (b) in the Surfaces tab hint add a small "Done" text button next to "Tap a wall, door, skirting or the ceiling." that calls `colouring.setActive(false)` and announces "Colour mode off." Spec edit: add this to screen 1 and 2.
4. **Text too small on phones.** (Fixed) `_phone-scale.scss` sets `--text-xs: 0.6rem` (9.6 px) and `--text-sm: 0.7rem` (11.2 px). Informational text uses xs: hex readout and door hint (`surfaces-tab.scss` `.readout`), surface-list legends (`surface-list.scss`), popover sub-text (`view-toolbar.scss` `.item small`). Contrast passes but a hex code at 9.6 px is hard to read and to copy. Fix: in the phone block set `--text-xs: 0.7rem` (11.2 px) and `--text-sm: 0.75rem` (12 px); and use `--text-sm` for `.readout` in `surfaces-tab.scss`. The legend can stay caps/xs once xs is 11.2 px.
5. **Focus ring clipped at the left edge of the surface list.** (Fixed) `surface-list.scss` `.options` has no padding (the swatch group gets `padding: var(--space-1)` from `choice-group`). The chip focus outline (2 px + 2 px offset + 5 px halo) overflows the scrolling tab area, so the first chip in each row can lose its ring (verify on a device). Fix: add `padding: var(--space-1)` to `.options` (or `padding-inline: 6px`) as in `shared.choice-group`.
6. **Dialog buttons visually reversed from focus order on phones.** (Fixed) `colour-confirm-dialog.scss` `.actions` uses `column-reverse` below 600 px: Primary is on top, but Tab/initial focus go to Cancel, which is the bottom button. WCAG 2.4.3 (focus order should follow visual order). Fix: keep `column-reverse` only if focus starts on the visually first control is not required; simpler: stack in DOM order with Cancel first (top) on phones, or move DOM order to Primary, Cancel and keep initial focus on Cancel explicitly (it is already focused by script, so reorder the DOM and the trap logic still works). Update the design doc line "Primary on top" accordingly.

### Nit

7. **Same message is not re-announced.** (Fixed) `ui/colour-announcer.ts` sets the same string; a `role=status` region ignores an unchanged value, so tapping the same wall twice, or choosing the same colour again, is silent. Fix: clear to `''` then set on the next microtask/animation frame (or append a zero-width space alternately).
8. **`aria-description` has patchy support.** (Fixed) `viewport/viewport.ts` `colourHint` uses `aria-description` (ARIA 1.3). Fix: render a second hidden `<p id="viewport-colour-help">` while the mode is on and add its id to `aria-describedby` (`helpId` plus the colour id).
9. **Highlight stays on while judging a colour.** With Q-B (All walls selected on entering the tab) the walls keep the amber tint while the user picks, which skews the colour they compare. Fix (design call): fade the highlight to zero 1.5 s after a colour pick, or drop it while the native picker is open; re-show on the next selection. Only if the user wants it; Q-B itself is met.
10. **Custom label for "All walls".** `surfaces-tab.ts` uses "Custom wall colour"; spec pattern is "Custom colour for all walls" (consistent with "Custom colour for Wall 3"). Also "Custom ceiling colour" and "Custom skirting colour" are fine. Fix: use the pattern for all walls.
11. **Chip gaps are tight on phones.** `surface-list.scss` `.options` gap `--space-2` is 6.4 px at 0.8 scale. Targets are 35 px (above the 24 px minimum), but dense rows of up to 32 walls invite mis-taps. Fix: `gap: var(--space-3)` for the row gap on phones.
12. **Popover row height.** Design doc says the Colour mode row is 44 px; `view-toolbar.scss` `.item` uses `--target-min` (35 px on phones). Fix: `.colour-item { min-height: 2.75rem; }` or accept 35 px and update the design doc. Same for the other popover items.
13. **Unclear token name.** (Fixed) `view-toolbar.html` reuses `saveTitle()` for the Colour and Views buttons. Rename to `needs3dTitle` (no behaviour change).
14. **Toast stays interactive behind the confirm.** (Fixed) `designer.html` makes `main` and the sheet inert while the confirm is open but not `<app-toast-host>`; an Undo toast from an earlier action stays focusable. Fix: also bind `[attr.inert]="covered() ? '' : null"` on `app-toast-host`.
15. **Wall that equals the base colour reads as "Same as other walls".** `surfaces-tab.ts` treats `item.hex === wallColor` as no own colour, so a wall deliberately set to the same swatch cannot show that swatch as selected. Harmless to the user (the look is identical) but the value line says "the same as other walls". No fix needed unless the model keeps per-wall own colours distinct from the base; then use the paint map key instead of hex.

### Fix log

All Must/Should items and review nits 7, 8, 13 and 14 are Fixed. Also fixed from the code review: the "All walls" Undo only shows while mode and room shape are unchanged and restores in one update; the confirm dialog keeps focus (document-level Escape/Tab, focus pulled back to Cancel, toast host inert); a stuck pointer no longer blocks tapping; the missing-id fallback uses the base wall colour; picking the base colour for a wall stores no override. The highlight is scaled down on dark colours (see `docs/design/components/colouring.md`, section 5). Items 9 to 12 and 15 were not requested and stay open.

### Phone scale check summary

- Targets: swatches, chips, toolbar buttons and dialog buttons are 35 px (`--target-min` 2.2rem), above WCAG 2.5.8 (24 px). Below the 44 px platform advice, but acceptable with the 8-10 px swatch gap. Keep.
- Readability: 9.6 px (xs) is the problem (item 4); 11.2 px (sm) for chip and button labels is borderline (item 4). Inputs stay at 16 px (no iOS zoom), good.
- Borders and rings keep 1-2 px as designed; the selected cues (ring, check, text) do not depend on colour alone.

## Change (user, 2026-10-23)

- While the Surfaces tab is open, a tap on a wall, door, ceiling or skirting in 3D selects it even with Colour mode off (`ColouringState.picking` = Colour mode OR Surfaces tab open). A tap on empty space falls back to "All walls".
