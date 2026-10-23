# UX spec deltas: dock + tray

Plan: `docs/plans/dock-redesign.md` (D1-D10, answers Q1-Q5, task 2). Source: `docs/ux/ui-review.md` section 2 and its answers. This file holds only what those leave open. It replaces the layout parts of `floor-visualizer.md`, `wall-colouring.md` and `share-and-projects.md` (toolbar, sheet, tabs, Colour mode, Reset placement); their copy, dialogs, toasts and Projects behaviour still apply. Visual styling is the designer's job (`docs/design/components/dock.md`). Size: the compact 0.8x phone scale stays (targets >= 24 px, actual 35 px; text >= 11.2 px).

## Users and goal

Home owners on a phone (also desktop) who tune a floor and compare colours while watching the room. Goal: the room stays visible, every control has one obvious home, nothing moves under the finger.

## Decisions taken here (user answers)

- Tray is closed on every visit, including the first. The look-around toast stays. No-WebGL or init error opens Estimate (no focus move on load).
- In Colour, a tap on empty space (floor, window, sky, any non-paintable thing) keeps the current selection. Silent, no toast.
- Saved image: room centred on the full canvas.
- Reduced motion: no tray slide, no frame tween, scrub fade is instant (not removed).
- The plan editor phone rework ships in the same release (v0.3.0).

## User flow (designer)

1. Land in the designer: full-screen 3D, top bar, dock. Tray closed.
2. Tap a dock button: tray opens with that section. Tap another: tray switches. Tap the open one, the chevron, or press Escape: tray closes.
3. Drag a slider: tray fades, floor shows through, bubble shows the value. Release: tray returns.
4. Open Colour: pick a surface in 3D or with the chips, tap a swatch.
5. Project chip: switch / new / rename / duplicate / reset / delete. Camera menu: presets, zoom, help. Share, Save image.

## Copy

Sentence case, "project" not "design" except the existing toast.

| Where | Text |
| --- | --- |
| Dock / rail, tray headings | Room, Floor, Colour, Light, Estimate (same word on button and heading) |
| Dock Estimate button, visible | number over the word "planks" (e.g. 374 / planks). Over 9999 uses the existing thousands format |
| Estimate accessible name | "Estimate, {n} planks to buy, {area} square metres" (e.g. "Estimate, 374 planks to buy, 22.40 square metres"). Contains the visible "374 planks" (2.5.3) |
| Other dock buttons | accessible name = visible label |
| Tray close | icon-only, `aria-label` "Close {Section}" (e.g. "Close Floor") |
| Room | segment "Rectangle" / "Custom shape"; Length; Width; custom: card + button "Edit shape"; More: "Ceiling height" |
| Floor | Wood (strip, radio group "Wood"); Angle; Finish; More: "Plank size and pattern" (plank length, width, planks per block, pattern line) |
| Light | "Sunlight" switch; "Sun direction"; "Sun height"; "Sun brightness" (was "Brightness"). Off: sliders disabled, helper "Turn sunlight on to adjust it." (kept). No More |
| Estimate | big line "{n} planks to buy"; second line "{area} m² incl. {w}% waste"; "Waste allowance"; More: "Details and how it is calculated" (planks needed, skirting length, method) |
| Colour | no More. Radio groups `aria-label` "What to colour" and "Which one". Value line unchanged from today ("Wall 3 is Warm white.") |
| Colour hint chip | with doors: "Tap a wall, door, skirting or the ceiling." Without doors (rectangle, or custom with no door): "Tap a wall, skirting or the ceiling." |
| Which row, ceiling / skirting | note "Whole ceiling." / "All skirting." (reserves the row, see Colour) |
| Camera menu | trigger "Camera" (label on desktop, icon-only on phone with `aria-label` "Camera"); items Corner, Doorway, Top-down (each with its existing sub-line), Zoom in, Zoom out, "How to look around" |
| Top bar | Back `aria-label` "Back to Parket home"; project chip `aria-label` "Projects, current: {name}"; Share `aria-label` "Share link" (visible "Share" on desktop); Save "Save image" (visible on desktop; phone icon-only, `aria-label` "Save image", "Saving image" while busy) |
| Row menu | Rename, Duplicate, **Reset to defaults** (current row only), Delete |
| Reset toast | "Design reset." + Undo; when a custom shape exists, second line "Your room shape is kept." (unchanged) |
| Landing | "Continue: {name}", **"New project"** (returning users), "Design your floor" (first visit), "{n} project(s) on this device" |
| Plan editor phone | see Plan editor |

