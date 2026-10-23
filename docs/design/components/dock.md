# Dock, rail, tray (visual spec)

Plan: `docs/plans/dock-redesign.md` (D1-D5, task 3). UX: `docs/ux/dock-redesign.md`. Tokens: `src/styles.scss` (1x values) and `src/app/designer/_phone-scale.scss` (phone, 0.8x). Dark theme only. Every value below is a token; no hard-coded sizes in components.

Phone scale stays (user answer): targets >= 24 px (actual `--target-min` 35 px), no text below `--text-xs` (11.2 px on phones). Inputs keep 16 px (`--text-input`).

## 1. Layout tokens

| Token | 1x (desktop, landscape rail) | Phone (0.8x) | Use |
| --- | --- | --- | --- |
| `--dock-h` | 4rem (64) | 3.2rem (51) | bottom dock height, plus `env(safe-area-inset-bottom)` as padding in the component |
| `--dock-item-min-w` | 4rem | 3.2rem | five items share the width (flex 1); fits 320 CSS px |
| `--dock-icon-size` | 1.5rem | 1.2rem | icon box |
| `--rail-w` | 4.5rem (72) | n/a | right-edge rail, from 900 px and landscape phones (>= 560 x < 500) |
| `--rail-item-h` | 4rem | n/a | rail button height |
| `--column-w` | 20rem (320) | n/a | collapsible column left of the rail; capped to `--column-max` (45% of width) on landscape phones |
| `--tray-cap` | 45dvh | 45dvh | tray max height (phone); never below the header (`--tray-header-h`) so the close chevron stays on screen. A bottom edge fade on `.tray-body` shows there is more to scroll |
| `--tray-min-h` | 12rem | 9.6rem | tray never shorter when open |
| `--tray-view-reserve` | 4rem | 3.2rem | 400% zoom: view strip that must stay above the tray |
| `--tray-header-h` | `--target-min` | 35 px | title row with close button |

Tray height (phone): `height: auto; max-height: min(max(var(--tray-cap), var(--tray-min-h)), 100dvh - var(--frame-top) - dock - var(--tray-view-reserve))`; content scrolls inside. Check: 360x640 gives 256 px, enough for the Floor essentials (header 35 + wood strip about 70 + Angle 52 + Finish 52 + More 35). The cap only shrinks below 40% at 400% zoom.

Phone stack, bottom to top: dock (`--dock-h`), tray (above the dock), view. Desktop: rail at the right edge, column to its left; the column and rail are full height under the top bar. The frame insets published by the shell are the measured box sizes of these elements.

## 2. Surfaces and translucency

| Token | Value | Use |
| --- | --- | --- |
| `--tray-bg` | `rgb(30 21 14 / 0.92)` | tray, dock, rail, column at rest (near-opaque; the floor shows only faintly) |
| `--tray-bg-scrub` | `rgb(30 21 14 / 0.14)` | tray background while a thumb is held |
| `--tray-blur` | `var(--surface-blur)` | `backdrop-filter`; if unsupported use `--surface-solid` |

Tray top radius `--radius-lg` (phone). Shadow `--shadow-panel`. Dock top edge: 1px `--surface-hairline`. Column left edge and rail left edge: 1px `--surface-hairline`, no radius. Tray sits on the dock with no gap and no seam shadow.

Contrast over the worst-case floor (a pure white view pixel under `--tray-bg`, blended colour about `rgb(48 40 33)`, luminance 0.0225). AA needs 4.5:1 text, 3:1 non-text:

| Pair | Ratio | AA |
| --- | --- | --- |
| `--text-primary` `#f6efe6` | 12.7:1 | pass |
| `--text-muted` `#cdbfae` | 8.0:1 | pass |
| `--text-accent` `#e0a85a` | 6.8:1 | pass |
| `--text-error` `#ff9b8a` | 7.1:1 | pass |
| `--control-border` (non-text) | 3.8:1 | pass |
| `--accent` fill / bar (non-text) | 6.8:1 | pass |
| `--text-primary` / `--text-muted` on `--dock-active-bg` (accent 14% over the tray) | 11.9:1 / 7.6:1 | pass |

Over a dark floor the ratios are higher (typical 15.8 / 10.0). Values computed with the WCAG relative-luminance formula; verify once on a screenshot over White and Whitewashed oak. Because the rest state is near-opaque, no text depends on the translucency. The focus ring (dark halo + `#ffd58a`, 12.9:1 halo vs ring) stays readable on the tray and on the 3D view.

## 3. Dock and rail buttons (disclosure toolbar)

Structure: icon above a label (`--text-xs`, `--weight-medium`), centred, `--radius-md`, min size `--dock-item-min-w` x `--dock-h` (rail: `--rail-w` x `--rail-item-h`), gap `--space-1` between icon and label. Gap between items is 0 on the dock (they share the width); the hit area is the whole cell.

