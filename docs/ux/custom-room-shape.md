# UX spec: Custom room shape (`/designer/plan`)

Plan: `docs/plans/custom-room-shape.md` (limits C3, opening rules C4, operations C5, editor C7, sun C13, calculator C14; user answers at its end). Builds on `docs/ux/floor-visualizer.md` (same tone, same slider-field, sheet, toast and a11y patterns). Visual styling is the designer's job; this file covers behaviour, content and copy.

## Users and goal

Home owners and fitters whose room is not a plain rectangle (L, T, bay, angled wall). Mostly on a phone. Goal: draw the room in about a minute, with exact wall lengths from a tape measure, place the doors and windows, and see the real floor, sun and plank count in 3D.

Principles: the shape is the hero; every gesture has a typed or keyboard equivalent; no Cancel and no Apply (changes are live, undo is always there); a refused edit explains itself in one short sentence.

## User flow

1. Room tab: user taps **Custom shape**. First time: the shape starts as a copy of the rectangle, with its window, and the editor opens by itself. Later: only the mode flips; the user taps **Edit shape** to open it.
2. Editor opens fitted to the shape. First-use hint shows.
3. User drags corners and walls, or types exact values; taps **+** on a wall to add a corner; adds doors and windows from the selected wall.
4. User taps **Done** (or Back, or Escape). The 3D view, estimate and export show the new room.
5. Alternatives: Undo/Redo any step; **Start over** returns to the rectangle; switch back to **Simple rectangle** at any time (the custom shape stays saved); **Reset design** keeps the custom shape.

## Room tab (changes)

```
Room
( Simple rectangle | Custom shape )      <- segmented control, legend "Room"
Both rooms are saved.                    <- muted, one line

[Simple]  Length / Width sliders, Ceiling height, "The window is in one of the long walls."

[Custom]  +-----------------------------+
          | Custom shape                |
          | 6 corners · 18.40 m²        |
          | 1 door · 2 windows          |
          | [ Edit shape ]              |
          +-----------------------------+
          Ceiling height   [ 2.70 ] m
          Doors and windows are set in the shape editor.
```

- Segmented control: radio semantics, arrow keys, same pattern as Finish. Switching refits the camera to Corner. No confirm (nothing is lost).
- Custom hides Length and Width (not disabled; they do not apply). Ceiling height stays and applies to the active mode.
- If doors/windows limit the height, the slider minimum rises and the hint reads: "Doors and windows set the lowest height."
- Plural rules: "1 corner/6 corners", "1 door/2 doors", "No doors", "No windows". "Edit shape" is the primary action of the card.
- Opening the editor from the first switch counts as opened from the toggle; closing returns focus to **Edit shape**.

## Editor layout

Full-screen overlay (child route, role `dialog`, `aria-modal`, labelled by the title "Room shape"). The designer behind is `inert`.

### Phone (< 900 px): canvas plus bottom panel

```
+--------------------------------+
| [Done]  Room shape  [Undo][Redo]|  top bar
|                                |
|    SVG plan (grid, walls,      |
|    corners, + handles, labels) |
|                 [chip: reason] |  error chip (top of canvas)
|  18.40 m² · 6 walls   [Fit][-][+]|  status + view buttons
+--------------------------------+
|  ---  (handle)                 |
| Wall 2 · 3.40 m                |  selection title
| [Add door][Add window][Add corner]  quick actions
+--------------------------------+
```

- Panel has two stops, like the main sheet: **Collapsed** (handle, selection title, quick actions; about 20% height) and **Expanded** (about 60%: full form and lists). The handle is a button (`aria-expanded`, name "Shape controls"); dragging is optional.
- Selecting something never expands the panel; **Edit details** (in the collapsed bar) or the handle does. The canvas is sized to the area above the panel and pans minimally so the selection is never hidden behind it.
- Toolbar (below) sits in the top bar and in the canvas corner; nothing floats over the shape except the chip and the first-use hint.
- Landscape phone (>= 700 px wide and < 500 px high) and desktop use the side layout.

### Desktop (>= 900 px): canvas plus side panel

```
+---------------------------------+--------------+
| [Done] Room shape  [Undo][Redo] | Selected     |
| [Snap on] [Fit][-][+]           |  (form)      |
|                                 | ------------ |
|       SVG plan                  | Room         |
|                                 | Walls (6)    |
|  18.40 m² · 6 walls             | Corners (6)  |
+---------------------------------+--------------+
```

Panel 360 px, scrolls inside. Selected form on top; below it, the Room section and the Walls and Corners lists as disclosures (Walls open by default).

### Toolbar