Hint chip and "Unavailable" copy: Camera and Save without 3D keep `aria-disabled` and title "Needs 3D view" (only for no-webgl/error, not while loading).

## Screens

### Dock / rail and tray

Structure, ARIA and keys are in plan D3 and D4. Deltas:

- DOM order: top bar, canvas, tray, dock/rail. This matches the phone's visual top-to-bottom order and puts the tray directly after the canvas. The dock is one Tab stop (roving tabindex). Left/Right and Up/Down both move; Home/End jump. Arrow keys only move focus; Enter/Space activates (it is a disclosure toolbar, not tabs).
- `#designer-tray` exists in the DOM even when closed (so `aria-controls` is valid): `hidden` and empty of tab stops. Content is rendered only for the open section.
- Open section marker is not colour alone: filled icon plus a bar under/beside the button, plus `aria-expanded="true"`.
- Rows in a tray: label left, value right, slider full width below. Essentials never need scrolling at 360x640 with the tray at its cap; "More" is a native `<details>` whose summary is a full-width row with a chevron. Open state of "More" is kept while the section stays open, reset on close.
- Toasts sit above `--frame-bottom` (above the dock and tray), never over the tray controls.

```
Phone, Floor open (0.8 scale)
+--------------------------------+
| [<] [Kitchen v]    [cam][sh][sv]|
|           3D VIEW              |
|================================|
| Floor                        v |
| (oak)(nat)(smk)(wal)(ash)(wh)> |
| Angle                      45° |
| Finish  [Matte|Satin|Gloss]    |
| > Plank size and pattern       |
|--------------------------------|
| Room [Floor] Colour Light  374 |
+--------------------------------+
```

### Colour section: What / Which

Both rows are native radio groups styled as chips; one tab stop each, arrow keys move and select. The tray height never changes from a tap or a chip change: the Which row keeps its height in every state.

| Room | What chips | Which chips |
| --- | --- | --- |
| Rectangle (simple) | Walls, Ceiling, Skirting (no Doors) | Walls: All, 1, 2, 3, 4 (chip 1 accessible name "Wall 1, has the window") |
| Custom, no doors | Walls, Ceiling, Skirting | Walls: All, 1..N (N up to 32; row scrolls sideways) |
| Custom with doors | Walls, Doors, Ceiling, Skirting | Walls: All, 1..N. Doors: All, 1..D |
| Any, Ceiling or Skirting | - | no chips; the note "Whole ceiling." / "All skirting." |

- "All" chip accessible names: "All walls", "All doors". Number chips: "Wall 3", "Door 1".
- Choosing a What chip selects "All" of that group (or the single ceiling/skirting item); no memory of the last number.
- Opening Colour selects "All walls" if nothing is selected (D6). Switching to another section closes Colour and clears the selection. If the shape changes in the editor and the selected surface no longer exists, selection falls back to "All walls".
- 3D tap on a paintable surface: both rows update, the chip scrolls into view, focus stays where it was (a 3D tap never moves focus). A tap on a surface that has no chip (floor, window, sky) keeps the selection. Screen-reader announcement on a tap is the existing colour announcer text ("{Subject} selected" style, unchanged).
- Swatch strip and value line are unchanged in content: default ("Same as walls" where it exists today), palette, Custom with the native picker and hex readout, "All walls" confirm dialog when accent walls would be overwritten.
- Without 3D the chips and swatches still work (list path); the hint chip is not shown.
- Hint chip: sits under the top bar (`--frame-top`), never blocks taps, no timer. Shown while Colour is open until the first successful 3D tap, then never again (`parket.colourHint.v1`). Announced once through the colour announcer the first time it appears.