| State | Look |
| --- | --- |
| Rest | icon outline + label `--text-muted` |
| Hover | background `--field-bg-hover`; text `--text-primary` |
| Focus-visible | `--focus-ring` (inset-safe: use `outline: 2px solid var(--focus-ring-color); outline-offset: -4px` because the dock clips shadows) |
| Active (pressed) | background `--field-bg-hover` |
| Open section | label and icon `--text-primary`, icon filled (see 8), background `--dock-active-bg`, plus a `--dock-bar-h` bar in `--accent` on the top edge of the dock button (left edge on the rail), `aria-expanded="true"`. Never colour alone: fill, bar and label weight `--weight-semibold`. |
| Disabled | not used (all sections always available) |

Estimate button: replaces the icon with the number (`--text-lg`, `--weight-semibold`, `--leading-tight`, tabular nums, `--text-primary`) over the word "planks" (`--text-xs`, `--text-muted`). While there is no result (loading, error) it shows the Estimate icon and the label "Estimate". Same open-state treatment.

Transition: `--dur-fast` on background and colour; none under reduced motion.

## 4. Tray

- Header: `--tray-header-h` row, padding-inline `--space-4`. Title `h2` `--text-md`, `--weight-semibold`, `--text-primary`, preceded by the section icon at `--icon-size`, `--text-muted`. Close button right: icon-only chevron-down (phone) / chevron-right (column), `--target-min` square, secondary icon-button look (transparent, hover `--field-bg-hover`).
- Body: padding `--space-4`, row gap `--space-3`. Row = label left (`--text-sm`, `--weight-medium`, `--text-primary`), value right (`--text-sm`, `--text-muted`, tabular), control full width below. Minimum row gap keeps targets 24 px apart.
- "More": native `<details>`, summary full width, height `--target-min`, `--text-sm` `--text-muted`, chevron right (rotates 180 degrees open, none under reduced motion), top hairline `--surface-hairline`.
- Open/close: slide up from the dock over `--dur-tray` `--ease-out` (`transform` + `opacity`), content opacity fades in from 0 at 40% of the duration. Camera frame tween uses the same duration. Reduced motion: no slide, no tween.
- Column (desktop): `--column-w`, collapses with width/transform over `--dur-tray`; the same body.

## 5. Scrub to see

While a pointer holds a range thumb (`app-slider-field.scrubbing`):

| Part | Look |
| --- | --- |
| Tray background | `--tray-bg-scrub`, `backdrop-filter: none`, shadow off |
| Other rows and header | `opacity: var(--scrub-opacity)` (0.3) |
| Active row | opaque: background `--tray-bg`, radius `--radius-md`, padding `--space-2`; its text keeps the ratios in section 2 |
| Dock / rail | unchanged |
| Transition | `--dur-scrub` `--ease-out` on background and opacity; none under reduced motion (instant) |

The faded rows are inactive and transient (only while a thumb is held, pointer only); they carry no information the active row and the bubble do not repeat, so the 4.5:1 requirement is met for the active row only. Layout never changes (opacity and background only), so nothing moves under the finger. Pointer events on the tray stay as they are.

### Value bubble

Appears above the thumb while scrubbing. Background `--bubble-bg` (`--surface-raised`), 1px `--surface-hairline`, `--radius-md`, `--shadow-toast`, text `--bubble-text` `--text-sm` `--weight-semibold`, tabular, unit included ("45°", "120%"). Size: min `--bubble-min-w` x `--bubble-h` (phone 2.4 x 1.6rem), padding-inline `--space-2`. Gap from the thumb top edge `--bubble-gap`, with a 0.375rem triangle pointer in the same fill. Text `--text-primary` on `--surface-raised` 14.5:1. It follows the thumb horizontally, clamped to the stage width minus `--space-2`. `z-index: var(--z-bubble)`. To avoid being clipped by the scrolling tray, position it with `position: fixed` from the thumb rect (frontend). `aria-hidden` (the field already exposes the value). Fade in `--dur-fast`; none under reduced motion.

## 6. Colour section: chips and swatch strip

### Chip rows ("What", "Which")

Radio groups styled as chips. Row: horizontal flex, gap `--chip-gap`, `overflow-x: auto`, scroll-snap start, scrollbar hidden, sideways-scroll edge fade by `mask-image` over `--chip-fade-w` (transparent to opaque; no extra colour). The row height is always `--chip-h` (including in the "Whole ceiling." note state) so the tray never resizes.

| State | Look |
| --- | --- |
| Rest | height `--chip-h`, min-width `--chip-min-w`, padding-inline `--chip-pad-x`, `--radius-pill`, `--field-bg`, 1px `--control-border` (3.8:1 worst case), `--text-sm` `--weight-medium` `--text-primary` |
| Hover | `--field-bg-hover` |
| Focus-visible | `--focus-ring` (roving: one tab stop per group) |
| Selected | fill `--accent`, text `--text-on-accent` (8.5:1), border `--accent`, `--weight-semibold`; the "What" chips also show a 14 px check before the label |
| Disabled | `--disabled-opacity` (Which row for Ceiling/Skirting shows the note instead, not disabled chips) |