Order: **Done**, Undo, Redo, Snap switch, Fit, Zoom out, Zoom in. All are real buttons, at least 44 px, with text or icon plus accessible name; icon-only below 440 px with a `title`.

| Control | Behaviour |
| --- | --- |
| Done | Closes the editor (see Close and focus). Primary. |
| Undo / Redo | One step per finished gesture or committed field. Disabled when empty. Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y. Stack of 50, cleared on close. |
| Snap | Switch, default on. Label "Snap". Snaps to the 10 cm grid and to right angles (within 5°). Description (`aria-describedby`): "Snaps to a 10 cm grid and 90° corners." Typed values are never snapped. On desktop, holding Alt while dragging flips it for that drag. |
| Fit | Fits the whole shape in the visible canvas. Key `0`. |
| Zoom out / in | Same as pinch and wheel. Keys `-` and `+`. Visible range 0.5 to 40 m wide (a 20 m room needs padding). |

Add door/window, Add corner, Delete and **Start over** are not in the toolbar; they sit with what they act on (selection panel, Room section). Fewer places, nothing hidden behind a long-press.

## Selection model

- One item selected at a time: a corner, a wall, an opening, or nothing (the Room form shows).
- Tap or click selects; tap on empty space deselects; Escape deselects. Focus on a canvas item also selects it.
- Selected items get a number badge: "Corner 2", "Wall 2" (wall n runs from corner n to corner n+1). Numbers renumber when corners are added or removed; the live region announces it.
- Selecting from the Walls or Corners list in the panel selects the same item and pans the canvas to show it.

## Gestures (touch and mouse)

| Action | Touch | Mouse | Result and limits |
| --- | --- | --- | --- |
| Pan | One finger on empty space | Drag on empty space | `viewBox` pan. |
| Zoom | Pinch (two fingers also pan) | Wheel, or zoom buttons | Clamped 0.5 to 40 m wide. |
| Select | Tap | Click | See Selection model. |
| Move corner | Drag a corner handle | Drag | Snaps if Snap is on. Releases = one undo step. |
| Move wall | Drag the wall body | Drag | Moves parallel; neighbours keep their direction (C5). Only across the wall. |
| Add corner | Tap the **+** at the wall midpoint | Click the **+** | Corner is inserted at the midpoint and selected; the user drags it. Tap only, no drag-from-plus in v1. |
| Move door/window | Drag along its wall | Drag | Slides along the wall, stops at the corner margin and neighbours. |
| Delete | Panel **Delete** button | Same, or Delete key | See Delete. |

- Drag starts after 8 px (touch) or 4 px (mouse), so a tap never moves anything. Handles draw at constant screen size with a 44 px hit area; walls have a 44 px invisible stroke.
- The **+** shows on the selected wall always, and on other walls only when that wall is longer than 88 px on screen (avoids clutter when zoomed out).
- Browser edge swipes: the fit padding keeps handles at least 24 px from the screen edge.
- During a drag, the shape never goes invalid: it stays at the last valid position and the error chip shows the reason. A faint ghost handle keeps following the pointer so the user sees the limit.

### Delete

- **Corner**: removes it and joins its two walls (they merge into one). Disabled at 3 corners with hint "A room needs at least 3 corners." Doors and windows move onto the merged wall; if they no longer fit the action is refused with "Too short for its door or window."
- **Opening**: removes it.
- **Wall**: cannot be deleted directly; remove a corner instead. The Delete key on a wall does nothing.
- Undo is the safety net; no confirmation.

## Panel forms

Number fields use the shared slider-field pattern but without sliders: label, number input, unit, range hint. Values commit on blur or Enter (no clamping while typing), then the field always shows the real value. Step 0.01 m, `inputmode="decimal"`, comma accepted. One undo step per commit.

### Nothing selected: Room

```
Room shape
  Floor area      18.40 m²
  Walls           6 · 17.8 m around
  Ceiling height  [ 2.70 ] m      Use 2.20 to 4.00 m
Select a corner or wall to edit it.
[ Start over ]   Replaces this shape with your simple rectangle.
```

- Start over: no confirm; toast "Started over. Undo" (8 s, pauses on hover and focus, same as Reset). Also undoable with the editor's Undo.
- Ceiling height here is the keyboard/typed path for `setPlanHeight`; it mirrors the Room tab.

### Corner selected

```
Corner 2
  X  [ 5.00 ] m      from the left
  Y  [ 0.00 ] m      from the top
  Angle 90°
[ Delete corner ]
```

X and Y are in the plan's coordinates (origin top-left of the first corner is not assumed; values may be negative: range -50.00 to 50.00, hint "Use -50.00 to 50.00 m"). Angle is read-only. The shape is re-centred on screen, never moved by the user.