### Camera menu

Popover (existing pattern): focus moves to the first item on open; Escape closes and returns focus to the trigger; Tab out or a click outside closes. Preset, Zoom in and Zoom out close the menu and return focus to the trigger (as the Views popover does today). "How to look around" is a disclosure item (`aria-expanded`): it expands the three help paragraphs in place and keeps the menu open. On desktop >= 1200 px the three presets also show inline as shortcuts; the menu still lists everything.

```
[ Camera v ]
 Corner        Standard view
 Doorway       Eye level
 Top-down      Whole floor
 Zoom in
 Zoom out
 > How to look around
   Touch: Drag to look around. Pinch to zoom...
```

### Top bar

`[<] [Kitchen v] ... [Camera][Share][Save image]`.
- Phone targets 35 px each; with the five items the project chip gets about 140 px at 360 px (about 12 characters). Name truncates with an ellipsis. Below 340 px the chip shows icon + chevron only (name stays in `aria-label`). Verify at 320/360/390 (closes review item 13).
- No wrapping to a second line at any width; at 400% zoom (320 CSS px) all five items fit.
- Share shows busy as today.

### Projects dialog: Reset to defaults

- Menu order: Rename, Duplicate, Reset to defaults, Delete. Reset appears on the current row only (hidden, not disabled, on other rows). It is not blocked at the 50-project limit.
- Activating it: `state.reset()`, camera to Corner, dialog closes, toast "Design reset." with Undo (8 s). No confirm (Undo covers it).
- **Focus after Reset: on the toast's Undo button, falling back to the Project chip** (same rule as Delete, review item 1). Plan D8 said "returns to the chip"; this is the delta, because without it Undo is unreachable by keyboard in time. After Undo runs, focus goes to the Project chip.
- Announcement (polite): "Design reset." If Colour is open the selection returns to "All walls".
- Escape order inside the dialog is unchanged: rename, row menu, dialog.

## Focus and Escape

### Focus moves

| Action | Focus goes to |
| --- | --- |
| Dock button opens a closed tray | Tray heading (`tabindex="-1"`, announces "{Section}, heading") |
| Dock button switches section | New tray heading |
| Dock button closes its own open tray | Stays on that dock button |
| Close chevron | The open section's dock button |
| Escape (tray, canvas or dock focused) | The open section's dock button (stays if already there) |
| 3D tap | Nothing moves |
| Tray opened by the app (no-WebGL) | Nothing moves |
| Dock arrow keys | Move between dock buttons only; do not open |
| Tab from the heading | First control in the tray; last control then goes to the dock |
| Camera menu open / close | First item / trigger |
| Projects dialog close after switch, new, duplicate | Project chip |
| After Delete, Reset | Toast Undo, else Project chip |
| Edit shape (plan editor) closes | The Edit shape button, tray still on Room |
| Dialog or plan editor opens | Page behind (top bar, canvas, tray, dock) `inert`; tray state kept; on close focus returns to the opener |

When the tray closes while focus is inside it (Escape from a field, section switch from elsewhere), focus goes to the dock button, never to `body`. A focused control is scrolled into view inside the tray and never sits behind the dock or a toast.

### Escape layering

One Escape closes one thing, innermost first:
1. Modal dialog (rename, then row menu, then dialog; shared prompt, share fallback, colour confirm, image dialog: close themselves).
2. Camera menu popover (the popover handles it and stops it from reaching the tray).
3. Tray (Colour also clears the selection).
4. Nothing. Escape no longer turns anything off (no Colour mode).

Escape while a pointer is holding a slider is ignored. In a number field Escape closes the tray and keeps the typed value (it commits on change as today).

## States

