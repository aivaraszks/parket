# Plan editor: visual spec

Behaviour and copy: `docs/ux/custom-room-shape.md`. Tokens and contrast ratios: `docs/design/design-system.md`, "Plan editor". All colours, sizes and widths below are `--plan-*` tokens (or existing tokens). No hard-coded values.

## Canvas

- Fills the area between the top bar and the panel. Background `--plan-bg`, solid. SVG layers, bottom to top: grid, room fill, walls, openings, dimension labels, handles and "+", snap guides, ghost, badges.
- Room fill: `--plan-room-fill`, no stroke of its own.
- Grid: lines `--plan-grid-width` 1px; minor `--plan-grid-minor` every 0.1 m, major `--plan-grid-major` every 1 m, anchored at plan (0, 0). Thresholds in the design system (minor needs 8 px pitch, major 16 px); on/off, no fade.

## Walls

| State | Stroke | Width | Extra |
| --- | --- | --- | --- |
| Default | `--plan-wall` | `--plan-wall-width` 3px | round joins, butt caps |
| Hover (mouse) | `--plan-wall-hover` | `--plan-wall-width-hover` 4px | cursor `grab` |
| Selected | `--plan-wall-selected` | `--plan-wall-width-selected` 5px | `--plan-casing` under it, plus the wall grip and badge |
| Focus | as default | | `--focus-ring` as outline on the wall's hit stroke |
| Dragging | as selected | | cursor `grabbing`; touched walls' labels emphasised |
| Invalid drag | `--plan-error`, dashed `--plan-dash`, 4px | | the wall(s) that broke the rule; the rest stays as last valid |

Invisible hit stroke `--plan-hit` wide over every wall (pointer events only).

Wall grip (selected wall only): rounded rect `--plan-grip-w` x `--plan-grip-h`, `--radius-pill`, fill `--accent`, `--plan-casing` outline, centred on the wall midpoint and rotated with the wall, `grab` cursor. It tells the user the wall body is draggable; the hit area is the wall stroke. Hidden when the wall is shorter on screen than the grip plus both handles.

## Corner handle

- Default: circle `--plan-handle-r` 7px, fill `--plan-handle-fill`, stroke `--plan-handle-stroke` 2px, casing outline. Hit area transparent circle, diameter `--plan-hit`.
- Hover: fill `--accent-hover` at 30% (use `--field-bg-hover` look: lighter fill), radius unchanged.
- Selected: radius `--plan-handle-r-selected` 9px, fill `--accent`, stroke `--plan-wall`.
- Focus: `--focus-ring` around the circle (halo + gold ring).
- Dragging: as selected, plus the angle readout and the snap indicator.
- Invalid: stays at the last valid position with stroke `--plan-error`; the ghost marks the pointer (below).
- Handles on tiny walls may overlap; the later corner is on top, the lists are the alternative.

## Ghost "+" (add corner)

- At each wall midpoint: circle `--plan-ghost-r` 9px, fill `--plan-bg`, stroke `--plan-ghost-color` `--plan-ghost-width` 1.5px, a plus glyph 8px in the same colour. Hit area `--plan-hit`.
- Quiet by design: no fill, no accent. Visible always on the selected wall, on others only above 88 px screen length (UX spec).
- Hover or pressed: stroke and glyph `--accent`, fill `--field-bg-hover` over `--plan-bg`.
- `aria-hidden`, not focusable (UX spec).

## Door symbol (closed door, classic plan symbol)

Drawn inside the wall's opening, on the room side of the wall line.