### Wall selected

```
Wall 2 · corner 2 to corner 3
  Length   [ 3.40 ] m
  Keep     ( Corner 2 | Corner 3 ) fixed
  Move wall   [ Pull in ] [ Push out ]     0.10 m per tap
  [ Add corner ] [ Add door ] [ Add window ]
  Doors and windows
   > Door · 0.90 m wide
   > Window · 1.20 m wide
```

- **Keep** (default: the first corner): which end stays put when the length changes; the other end moves and the next wall is pushed parallel (C5). Short labels follow the numbers, e.g. "Corner 2 fixed" / "Corner 3 fixed".
- **Move wall**: Pull in / Push out move it 0.10 m across the wall (Shift = 0.01 m is the keyboard variant on the canvas; buttons stay 0.10 m).
- **Add corner** inserts at the midpoint. **Add door/window** places it in the middle of the largest free gap with defaults (door 0.90 x 2.10 m, window 1.20 x 1.40 m, sill 0.90 m) and selects it. If it fits nowhere: "Doesn't fit on this wall."
- The list shows the wall's openings as buttons that select them. Empty: "No doors or windows on this wall."

### Door selected

```
Door on wall 2
  Width     [ 0.90 ] m     Use 0.60 to 2.40 m
  Height    [ 2.10 ] m     Use 1.80 to 2.65 m
  Position  [ 0.50 ] m     from corner 2 to the door's near edge
[ Delete door ]
```

Height maximum is room height minus 0.05 m, so the hint changes with the ceiling.

### Window selected

```
Window on wall 2
  Width          [ 1.20 ] m    Use 0.30 to 4.00 m
  Height         [ 1.40 ] m    Use 0.30 to 2.60 m
  Position       [ 1.00 ] m    from corner 2 to the window's near edge
  Height above floor   [ 0.90 ] m
  Gap to ceiling       [ 0.40 ] m
  Changing the height or ceiling keeps the gap you edited last.
[ Delete window ]
```

- **Last edited stays fixed** (C4): editing "Height above floor" fixes it, and later height or ceiling changes move the ceiling gap; editing "Gap to ceiling" fixes the gap instead. Default fixed: the floor side. The currently fixed field shows a small "Fixed" tag (text, not colour alone) and the helper above explains it.
- The two fields are linked: editing one recalculates the other immediately after commit.

## Live dimensions

- Every wall shows its inner length (m, two decimals) along it, upright (never upside-down), at a constant screen size of at least 12 px. A label hides when its wall is shorter on screen than the label; selecting the wall always shows it.
- While dragging: the lengths of the touched walls are emphasised; dragging a corner also shows its angle (e.g. "90°"); moving an opening shows its distance to the nearest corner.
- A status line shows the area and wall count: "18.40 m² · 6 walls". It updates live while dragging.
- Labels are text in the SVG, `aria-hidden`; the same numbers are in the item names and panel.

## Errors and the reason chip

Edits that would make the room invalid are refused. During a drag the shape stays at the last valid position. The **chip** (top of the canvas, `role="status"`, polite) shows the reason for 4 s after the last refusal, and clears at once on the next valid move. Typed fields revert to the last valid value and show the same text under the field (also announced) until the next edit.

| Code | Context | Copy |
| --- | --- | --- |
| `self-intersection` | any shape edit | Walls can't cross each other. |
| `wall-too-short` | shape edit | Walls must be at least 0.30 m long. |
| `angle-too-sharp` | shape edit | That corner is too sharp. Keep it between 30° and 330°. |
| `walls-too-close` | shape edit | Walls must stay at least 0.30 m apart. |
| `too-many-corners` | add corner | A room can have up to 32 corners. |
| `too-large` | shape edit | The room can be at most 20 m across. |
| `area-out-of-range` | shape edit | The floor area must be 2 to 144 m². |
| `opening-does-not-fit` | wall edit (length, move, delete corner) | Too short for its door or window. |
| `opening-does-not-fit` | opening edit or add | Doesn't fit on this wall. |
| `openings-overlap` | opening edit or add | Too close to another door or window. Leave at least 5 cm. |
| `too-many-openings` (needs adding, see Open questions) | add | A room can have up to 32 doors and windows. |
| `opening-size-out-of-range` (needs adding) | typed size | Use {min} to {max} m (same pattern as sliders). |

Notes:
- A corner margin of 0.05 m is part of `opening-does-not-fit`; the copy stays the same.
- Other states reuse the main spec: out-of-range typing shows "Use {min} to {max} {unit}".
- Errors never lose data; nothing is deleted or shrunk automatically (C4).

## First-use hints and empty states