| State | Behaviour |
| --- | --- |
| Closed | Dock only; room frames in the area above the dock |
| Open | Room fully visible above the tray; canvas never resizes; frame eases over the tray duration |
| Scrubbing | Tray background and other rows fade, active row stays opaque, bubble above the thumb, no layout change. Pointer only (never for keyboard or number-field input). Reduced motion: instant |
| Loading 3D | Dock and tray usable; Camera, Save as today (no tooltip while loading) |
| No WebGL / error | Message card as today (copy unchanged), Estimate opens, Camera and Save `aria-disabled` "Needs 3D view", Share and Projects work, Colour chips work |
| Dialog or plan editor open | Everything behind `inert` |
| Sunlight off | Light sliders disabled, values visible |
| Custom shape | Room shows card and "Edit shape"; Length and Width hidden |
| Reduced motion | No slide, no tween, instant fade |
| First visit | Tray closed, look-around toast only |

## Plan editor (phone)

Layout and state map follow `ui-review.md` 2.7 and plan D10. Delta details:

**Top bar:** Done, title "Room shape", Undo, Redo, overflow button "More tools" (`aria-haspopup="menu"`). Overflow (popover pattern): Snap (toggle, `aria-pressed`, shows on/off), Walls..., Corners..., Start over (with its existing helper). Walls... and Corners... open a list in the card slot (buttons "Wall 2, 3.40 m", "Corner 3"); choosing one selects it and shows its action bar. Floating: Fit; Zoom -/+ hidden on `pointer: coarse`, still shown with a fine pointer; keys `+ - 0` unchanged.

**Action bar (always at the bottom; one row of context, one row of buttons):**

| Selection | Context row | Buttons |
| --- | --- | --- |
| Nothing | "Tap a wall or corner." and a button "Height 2.70 m" (opens the card with Ceiling height) | - |
| Wall n | length chip "Wall 2: 3.40 m" (button, opens card) | Add door, Add window, Add corner (a wall cannot be deleted; deleting a corner removes a wall) |
| Corner n | chip "Corner 2: 1.20, 3.40 m" (button, opens card) | Delete corner (`aria-disabled` with reason "A room needs at least 3 corners." at 3) |
| Door / window n | chip "Door 1: 0.90 m wide" (button, opens card) | Delete door / Delete window |

- The error reason chip and first-use hint stack above the bar, as today.
- The chip is a real button with `aria-expanded` and `aria-controls` the card.

**Card** (`role="group"`, label "{Item} details", non-modal, max 45% height, scrolls, closes with its chip, Escape, or when the selection clears):
- Wall: Length field, Keep (Corner a / Corner b, radio), Move wall (Pull in / Push out, 0.10 m), disclosure "Doors and windows (n)" listing them as buttons that select them.
- Corner: X, Y fields.
- Door / window: Width, Position, and the rest of today's fields (height, height above floor, gap to ceiling, skirting length for doors).
- Nothing selected: Ceiling height only.
- Focus: opening the card moves focus to its first field (text selected); closing returns it to the chip. Selection stays visible: the plan reveals the selected item in the area above the bar or card (existing reveal rule). Fields keep font >= 16 px.
- Errors keep the existing messages and the error chip; invalid values do not leave the card.

Desktop plan editor panel: unchanged except the tool cluster position.

## Landing

| | First visit | Returning (summary exists) |
| --- | --- | --- |
| CTA fades in at | 2.4 s (`--delay-cta`) | 0.8 s (`--delay-cta-return`) |
| Pills | "Design your floor" | "Continue: {name}" primary, "New project" secondary, count line |

- Pills accept pointer input from the first frame. A tap or click on a pill's own box navigates at once; a tap anywhere else only reveals the CTA (existing skip). Keyboard: first Tab reveals and focuses the first pill (focus-within reveal stays); screen readers always have the content. Reduced motion: shown at once.
- Only the second pill's label and its target change for returning users (`/designer?new=1`, reuse-untouched rule from the share review stays).

## Zoom, reflow and small screens