1. The wall line is broken over the opening (gap = door width).
2. Two jamb ticks across the wall line at both ends of the gap, `--plan-jamb-len` 8px, `--plan-wall` 3px.
3. Door leaf: a straight line from the hinge jamb, perpendicular to the wall into the room, length = door width, `--plan-wall` at `--plan-door-leaf-width` 2px.
4. Swing arc: a quarter circle from the leaf tip to the opposite jamb, radius = door width, `--text-muted` at `--plan-door-arc-width` 1px, solid.
5. Hinge convention (fixed, not modelled in data): hinge at the near edge (the end of the opening nearest the wall's `from` corner), swing into the room. In a reflex notch the arc may cross other walls; it is symbolic only.

States: selected = leaf, jambs and arc in `--plan-wall-selected` with casing under the leaf, arc stays 1px; hover = leaf `--plan-wall-hover`; focus = `--focus-ring` around the opening's hit rectangle (opening length x `--plan-hit`); invalid drag = leaf and jambs `--plan-error` dashed. Hit area: opening length by `--plan-hit`.

## Window symbol

Wall line broken over the opening. Jamb ticks as for the door. Across the gap, two lines `--plan-window` `--plan-window-width` 1px at `--plan-window-gap` 3px either side of the wall line (the glass), plus one centre line on the wall line in the same colour. No arc. States as the door (selected: all three lines `--plan-wall-selected`, centre line 2px).

Doors and windows differ by shape (arc and leaf vs triple line), and by colour only as an extra cue.

## Dimension labels and angle readout

- Wall length: text along the wall, upright, offset 0.75rem toward the room (never over the wall stroke), `--font-ui`, `--plan-label-size` 12px minimum, `--weight-medium`, tabular numbers, `--plan-label-color`, with `paint-order: stroke` and a `--plan-label-halo` stroke `--plan-label-halo-width` for legibility over the grid. Format "3.40 m". No box.
- Emphasised (wall being dragged or selected): `--weight-semibold`, `--text-sm`, `--plan-wall-selected` colour.
- Opening distance (while moving): same style, `--plan-wall-selected`, placed between the opening and the nearest corner.
- Angle readout (corner drag): "90°" next to the corner, 0.75rem off the bisector, `--text-sm` semibold `--plan-angle-color` with halo.
- Selection badge ("Corner 2", "Wall 2"): rect `--radius-sm`, fill `--plan-badge-bg`, text `--plan-badge-text` `--text-xs` semibold, padding `--space-1` `--space-2`, placed 0.75rem off the item on the open side. Casing outline.
- Status line (area and wall count, bottom-left of the canvas): `--text-sm` `--text-primary` tabular numbers, on `--surface-overlay` pill (`--radius-pill`, padding `--space-1` `--space-3`).

## Snap indicator

While dragging with Snap on, when the point snaps: a ring `--plan-snap-r` 5px stroke `--plan-snap` `--plan-snap-width` 1px around the snapped point, plus, for each axis it snaps to, a dashed guide `--plan-dash` 1px `--plan-snap` through the point to the matching corner or grid line, full canvas length. Right-angle snap shows a small square corner mark (6px) at the corner. Appears and disappears instantly. Text-free; the labels already carry the numbers.

## Invalid drag and error chip

- Shape stays at the last valid state. A ghost handle (radius `--plan-handle-r`, stroke `--plan-error` 2px, fill none, dashed `--plan-dash`) follows the pointer, and a dashed `--plan-error` 1px line joins it to the real handle. The offending walls turn dashed `--plan-error` (state table above). Colour plus dash plus the chip text: never colour alone.
- Chip: top-centre of the canvas under the top bar, `--surface-raised`, 1px `--surface-hairline`, `--radius-pill`, `--shadow-toast`, padding `--space-2` `--space-4`, max-width `--plan-chip-max`. Left: 16px error icon in `--plan-error`; text `--text-sm` `--text-primary` (14.5:1). Enter: fade + 8px drop `--dur-base`; exit fade `--dur-fast`; none under reduced motion. `z-index` above the canvas (inside the overlay).
- Field errors in the panel use the existing number input error style (border `--text-error`, hint with icon).

## Editor toolbar (top bar)

- Height `--plan-bar-h` 56px, `--surface-overlay` + `--surface-blur` (fallback `--surface-solid`), bottom 1px `--surface-hairline`, padding `0 var(--space-2)`, gap `--space-2`.
- Done = Primary button; Undo, Redo, Fit, Zoom out, Zoom in = icon buttons (44px, Secondary look); Undo/Redo disabled at `--disabled-opacity`, kept visible. Title "Room shape" `--text-lg` semibold, centred on phone, left of the tools on desktop.
- Snap = switch: 44px high, track `--field-bg` + 1px `--control-border`, `--radius-pill`; on = `--accent` fill; knob fill `--text-primary` with 2px `--surface-solid` border, same as slider thumb; label "Snap" `--text-sm` `--text-primary`. Hover `--field-bg-hover`.
- Below 440px: icon-only (title attribute), label hidden; the status line and Fit/zoom buttons sit at the canvas bottom-right as in the UX layout, same button style over `--surface-overlay`.

## Bottom panel and side panel

- Phone: the action bar and short card (`--surface-overlay`, blur, `--radius-lg` top corners, `--shadow-panel`, `--dur-tray` `--ease-out`). No handle and no stops (the old `--sheet-*` and `--plan-panel-*` tokens are gone).
- Collapsed content: selection title `--text-md` semibold, quick-action buttons in a wrapping row (Secondary, 44px, gap `--space-2`), "Edit details" Secondary.
- Desktop and landscape: `--panel-width`, full height, left hairline, `--surface-overlay`; scrolls inside. Selected form on top, then Room, Walls, Corners as disclosures (header 44px, chevron, `--text-sm` semibold; list rows 44px with `--field-bg-hover` hover and a 2px `--accent` left bar when selected).
- Forms use the existing number input, button and slider-field specs unchanged. The window "Fixed" tag: `--text-xs` semibold `--text-on-accent` on `--accent`, `--radius-sm`, padding `--space-1` `--space-2` (8.5:1).
- Overlay `z-index: var(--z-plan)`; background behind the bar and panel is `--plan-bg`.

## Room tab: segmented mode toggle and summary card

- Toggle: the existing Finish segmented control, two options "Simple rectangle" and "Custom shape", each at least 44px high, equal width, `--text-sm` medium. Track `--field-bg` + 1px `--control-border` `--radius-md`; selected = `--accent` fill, `--text-on-accent`. Group legend "Room" as the other fieldsets. Helper line "Both rooms are saved." `--text-xs` `--text-muted`, `--space-2` below.
- Summary card (Custom): `--surface-raised`, 1px `--surface-hairline`, `--radius-md`, padding `--space-4`, gap `--space-2`. Title "Custom shape" `--text-md` semibold `--text-primary`; two meta lines (corners and area, doors and windows) `--text-sm` `--text-muted` tabular numbers (8.9:1 on raised); **Edit shape** Primary button below, full width on phone, auto width from 900px. The card sits where Length and Width were; Ceiling height slider follows at `--space-4`.
- A small plan thumbnail is optional: if added, 64x64, polygon outline `--plan-wall` 2px on `--plan-bg`, `--radius-sm`, `aria-hidden`.

## Not designed here

Sun marker on the plan (UX open question 8): if approved, a 16px sun glyph in solid `--plan-snap` colour on the canvas edge with an arrow; existing tokens cover it.