- **Hint banner** on the canvas, first time the editor opens. Stays until dismissed with its Close button or the first successful edit; no auto-timeout (WCAG 2.2.1). Wording follows `(pointer: coarse)`:
  - Touch: "Drag a corner or wall to reshape. Tap + to add a corner. Tap a wall to add a door or window."
  - Mouse: "Drag corners and walls to reshape. Click + to add a corner. Select a wall to add a door or window."
  - Keyboard line, shown on desktop: "Tab to a corner or wall, then use the arrow keys."
- The hint is the `aria-describedby` target of the plan.
- Panel hints: nothing selected: "Select a corner or wall to edit it."; wall without openings: "No doors or windows on this wall."
- Pan/zoom has no separate hint (one finger on empty space and pinch are covered by platform habit; Fit and zoom buttons are visible).

## Undo, redo and Start over

- Each finished gesture (pointer up), committed field, and button press is one step. Dragging produces one step, not many.
- Announce after each in the live region: "Undone: moved corner 2." / "Redone: moved corner 2." Action names: moved corner, moved wall, changed wall length, added corner, deleted corner, added door, added window, changed door, changed window, removed door, removed window, changed ceiling height, started over.
- Undo and Redo keep selection if the item still exists, otherwise clear it.
- Start over: see Room form. The editor's history is separate from the main sheet's single Reset undo.

## Close and focus flow

- Opening: focus moves to the editor title (`h2`, `tabindex=-1`, "Room shape"), so a screen reader hears the context; Tab then reaches the skip link, Done, and so on.
- **Done**, **Escape** (when nothing is selected and no menu is open; the first Escape deselects) and the **browser/Android back button** all close the editor (back pops the child route). Edits are already committed per gesture; nothing is lost on close.
- Closing returns focus to **Edit shape** in the Room tab (or the Custom option if the Room tab is not showing). The 3D view shows the new shape.
- Opening `/designer/plan` while in Simple mode redirects to `/designer` silently. A reload with Custom mode reopens the editor.
- Load failure: the main spec's "Couldn't load the designer" state with Try again.

## Keyboard (all C5 actions)

Tab order: skip link ("Skip to controls"), Done, Undo, Redo, Snap, Fit, Zoom out, Zoom in, the plan, the panel (handle, form, lists). The plan is one group (`role="group"`, name "Room plan, 6 corners, 18.40 square metres", described by the hint); inside it, Tab visits the plan itself first, then each corner, wall and its openings in order (corner 1, wall 1 and its openings, corner 2, ...). Tab always leaves the plan; there is no trap. The panel lists make every item reachable without the plan.

| Key (focus on) | Action |
| --- | --- |
| Arrows (plan, nothing focused) | Pan by 10% of the view |
| `+` `-` `0` (anywhere in the plan) | Zoom in, zoom out, fit |
| Arrows (corner) | Move 0.10 m (Shift: 0.01 m); not snapped |
| Arrows (wall) | The arrow that points out across the wall pushes it out, the opposite pulls it in; the other two do nothing |
| Arrows (opening) | Slide along the wall, in the arrow's direction |
| Enter / Space (item) | Select (also happens on focus) |
| Delete / Backspace (corner or opening) | Delete (same refusals and copy) |
| Escape | Deselect, then close |
| Ctrl/Cmd+Z, Shift+Z / Ctrl+Y | Undo, redo |

### Every C5 operation has three paths

| Operation | Touch | Mouse | Keyboard |
| --- | --- | --- | --- |
| `moveVertex` | Drag corner | Drag corner | Arrows on corner; X/Y fields |
| `moveWall` | Drag wall | Drag wall | Arrows on wall; Pull in / Push out buttons |
| `setWallLength` | Length field | Length field | Length field (+ Keep choice) |
| `insertVertex` | Tap **+** | Click **+** | Add corner button (wall panel) |
| `deleteVertex` | Delete corner button | Button or Delete key | Button or Delete key |
| `addOpening` | Add door/window button | Same | Same |
| `updateOpening` | Drag along wall; fields | Drag; fields | Arrows; fields |
| `removeOpening` | Delete button | Button or Delete key | Button or Delete key |
| `setPlanHeight` | Ceiling height field (editor Room form or Room tab) | Same | Same |
| Start over | Button | Button | Button |
| Pan / zoom | Gestures | Drag / wheel | Arrow keys, `+` `-` `0`, buttons |

## States