- 320 CSS px wide: dock keeps five items (64 px each), icon above a label >= 11.2 px; Estimate shows the number over "planks". Top bar fits (see above).
- 200% zoom (about 640 CSS px): phone layout (dock at bottom) up to 899 px; rail from 900 px and for landscape phones >= 700 x < 500.
- 400% zoom (about 320x256 CSS px on a laptop): no two-dimensional scroll. The tray cap is `min(40% of height, space left below the top bar and above the dock minus 64 px)` so the view always has some visible strip and the close chevron stays on screen; the tray scrolls inside. If the room frame would be smaller than a usable size, the view stays full-screen behind and the user closes the tray to see it.
- Landscape phone (rail + column): column up to 45% width; Escape, focus and arrow keys as phone (Up/Down move through the rail).
- Text never below 11.2 px; targets >= 24 px (35 px actual); focus rings 3:1 against the translucent tray and the 3D background (designer verifies).

## Accessibility summary

- Disclosure toolbar, not ARIA tabs; every button has `aria-expanded` and `aria-controls="designer-tray"`.
- Tray: `role="region"` labelled by its `h2`. Live regions kept: debounced estimate sentence, colour announcements (including the hint, once), project announcements.
- Scrub fade, value bubble and the hint chip are visual aids; controls remain in the DOM and focusable. Bubble text equals the field's readout.
- Every action keeps three paths (touch, mouse, keyboard). The 3D tap has the chip rows as its keyboard and screen-reader path.
- axe 0 targets: dock closed, each section open, Camera menu with help expanded, Projects dialog with row menu (current row, with Reset), colour confirm, no-WebGL, plan editor (nothing / wall / card / overflow), landing (first visit, returning).

## Questions

1. **Brightness unit.** Replace "x" with a percent readout ("100%") on "Sun brightness"? **Recommended: yes** (display only, same value). / keep "x".
2. **Focus after Reset.** To the toast's Undo (as Delete) / to the Project chip (plan D8). **Recommended: Undo, fallback chip.**
3. **Wall in the plan-editor action bar.** The plan listed "Delete" with a wall, but walls are removed by deleting a corner. **Recommended: no Delete on a wall.**

## Answers (user, 2026-10-23)

- Q1: show Sun brightness as a percent ("100%"). Only the label changes.
- Q2: after Reset to defaults, focus goes to the toast's Undo button, falling back to the Project chip. This is the recommended default, consistent with Delete.
- Q3: a selected wall gets no Delete button in the plan editor. Corners, doors and windows keep theirs.

## Review (built UI)

Date 2026-10-23. Method: code read only (no browser was available to the reviewer), against this spec, `ui-review.md` (keep the 0.8x scale), `docs/design/components/dock.md`. Items marked "measure" are derived from token values and must be confirmed in a browser at 360x640 / 1280x800 before the fix is chosen. What matches the spec is not listed, except under "Checked and fine".

### Must

Fix status (2026-10-23): every item has a status tag in brackets; details at the end of this section.