Number chips ("1", "2") are square-ish (`--chip-min-w`). Selected is shown by luminance flip (dark text on gold) and weight, not hue alone. Note text ("Whole ceiling.") `--text-sm` `--text-muted`, vertically centred in the reserved row.

### Swatch strip

One row, same scroll/fade behaviour as chips. Swatch `--strip-swatch` square (phone 35 px), `--radius-md`, 1px `--control-border` always, gap `--space-2`. States as in design-system "Swatch": selected is a 2px `--accent` ring at 2px offset plus a check (dark or light by swatch luminance); hover ring `--control-border`; custom swatch has "+". Text swatches ("Same as walls") keep `--default-swatch-min-w`. The value line below uses `--text-sm` `--text-muted` ("Wall 3 is Warm white."), 8.0:1 worst case.

### Wood strip (Floor)

Same row pattern. Item width `--wood-chip-w` (phone 4.2rem): swatch `--strip-swatch` high, full item width, `--radius-md`, 1px `--control-border`; name below `--text-xs` `--text-primary`, centred, 2 lines max with ellipsis. Selected: accent ring + check as swatches, name `--weight-semibold`. Radio group "Wood".

### First-use hint chip

Over the view, centred under the top bar: `top: calc(var(--frame-top) + var(--space-2))`, max-width `--hint-max-w`, background `--surface-raised`, 1px `--surface-hairline`, `--radius-pill`, `--shadow-toast`, padding `--space-2` `--space-4`, `--text-sm` `--text-primary` (14.5:1, opaque). `pointer-events: none` (never blocks 3D taps). Fades out over `--dur-base`.

## 7. Toast, z-order

Toasts stay above the dock and tray: `bottom: calc(var(--frame-bottom) + var(--space-3))`. Z-order: view UI `--z-view-ui` 10 (the top bar sits at popover level so the Camera menu opens over the tray, dock and rail), tray/dock/rail `--z-tray` 20, bubble `--z-bubble` 25, popover 30, toast 40, dialog 50.

## 8. Icons (inline SVG)

`viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, `stroke-width` = `--dock-icon-stroke` (1.75), round caps and joins, size `--dock-icon-size`, `aria-hidden="true"`. Paths with class `f` are the fillable body: open section sets `fill: currentColor; fill-opacity: 0.28` on `.f` (detail lines stay strokes). Section icons in the tray header render at `--icon-size`.

```html
<!-- Room: L-shaped room outline -->
<path class="f" d="M4 4h10v6h6v10H4z"/>

<!-- Floor: planks with staggered joints -->
<path class="f" d="M4 6h16v12H4z"/>
<path d="M4 10h16M4 14h16M10 6v4M15 10v4M8 14v4"/>

<!-- Colour: droplet -->
<path class="f" d="M12 3.5c3.2 3.8 5.5 6.6 5.5 9.5a5.5 5.5 0 0 1-11 0c0-2.9 2.3-5.7 5.5-9.5z"/>
<path d="M9.5 14a2.8 2.8 0 0 0 2 2.4"/>

<!-- Light: sun -->
<path class="f" d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/>
<path d="M12 2.5V5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>

<!-- Estimate: calculator (fallback while there is no count; also the tray header) -->
<path class="f" d="M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/>
<path d="M8.5 7.5h7M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01"/>

<!-- Chevron (close tray on the phone; rotate for the column and More) -->
<path d="M6 9l6 6 6-6"/>
```

Dots in the calculator use zero-length strokes with round caps (visible at `stroke-width` 1.75). Active state keeps a visible silhouette without fill if `forced-colors` is on (fill ignored; the bar and `aria-expanded` remain, and the system adds `CanvasText` strokes).

## 9. Landing delays

`--delay-cta: 2.4s` (first visit) and `--delay-cta-return: 0.8s` (returning, a summary exists); the landing component picks one for the CTA block's `animation-delay`. `--dur-cta-in` 0.6s unchanged. Pills accept pointer input from the first frame (`visibility` no longer hides them from pointer; only opacity animates, and `aria-hidden` is not used). Reduced motion: shown at once.

## 10. Removed tokens

The bottom-sheet tokens are deleted from `src/styles.scss` and `_phone-scale.scss`: `--sheet-handle-w/h`, `--sheet-peek/half/full`, `--z-sheet`, `--dur-sheet` (the Projects dialog's `sheet-in` uses `--dur-tray`) and `--plan-panel-collapsed/expanded`. `--panel-width` stays for the plan editor side panel only.