| State | Behaviour |
| --- | --- |
| Loading the editor chunk | Overlay shows "Preparing the editor..." (`role="status"`, persistent region). The designer stays visible behind. |
| Editor chunk fails | "Couldn't load the editor. Check your connection." with Try again and Close. |
| No WebGL | Editor works normally (it is SVG). |
| Undo/Redo empty | Buttons disabled, kept visible. |
| Corner count at 3 | Delete corner disabled with its hint. |
| Many openings (32) | Add door/window disabled with "A room can have up to 32 doors and windows." |
| Invalid stored shape | Ignored silently; Simple mode with defaults (main spec). |
| Reduced motion | Fit and selection pans jump; no easing; no panel animation. |
| localStorage unavailable | Works, but the shape is not remembered; no error. |
| Permissions | None. |

## Light tab (changes)

| Control | Range | Step | Default |
| --- | --- | --- | --- |
| Sun direction | 0 - 359 deg | 1 | 135 |

- Replaces the 90-270 range and the "180 = straight through the window" note in both modes.
- Helper: "Where the sun comes from, as seen from above. The patch of light enters through a window."
- Hint when no window faces the sun (sunlight on): "The sun is behind the walls. Turn it towards a window." Shown as plain muted text under the slider in a polite live region; it does not block anything.
- Hint when the custom room has no windows at all (sunlight on): "This room has no windows. Add one in the shape editor." with an **Edit shape** link-button. Shown instead of the one above.
- Both hints are hidden when Sunlight is off (the sliders are disabled with "Turn sunlight on to adjust it.").

## Estimate tab (changes)

```
Your floor
  Floor area            18.40 m²
  Skirting length       17.8 m      Walls minus doors
  Planks needed         306          (no waste)
  Waste allowance  [ 12 ] %
  ----------------------------------------
  Area to buy           20.61 m²
  Planks to buy         343
  How this is calculated
  [ Reset design ]  Your custom shape is kept.
```

- Floor area is the polygon area in both modes. **Skirting length** is read-only text, one decimal, in m; its muted sub-label is "Walls minus doors". Added after Floor area; not part of the peek bar.
- Assumptions text: "Estimate for the floor area of your room. Fixed fittings (cupboards, stairs) are not deducted. The waste allowance covers cuts at the walls and the ends of the herringbone. Planks are rounded up. Skirting length is all walls minus the doors; windows are not deducted. Check with your supplier before ordering."
- The note "Your custom shape is kept." appears under Reset only when a custom shape exists. Reset still sets Simple mode and shows "Design reset. Undo".
- The announced summary sentence is unchanged.

## Copy sheet (additions)

- Buttons: Done, Undo, Redo, Fit, Zoom in, Zoom out, Edit shape, Start over, Add corner, Add door, Add window, Delete corner, Delete door, Delete window, Pull in, Push out
- Labels: Simple rectangle, Custom shape, Snap, Room shape, Corner n, Wall n, Door, Window, Length, Keep, X, Y, Width, Height, Position, Height above floor, Gap to ceiling, Skirting length, Fixed
- Toasts: "Started over. Undo"
- Tone unchanged: plain, short, no exclamation marks.

## Accessibility

- WCAG 2.2 AA minimum. 2.5.7 Dragging: every drag has a typed/button path (table above). 2.5.8 Target size: 44 px hit areas for handles, walls, **+**, buttons; at least 8 px apart where the layout allows (handles on tiny walls are the exception because geometry decides; the lists are the alternative). 2.4.11 Focus not obscured: the collapsed panel never covers the focused canvas item (auto-pan).
- Roles and names: editor `role="dialog"` `aria-modal="true"`. SVG items are `role="button"` with `aria-pressed` for selection and a full name, e.g. "Corner 2, x 5.00 metres, y 0.00 metres", "Wall 2, 3.40 metres, 1 window", "Window on wall 2, 1.20 metres wide". The **+** handles are `aria-hidden` and not focusable (the Add corner button is the keyboard path).
- Live region (polite, persistent): selection changes ("Wall 2 selected, 3.40 metres"), undo/redo, renumbering, chip reasons, Start over, "6 corners, 18.40 square metres" after structural edits. Do not announce per pointer move; announce on release.
- Focus: not moved by edits. After Delete corner/opening, focus goes to the same list item position or to the plan; after Add door/window, focus goes to the new item's first field (Width). On close, see Close and focus flow. Visible focus ring on every SVG item (3:1 against the grid).
- Colour is never the only signal: selected items get a thicker stroke plus badge; errors have text; doors and windows have different symbols; the fixed window field has a text tag.
- Contrast: text 4.5:1; handles, walls and focus rings 3:1 against the grid and panel (designer to document).
- Reflow: at 200% and 400% zoom the layout stacks (canvas above panel), the panel scrolls, nothing clips. Browser text size scales the panel and the HTML labels. SVG labels keep at least 12 px.
- Touch: `touch-action: none` on the plan only; the rest of the page scrolls normally. No path-based or multi-finger gesture is required.
- Reduced motion: see States.
- Page title while open: "Room shape - Parket".