1. [Fixed] **Camera menu opens under the tray, dock and rail.** `src/app/designer/ui/view-toolbar.scss` (`:host` z-index `--z-view-ui` = 10) creates a stacking context, so the popover's `--z-popover` (30, `camera-menu.scss`) only counts inside the bar. `.chrome` in `designer.scss` is z 20 and wins. Desktop: the popover (right 12 px) is covered by the 72 px rail even with the tray closed, and by the column when a section is open. Phone: with a section open, or with "How to look around" expanded, the lower items go under the tray. Fix: give `app-view-toolbar` `z-index: var(--z-popover)` (the bar itself is transparent and click-through, so nothing else changes), and in `camera-menu.scss` set `.popover { right: calc(var(--frame-right, 0px) + var(--space-3)) }` so it also clears the rail. Re-check Escape and click-outside afterwards.
2. [Fixed] **Loading and no-WebGL overlay may cover the top bar.** `viewport-status.scss` `.screen` is `position: absolute; inset: 0; z-index: var(--z-view-ui)`, same z as the top bar and later in the DOM (`designer.html`), so it paints and hit-tests above Back, Projects and Share. The spec says Share and Projects must work without 3D (States table). Fix: `.screen { top: var(--frame-top, 0px) }` (it already pads by `--frame-top`), or raise the bar as in item 1. Verify by tapping Back and the Project chip in the error state (force with `?` no-WebGL or a blocked context).
3. [Fixed in part] **Essentials scroll inside the tray on a 360x640 phone (measure).** Spec: Room, Floor, Light, Estimate essentials never need scrolling at the cap. Cap is `40dvh` = 256 px, minus 35 px header and 2 x 12.8 px padding = about 195 px for content. Estimated content: Floor about 290 px (wood strip, Angle, Finish, More row), Room rectangle about 280 px, Light about 370 px. Every slider spends a fourth line on the range hint ("0 - 360°", `slider-field.html` `.hint`, always shown), and Sun direction adds a 2 to 3 line note. Fixes, in order: (a) show the range hint only on error or when `note` is set; keep it as the `aria-describedby` text via a visually hidden span (saves about 15 px per slider); (b) move the Sun direction note (`light-section.ts`) into a "More" disclosure or show it only while the sun is behind the walls; (c) if still over, raise `--tray-cap` to 45dvh on phones and ask the designer to confirm the view still frames. If something must scroll, add a bottom edge fade on `.tray-body` so it is clear there is more.
4. [Fixed] **Reset does not return the Colour selection to "All walls".** Spec (Projects dialog): "If Colour is open the selection returns to 'All walls'." `projects-dialog.ts` `reset()` never touches `ColouringState`, and `colour-section.ts` only falls back when the item no longer exists. After a reset the user can be left on "Wall 3" with a stale highlight. Fix: in `reset()`, `if (colouring.colourOpen()) colouring.select({ kind: 'walls' }, 'list')`. The Undo callback needs no change (the selection may stay).

### Should fix

5. [Fixed] **Empty "Which one" radio group for Ceiling and Skirting.** `surface-list.html` renders the note "Whole ceiling." inside `role="radiogroup" aria-label="Which one"` with no radios, so a screen reader announces an empty group. Fix: when `whichs()` is empty, drop `role` and `aria-label` from that row (`[attr.role]="whichs().length ? 'radiogroup' : null"`) or render the note in a `<p>` outside the group inside the same fixed-height row.
6. [Fixed] **Tray cap can go to zero at 400% zoom.** `tray.scss` `.tray-card` `max-height: min(max(cap, min-h), calc(100dvh - frame-top - dock-h - reserve))`: on a 256 px high viewport the second term is about 0 or negative, so the header and close chevron may be clipped or invisible, which breaks the spec rule that the chevron stays on screen. Fix: wrap the whole thing in `max(var(--tray-header-h), ...)` so there is always a visible header, and let `.tray-body` collapse to zero. Needs a real check at 320x256.
7. [Fixed] **Short landscape phones below 700 px wide keep the bottom dock.** `RAIL_QUERY` (`dock.ts`, `dock.scss`) switches to the rail at `min-width: 700px` and `max-height: 499px`. A 667x375 phone gets the phone scale, a 51 px dock, a tray of at least 154 px and a top bar, leaving about 110 px of room view. Check on an iPhone SE / mini class device. Likely fix: use the rail whenever `max-height: 499px` and `min-width: 560px`, and apply the same threshold in `_phone-scale.scss`, `plan-panel.scss`, `designer.scss` (three copies of the query must stay in sync; consider one SCSS variable).
8. [Fixed] **"More" summary labels are vague.** `room-section.ts` summary is just "More" (spec copy: Room More holds "Ceiling height"). The Room section's `aria-describedby="room-saved-note"` points at text inside the closed "More", so sighted users never see "Both rooms are saved." Fix: summary "Ceiling height and more" or "More: ceiling height"; move "Both rooms are saved." out of the disclosure (one line under the segment), or drop the describedby.
9. [Fixed] **Opening "More" or switching Rectangle/Custom reframes the camera.** `frame-measure.ts` measures `chrome.offsetHeight`, so any tray height change (More toggled, Room mode change, error text appearing under a slider) re-eases the room while the user is touching it. Spec: "nothing moves under the finger". Fix: in `designer.ts` `observeFrame`, ignore height changes smaller than about 24 px when the open section is unchanged, or only re-frame on section open/close/switch and on window resize. Needs a feel check on a device.
10. [Fixed] **Hint announced while focus moves to the tray heading.** `colour-hint.ts` calls `announcer.say(...)` the moment Colour opens, at the same time as the heading focus announces "Colour, heading", so the hint is often lost or cut. Fix: delay the first announcement by about 1 s (use the existing `sayLater`) so the heading is read first.
11. [Fixed] **Save button name while busy does not contain its visible text.** `view-toolbar.html`: visible "Saving..." (desktop) versus `aria-label` "Saving image" (2.5.3). Fix: visible text "Saving image..." or aria-label "Saving...".
12. [Fixed] **Dock accessible structure is doubly labelled.** `dock.html` has `<nav aria-label="Design sections">` around `role="toolbar" aria-label="Sections"`. Screen readers hear both. Fix: keep the `nav` label and give the toolbar `aria-labelledby` to the same label, or drop the `nav` and label only the toolbar "Design sections".
13. [Fixed] **Landing: count line hidden on short landscape.** `landing.scss` `@media (max-height: 480px) { .meta { display: none } }` removes "{n} projects on this device" for everyone, including screen readers (spec lists it as part of the returning copy). Fix: visually hide it instead (clip pattern) so it stays in the accessibility tree.
14. [Fixed] **Plan editor: no Escape in a number field on a phone.** `plan-editor.ts` `onKeydown` ignores Escape while typing, so with the card open and focus in a field the user has to tab to the chip to close it. Fix: if the card is open and the field has no pending draft (or after committing it), Escape closes the card and returns focus to the chip, as in the spec ("closes with its chip, Escape").

### Nits

15. [Checked] `tray.scss` `.tray-icon` is decorative next to the heading; confirm `app-section-icon` is `aria-hidden` (it is in the dock, not verified here).
16. `colour-section.scss` reserves two lines in `.lines`; a long custom hex readout plus "Paints the door and its frame." fits, but the Custom with hex line wraps below 320 px. Check at 320.
17. [Fixed] `surface-list.scss` `.row` mask fades the first chip's left edge even when the row is not scrolled (`--chip-fade-w` 1.2 rem on phones); the "Walls" chip looks washed out. Use a scroll-driven mask or start the fade only after the row is scrolled (a small `scroll` listener toggling a class).
18. `camera-menu.html` presets inline group (>= 1200 px) repeats `title` of the sub-line while the menu shows it as text; fine, but the inline buttons have no accessible description of the sub-line. Optional `aria-describedby`.
19. `slider-field.html` has a visually hidden second label "{label} (number)". Fine for axe; consider `aria-label` on the number input instead to remove a duplicate `<label>` node.
20. Plan editor toolbar DOM order is title, Done, Undo, Redo, (Snap hidden on phone), More. Spec lists Done first. Acceptable because the title takes the initial focus; keep, but make sure the visual order (Done left) is not reordered by CSS in a way that breaks the focus order (WCAG 2.4.3) on phone; check once on a device.

### Checked and fine (code level)

DOM order stage, tray, dock. One roving tab stop with Arrow, Home, End; Enter or Space activates. `#designer-tray` always present, `hidden` when closed, content only for the open section. Focus rules: heading on open and switch, dock button on close, chevron and Escape. Escape layering (camera menu stops propagation, scrubbing ignores Escape, Colour selection clears on close through `setColourOpen(false)`). Estimate button name matches the spec text. Brightness shows percent (Q1). Reset is current row only, order Rename, Duplicate, Reset, Delete, focus on the Undo toast with chip fallback (Q2). Wall has no Delete in the plan editor action bar (Q3). Hint chip is click-through, shown once, copy with and without doors. Which row has a fixed height and the Colour value area reserves two lines. Reduced motion: tray slide, fade, bubble, chevrons, hint all off; camera tween checks `reducedMotion`. Range thumb uses `touch-action: pan-y` so vertical pans scroll the tray. Text tokens at the 0.8x scale: `--text-xs` is 11.2 px, targets 35 px. Toasts clear `--frame-bottom` and `--frame-right`. Landing pills accept input from the first frame, reduced motion shows the CTA at once.