## Open questions (recommended default first)

1. **Auto-open the editor on the first switch to Custom?** Open it (fewer steps) / require tapping Edit shape. Spec assumes open.
2. **One snap switch or two** (grid and 90°)? One "Snap" switch (fewer choices; Alt flips it while dragging) / two. The plan's `SnapOptions` can still carry both, set together.
3. **Typed value refused: revert or clamp?** Revert to the last valid value with the reason (simple and predictable) / clamp to the nearest valid value (the plan's C4 says "clamps"; needs a search for the nearest valid length). Spec assumes revert; plain min/max limits still clamp with "Use {min} to {max}".
4. **Error payload and missing codes.** To pick the right copy the errors need the subject (wall or opening id) and whether the edit was to a wall or an opening. Please add codes `too-many-openings` and `opening-size-out-of-range` (door/window width, height and sill limits have none today) and optionally `too-few-corners` (deleting below 3; the UI disables the button, but tampered storage needs a code).
5. **Escape closes the editor** when nothing is selected. Yes / only Done and Back close.
6. **Hint stays until dismissed**, remembered with the existing first-visit mechanism (a small localStorage flag) / auto-dismiss after 6 s like the camera hint. Spec assumes persistent (WCAG 2.2.1).
7. **Wall and corner numbers.** Shown only on the selected item (badges) / always on all items (cluttered on phones). Spec assumes selected only.
8. **Sun marker in the editor.** A small sun arrow on the plan edge showing the Light tab direction helps users decide which wall gets the sun. Nice-to-have for the designer; not required.
9. **Walls cannot be deleted** (remove a corner instead) / add a "Remove wall" that merges corners. Spec assumes no.

## Review (built UI)

Reviewed from code only (no browser). Scope: `src/app/designer/plan-editor/**`, `ui/tabs/*`, `ui/plan-editor-launcher.ts`, `ui/editor-loader.ts`, `ui/plan-editor-load-error.ts`, `designer.html|ts`. Paths below are under `src/app/designer/`. Overall the build follows the spec closely: copy matches, all C5 operations have a button, key and gesture path, the live region, chip, inert background, focus return and undo coalescing are in place. No blockers in the happy path; the must-fix items are keyboard/focus dead ends.

### Known deviations: verdict

| Deviation | Verdict |
| --- | --- |
| Canvas in screen px, not viewBox | Accept. Constant-size handles and labels come for free. Only check that the SVG does not hold the grid cell open when the window shrinks (see device checks). |
| Max zoom-out 40 m | Accept (spec updated). A 20 m room with fit padding cannot fit in 20 m of view; the spec's 20 m was for the room, not the view. Update the spec line "0.5 to 20 m wide" to "0.5 to 40 m". |
| "+" about 31px from the wall grip | Accept. It keeps both targets tappable; the 44 px hit circles overlap the grip by a few px, but the wall body is also draggable, so nothing is lost. Add corner still inserts at the midpoint (`editor-session.ts:325`), as specced. Verify on a phone. |
| No dynamic min-ceiling hint (heights never refuse) | Not accepted as is, see should-fix 6. The data rule (C4: nothing shrunk silently) is broken. |
| Escape in number fields left to the browser | Accept. Escape in a field does not close the editor, which is the safer behaviour. |
| Opening lists are plain buttons | Accept. Add `aria-pressed` for the selected opening (nice-to-have 2). |
| Hint key `parket.plan-hint.v1` | Accept. |

### Must-fix

1. **Focus is lost when "Edit details" is pressed.** `plan-panel.html:44` sets `expanded`, and `plan-panel.scss:55` then hides `.summary` (`display: none`), so the focused button disappears and focus falls to the body. A keyboard or switch user must start from the top of the dialog. Expected: after expanding, move focus to the form title (`#plan-form-title`, add `tabindex="-1"`) or to the handle, and announce "Details open". Same applies in reverse if you add a collapse path.
2. **Closing the first-use hint drops focus.** `plan-canvas.html:265` removes the Close button when pressed (`plan-canvas.ts:237`). Expected: move focus to the plan (`[data-plan]`) after dismiss. Also give it `aria-label="Close hint"` so it is not one of several unnamed "Close" buttons.
3. **Load-error screen is a keyboard dead end.** `ui/plan-editor-load-error.ts:9`: the designer behind is inert (the error component activates the outlet), but focus is never moved, there is no dialog role, and Escape does nothing. Expected: `role="dialog"` `aria-modal="true"` labelled by the heading, focus on **Try again** on mount, Escape calls Close.
4. **`+`, `-`, `0` do not work when a corner, wall or opening has focus.** Spec: "anywhere in the plan". `plan-canvas.ts:221-223` sends keys to `itemKey` when an item is focused, and `pointer-gestures.ts:284-335` returns false for everything except Enter/Space/Delete/arrows. Only the bare plan handles zoom/fit (`planKey`). Since Tab lands on items, most keyboard users never reach the bare plan again. Expected: in `onKeydown`, fall back to `planKey` for `+ - = _ 0` when the item handler did not handle the key (arrows stay with the item).
5. **Range errors in number fields are not announced.** `number-field.ts:47` renders "Use 0.60 to 2.40 m" in a plain `<p>`, and the range path does not call `session.say`. Only refusals that go through `session.apply` are announced (`editor-session.ts:225`). Screen-reader users type a bad value, the field silently reverts, and nothing is said. Expected: make the hint paragraph `aria-live="polite"` only while it shows an error, or emit an `invalid` output that the panel routes to `session.say`. (`aria-invalid` is set, but the field has already reverted its value.)

### Should-fix

1. **Reason chip overlaps the first-use hint.** `plan-canvas.scss:270` (hint) and `:315` (chip) are both anchored at the top of the canvas. A refused first drag (refusals do not dismiss the hint) puts the chip on top of the hint text. Expected: stack them (chip below the hint when the hint is visible) or move the hint to the bottom centre above the status line.
2. **Collapsed phone panel is probably too short for the wall state.** `plan-editor.scss:2` fixes the collapsed height at `max(--plan-panel-collapsed, 9.5rem)` (about 152 px). A selected wall needs handle 44 + title + action row 44 + "Edit details" 44 + gaps (about 190 px); the panel scrolls internally (`plan-panel.scss:5`), so "Edit details" is likely below the fold with no cue. Expected: all of title, quick actions and Edit details visible without scrolling at 360 x 640; put "Edit details" in the same row as the title, or raise the collapsed height. Device check.
3. **No re-reveal after the canvas resizes.** `editor-view.ts:30` only fits on the first measure. Expanding the panel shrinks the canvas to about 40% of the height; the selection can end up outside it or under the floating tools (spec 2.4.11, "never hidden behind the panel"). `reveal()` is only called from the panel lists (`plan-panel.ts:274`). Expected: on `setSize` and on selection by focus or tap, call `reveal` for the selected item with padding for the tools and status line. Also pan on focus (`plan-canvas.ts:229`) so a Tab to a hidden corner brings it into view.
4. **Phone tool cluster covers the plan.** `plan-toolbar.scss:84-106`: Snap + Fit + two zoom buttons, max 14rem wide, wrap into two rows in the bottom-right corner, over the shape area; the spec wants only the chip and hint floating. Spec wireframe has only Fit and zoom there. Expected: Snap in the top bar (or the panel) on phone, leaving one row of Fit/-/+ beside the status line. Device check how often walls are hidden behind it.
5. **Number input type.** `number-field.ts:31` uses `type="number"`. The comma handling at `:107` is dead code: a browser returns `''` for "3,4" when the locale expects a dot, so the user sees "Use x to y m" for a valid tape-measure value. Also allows `e`. Expected: `type="text"` `inputmode="decimal"` `autocomplete="off"` with the current parse (spec: "comma accepted"). Device check in a comma-locale browser and iOS/Android keypads.
6. **Ceiling changes silently shrink doors and windows.** `plan/plan-edit.ts:470-479` clamps opening height and sill when the ceiling drops, and no message says so. Spec: "nothing is deleted or shrunk automatically" and the Room tab hint "Doors and windows set the lowest height." Cheapest fix (no model change): after `setHeight`/Room slider, if any opening changed, announce and show in the chip: "Door and window heights were reduced to fit." Undo already restores. Better: raise the slider minimum to the tallest opening plus 0.05 m with the specced hint.
7. **Skip link and Done are behind the initial focus.** `plan-editor.ts:60` focuses the title, which sits after Done in the DOM (`plan-toolbar.ts:13-16`), so Tab goes to Undo and the skip link and Done need Shift+Tab. Spec: Tab reaches the skip link, then Done. Expected: render skip link, then title, then Done (position Done visually left with CSS order), or accept and move the skip link after the title. Low risk, but it affects every screen-reader session.
8. **Disabled quick actions on the phone give no reason.** `plan-panel.html:17-31, 39`: Add door/window (32 openings) and Delete corner (3 corners) are `disabled` in the collapsed bar; the explaining hints exist only in the expanded content (`:154`, `:176`). Expected: either show the same one-line hint in the collapsed bar, or use `aria-disabled` plus the hint so the button stays focusable and describable.
9. **Start over is unreachable while something is selected.** `plan-panel.html:179-185`: only the nothing-selected state has it, and Tab focus selects items, so on desktop it needs Escape first. The "Room" disclosure (`:190`) lacks it. Expected: add Start over (with its helper) inside the Room disclosure.
10. **Toast outside the modal.** `designer.html:15`: the Start over toast sits outside the `aria-modal` dialog, so some screen readers will not reach its Undo (the toolbar Undo is the fallback, so not a blocker). Device check; if it fails, render the toast host inside the editor or `say()` "Press Undo to restore" in the live region.

### Fix round status

All must-fix and should-fix items are **Fixed**:

- Must-fix 1: Fixed (Edit details moves focus to the form title and says "Details open").
- Must-fix 2: Fixed (focus returns to the plan; Close has aria-label "Close hint").
- Must-fix 3: Fixed (load error is a dialog, focuses Try again, Escape closes).
- Must-fix 4: Fixed (+ - 0 fall back to the plan handler from any item).
- Must-fix 5: Fixed (range refusals are sent to the live region).
- Should-fix 1: Fixed (hint and chip stack in one container).
- Should-fix 2: Fixed (Edit details sits in the title row; collapsed height 10.5rem). Device check still open.
- Should-fix 3: Fixed (selection is revealed on focus and on canvas resize).
- Should-fix 4: Fixed (Snap moved to the top bar; one row of Fit and zoom remains). Device check still open.
- Should-fix 5: Fixed (type=text, inputmode=decimal, comma and dot parsed).
- Should-fix 6: Fixed (heights are refused with "Lowest possible: X m" in both ceiling fields).
- Should-fix 7: Fixed (title is before Done in the DOM; Done is shown first with CSS order).
- Should-fix 8: Fixed (collapsed phone buttons use aria-disabled; a click shows the reason chip, and a one-line hint is shown).
- Should-fix 9: Fixed (Start over is in the Room disclosure).
- Should-fix 10: Fixed (the live region also says "Undo restores the old shape").
- Nice-to-have 2, 3, 5 are also done. The wall Length field has no upper limit; the edit rules decide.

### Nice-to-have

1. Escape during a drag could cancel the gesture (`session.cancelGesture` exists but is only used for pointer cancel).
2. Opening list buttons (`plan-panel.html:159`) should expose `aria-pressed` for the selected one, like the Walls and Corners lists.
3. `plan-panel.ts:66`: `keep` is a plain field that persists across walls; reset to `start` when the selected wall changes, and make it a signal to survive future OnPush changes.
4. `error-copy.ts:36`: `opening-size-out-of-range` has generic copy; use the spec's "Use {min} to {max} m" if the code ever surfaces (fields pre-validate, so low priority).
5. Undo, Redo and Fit rely on `title` for their name below 440 px (`plan-toolbar.scss:68`, text hidden with `display: none`). Add explicit `aria-label`s so the name does not depend on title fallback.
6. Sun marker on the plan edge (open question 8) is still not built; optional.
7. Update the spec for the 40 m zoom-out and the offset "+" so the docs match the build.

### Needs a browser or device check

- Phone 360 x 640 and 390 x 844: collapsed panel content (should-fix 2), tool cluster overlap (should-fix 4), 44 px hit areas for "+", corners and short walls, "+" next to the grip.
- Touch: 8 px drag threshold vs taps; pinch with two fingers also panning; one finger on a wall drags the wall, on empty space pans; no page scroll or pull-to-refresh on the plan (`touch-action: none`).
- Android back button and iOS edge swipe: closes the editor, does not leave the site; Done after a page reload; opening from the Light tab returns focus to that tab's Edit shape.
- Browser edge-swipe: handles at least 24 px from the screen edge after Fit.
- Number keypad and comma input (should-fix 5); Enter versus blur commit; no double commit.
- Screen reader pass (TalkBack and VoiceOver, NVDA): dialog announcement, focus on the title, item names, live announcements for select, undo/redo, chip, field errors (must-fix 5), Start over toast.
- 200% and 400% zoom and landscape phone (700 x 400): side layout, nothing clipped, panel scrolls.
- Contrast and focus ring of SVG items (3:1 against grid and fill) in light and dark, plus forced-colors.
- Reduced motion: panel, chip and Fit jump without animation.
- Resize or rotate while the editor is open: SVG follows the host (explicit width/height attributes at `plan-canvas.html:7-8`) and the view stays sensible.
- Perf: drag a corner on a 32-corner shape on a mid-range phone; the model recomputes all walls and the text layer on every pointer move.