### Fix status

- 1: Fixed. `app-view-toolbar` is at `--z-popover`; `.popover` is offset by `--frame-right`. Checked in headless Chrome 360x640: the open menu with help expanded is the top hit over the tray.
- 2: Fixed. `.screen` starts at `--frame-top`.
- 3: Fixed in part. Range hint only on error or note (still the described-by text, visually hidden); Sun direction note moved into Light > More; field gap `--space-3`; tray body top padding reduced; `--tray-cap` 45dvh; bottom edge fade when the body scrolls. Measured at 360x640: Colour and Estimate fit; Room essentials fit (its More row is cut); Floor needs about 52 px and Light about 50 px more than the cap gives, so they still scroll a little (fade shows it). Decision for the designer: tray cap 50dvh or a shorter slider row (number field 28 px).
- 4: Fixed. `reset()` selects All walls when Colour is open (spec added).
- 5: Fixed. Ceiling and Skirting render the note in a plain same-height row, no empty radiogroup.
- 6: Fixed. Cap is wrapped in `max(--tray-header-h, ...)`, the card clips. Not yet checked at 320x256 on a device.
- 7: Fixed. Rail from `min-width: 560px` and `max-height: 499px` in dock, tray, designer, plan editor and phone scale (667x375 now gets the rail).
- 8: Fixed. Summary "Ceiling height and more"; "Both rooms are saved." sits under the segment.
- 9: Fixed. A height change under 24 px inside the same open section no longer re-frames the scene (`isMinorReframe`). The CSS frame variables still follow the real size. Needs the device feel check.
- 10: Fixed. The hint is announced with `sayLater` (500 ms), after the heading.
- 11: Fixed. Busy text and name are both "Saving image...".
- 12: Fixed. `nav` "Design sections" and toolbar "Open a section" (different names; dropping the nav fails axe `region`).
- 13: Fixed. `.meta` is visually hidden on short landscape.
- 14: Fixed. Escape in a card field commits (blur), closes the card, focuses the chip.
- 15: Checked: `app-section-icon` is `aria-hidden`.
- 17: Fixed. The left fade grows only once the row scrolls (scroll-driven, no fade where unsupported).
- 16, 18, 19, 20: not done (nits, no change needed now).

### Needs a real-device check

- iPhone Safari and Android Chrome: scrub-to-see on a slider (pointer capture, vertical scroll versus horizontal drag with `pan-y`, bubble position near screen edges, no rubber-banding of the page); bubble in the top layer (`popover`) on iOS Safari 17+.
- Dynamic toolbar and keyboard: tray and dock above the home indicator (`env(safe-area-inset-bottom)` in `dock.scss`), `100dvh` cap while the URL bar collapses, number field focus with the on-screen keyboard (the focused field must stay visible above the keyboard and not hide behind the dock).
- Camera reframe feel when a section opens and closes (item 9), and the room framing on 360x640, 390x844, 667x375.
- Native colour picker (`input type=color`) from inside the tray on iOS and Android, and the deferred "All walls" confirm.
- Camera menu on both a phone and a 1280x800 desktop after fix 1, with help expanded.
- Plan editor on a phone: card and action bar at 45% max height with the keyboard open, selection stays revealed above the bar, overflow menu, Walls and Corners lists, pinch and pan with no Zoom buttons on `pointer: coarse`.
- TalkBack and VoiceOver: dock as toolbar, heading focus announcement, 3D tap announcement ("Wall 3 selected."), empty "Which one" group (item 5), hint announcement (item 10).
- 200% and 400% zoom (items 6 and 7), forced-colors mode on the chip rows and dock open marker.
- Landing returning-user pills on touch: a tap during the intro on a transparent pill navigates immediately.

## Answers to review (user, 2026-10-23)

- Tray height: keep `--tray-cap` at 45dvh. Floor and Light may scroll slightly at 360x640, with the bottom fade marking it.
- Released as v0.3.0 before the real-device fps check. The user tests on the live site. `scene/frame-debug.ts` stays (inert without `?frame=debug`) until that check passes.
