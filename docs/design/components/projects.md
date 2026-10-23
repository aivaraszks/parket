# Projects, Share and Landing "Continue": visual spec

UX: `docs/ux/share-and-projects.md`. Plan: `docs/plans/share-and-projects.md`. Tokens are in `src/styles.scss` ("Landing Continue", "Projects and sharing"). Dark warm glass, same as the designer. Sizes marked (S) are base rem: use `calc(X * var(--ui-scale))` so the Compact phone scale applies. Everything else uses tokens only. Ratios are computed (WCAG relative luminance); landing ratios over the photo are estimates, as in the design system.

Base luminances: `--surface-dialog` `#231810` 0.0105, `--surface-raised` `#2b1f16` 0.0155. Text on `--surface-dialog`: `--text-primary` 15.2:1, `--text-muted` 9.6:1, `--text-accent` 8.2:1, `--text-error` 8.5:1.

## Icons (all `currentColor`, `--icon-size` (S), 16 unit viewBox, `fill: none`, `stroke-width: var(--icon-stroke)`, round caps and joins, `aria-hidden`)

| Icon | Paths |
| --- | --- |
| Projects (layers) | `M8 2 14 5.25 8 8.5 2 5.25Z` `M2 8.25 8 11.5 14 8.25` `M2 11.25 8 14.5 14 11.25` |
| Chevron down | `M4 6.25 8 10.25 12 6.25` |
| Share (nodes) | circles r 2 at (12 3.5), (4 8), (12 12.5); lines `M5.8 7 10.2 4.5` `M5.8 9 10.2 11.5` |
| More (three dots) | circles r 1.1 at (3 8), (8 8), (13 8), `fill: currentColor`, no stroke |
| Check | `M3.5 8.5 6.5 11.5 12.5 4.5` (stroke 2) |
| Close | `M4 4 12 12` `M12 4 4 12` |
| Plus | `M8 3v10` `M3 8h10` |

## 1. Toolbar chips

Both are `.btn.chip` from the existing toolbar (`--surface-overlay` + blur, `--surface-solid` fallback, 1px `--control-border`, `--radius-md`, `--text-sm` semibold, height `--target-min`, `--text-primary`; hover `--field-bg-hover`). Contrast 15.8:1 typical, 11.2:1 worst case (design system).

**Projects chip**: `[layers icon] Name [chevron]`, gap `--space-2`, padding `0 var(--space-3)`. The name is a `span` with `max-width: var(--project-chip-name-max)` (12ch phones, 20ch from 900px), `overflow: hidden; text-overflow: ellipsis; white-space: nowrap`. The chip itself is `flex: 0 1 auto; min-width: 0` so it shrinks before the spacer and never wraps the bar. Below 360px the name is hidden (visually, `aria-label` keeps it) and the chip is icon + chevron only. States: hover fill; focus `--focus-ring`; active (dialog open) `aria-expanded="true"` fill `--field-bg-hover`; the chevron is static (no rotation). No pressed-accent look: accent pressed is reserved for Colour mode.

**Share chip**: `[share icon] Share`, secondary look, same height. Below 900px icon-only: width `--target-min`, padding 0, label visually hidden. Busy (`aria-busy="true"`): the icon is replaced by the existing `.spinner`, opacity 0.7 (not the disabled 0.45), `cursor: progress`. Save image stays the only primary chip.

Order in the bar: Back, Projects, spacer, Views, Help, Share, Save. At 320px the Projects chip drops the name first.

## 2. Projects dialog

Container `:host` follows `colour-confirm-dialog.scss`: fixed, `z-index: var(--z-dialog)`, scrim `--surface-scrim` + blur 4px. The panel is `--surface-dialog`, `--shadow-dialog`, `--text-primary`, `font-family: var(--font-ui)`.

| | Phone (below 600px) | Desktop (600px and up) |
| --- | --- | --- |
| Placement | bottom sheet: `align-items: end`, no outer padding, full width | centred, padding `--space-4` around |
| Size | `max-height: var(--projects-sheet-max-h)` (80dvh) | `width: min(100%, var(--projects-dialog-w))`, `max-height: min(100%, 36rem)` |
| Radius | `--radius-lg` top corners only | `--radius-lg` |
| Padding | `--space-4` sides, bottom `max(var(--space-4), env(safe-area-inset-bottom))` | `--space-6` |
| Enter | slide up from 100% over `--dur-tray` `--ease-out` | fade + 8px rise over `--dur-base` `--ease-out` |

Reduced motion: no slide, fade or rise. Layout is a flex column: header (not scrolling), count, New button, list (`overflow-y: auto; min-height: 0; flex: 1`), so only the list scrolls. 320px at 200% zoom works because the sheet scrolls and rows wrap nothing. Scrim tap closes. A 2.5rem x 0.25rem decorative grabber is not drawn (the sheet is not draggable).

**Header**: `h2` "Projects" (`--text-xl` semibold, `--leading-tight`) left, Close icon button right: `--target-min` square, secondary look (transparent, 1px `--control-border`, `--radius-md`), close icon. **Count line**: "3 of 50 projects", `--text-sm` `--text-muted` (9.6:1), `tabular-nums`, margin-top `--space-1`.

**New project**: full-width Primary button (height `--target-min`, `--accent` fill, `--text-on-accent` 8.5:1; hover `--accent-hover` 10.2:1; active `--accent-active` 6.4:1), plus icon + "New project", margin `--space-4` 0. At the limit: `aria-disabled="true"`, `opacity: var(--disabled-opacity)`, `cursor: not-allowed`, still focusable; hint below it, `--text-xs` `--text-muted`, "Limit reached. Delete a project to add more.", `aria-describedby`. The disabled button label stays legible because the state is also stated in the hint text (a disabled control is exempt from contrast, the hint is 9.6:1).

**List** (`ul`, no bullets, margin 0, padding 0, `gap: var(--space-1)`, top divider 1px `--surface-hairline`, padding-top `--space-2`). Each `li` is a flex row: row button grows, More button fixed, gap `--space-2` (8px minimum between targets).

**Row button**: `min-height: max(var(--target-min), calc(var(--project-row-h) * var(--ui-scale)))`, padding `var(--space-2) var(--space-3)`, `--radius-md`, transparent, no border, text-align left, `display: grid` with two lines:
- line 1: name, `--text-md` medium `--text-primary` (15.2:1), one line, ellipsis.
- line 2: "Edited 3 Oct", `--text-xs` `--text-muted` (9.6:1). On the current row it reads "Edited today" then a separator dot then the marker.
- hover: background `--project-row-hover` (primary 10.6:1, muted 6.9:1).
- active (pressed): background `--field-bg`, `transform: none`.
- focus: `--focus-ring`; the list container must not clip it (give the list `padding: var(--space-1)` for the ring).

**Current marker** (not colour alone): background `--project-row-current-bg` (primary 11.7:1, muted 7.4:1, accent 6.3:1 on it), a left bar `--project-current-bar-w` x full height in `--accent` (3:1 vs the dialog: 8.2:1), a check icon (`--accent`, `--icon-size` (S)) at the left of line 2 and the word "Current" in `--text-accent` semibold `--text-xs`. The check and the word are inside the row button, so the accessible name reads "Kitchen, edited today, current". `aria-current="true"` on the button. Forced colours: the bar uses `Highlight`.

**More button**: `width: var(--target-min)` (44px, 35px on phones, meets the 35px floor), `min-height` same as the row, secondary look: transparent, 1px `--control-border` (4.1:1 on the dialog), `--radius-md`, three-dot icon in `--text-muted` (9.6:1). Hover `--field-bg-hover`; `aria-expanded="true"` fill `--field-bg-hover` + icon `--text-primary`; focus ring.

## 3. Row menu

Same surface as the Views popover: `--surface-raised`, 1px `--surface-hairline`, `--radius-md`, `--shadow-toast`, padding `--space-2`, `z-index: var(--z-popover)`, `min-width: calc(var(--menu-min-w) * var(--ui-scale))`, `max-width: calc(100% - 2 * var(--space-3))`. It is positioned under More, right-aligned to the More button (flip above if it would leave the panel). Because the dialog panel scrolls and clips, render the menu inside the panel with `position: fixed` or anchor it to the `li` and keep `overflow: visible` on the list's last rows (frontend picks; the visual is the same). Items follow the toolbar `.item`: `min-height: var(--target-min)`, padding `0 var(--space-3)`, `--text-sm` medium, `--text-primary` (14.0:1 on raised), hover `--field-bg`, focus ring (outline variant, inset: `outline: 2px solid var(--focus-ring-color); outline-offset: -2px`, since the popover clips).

Delete: text `--text-error` (7.9:1 on raised) and a trash glyph (word plus icon, not colour alone). Order Rename, Duplicate, Delete, with a 1px `--surface-hairline` rule above Delete. Duplicate at the limit: `aria-disabled`, `opacity: var(--disabled-opacity)`, sub-text "Limit reached" (`small`, `--text-xs` `--text-muted` 8.9:1).

## 4. Rename (inline)

Replaces line 1 and 2 of that row (the row button is swapped for a text field wrapper; More stays). Field: the shared `field` mixin (height `--target-min`, `--field-bg`, 1px `--control-border`, `--radius-md`, `--text-primary`, font `--text-input` 16px, never scaled), full width, focus `--focus-ring`. Helper "1 to 40 characters" below it, `--text-xs` `--text-muted`. The row keeps the current background if it is the current one. No error style needed (empty reverts silently). The row grows by the helper line; the list may shift.

## 5. Share fallback dialog

Reuses `colour-confirm-dialog` styles unchanged (`.dialog`, `h2`, `p`, `.actions`, `.btn`): max-width 26rem, `--space-6` padding, title `--text-xl`, body `--text-md` `--text-muted` (9.6:1). Add:
- Label "Share link": `--text-sm` medium `--text-primary`, above the field, `for` the field.
- Link field: the `field` mixin, `height: var(--link-field-h)`, `width: 100%`, `font-size: var(--text-input)`, `text-overflow: ellipsis`, `user-select: all`, read-only (no dimmed look, so no `--disabled-opacity`). On phones it scrolls sideways on focus.
- Close: Secondary `.btn` (the safe action; there is no destructive choice), right aligned, full width stacked on phones.

## 6. Shared-link prompt

Reuses `colour-confirm-dialog` styles unchanged. Body is two paragraphs: the summary line (`“Kitchen”, custom shape, 14 m²`) in `--text-primary` `--weight-medium`, then the note in `--text-muted`. Buttons: Cancel (Secondary, first in DOM and focus, initial focus) and "Add as new project" (Primary). At the limit the Add button is `aria-disabled` (`--disabled-opacity`), and the extra sentence "You have 50 projects. Delete one to add this design." sits in the body in `--text-error` (8.5:1) with the word as the cue (a warning icon is optional).

## 7. Toasts

Existing toast styles. Delete toast uses the standard action link (`--text-accent` semibold underlined, 7.6:1 on raised) for Undo. Storage and link errors use the error toast variant (3px `--text-error` bar plus icon).

## 8. Landing: Continue

File: `src/app/landing/landing.scss` (Track B). Look stays as is: warm, Archivo Black wordmark, grain on top. The CTA block keeps its entrance (`cta-in` after `--delay-cta`, `.revealed`, `:focus-within`, reduced motion shows it at once).

**Without summary**: exactly as before (kicker + one pill, `--cta-reserve` 6.5rem).

**With summary**, inside `.cta`, DOM order: kicker, `.actions`, count.

```
HERRINGBONE, IN 3D                    kicker (unchanged)
[ CONTINUE: KITCHEN ]                 primary: gold fill
[ DESIGN YOUR FLOOR ]                 secondary: existing glass pill
3 projects on this device             count
```

- `.actions`: `display: flex; flex-direction: column; align-items: stretch; gap: var(--cta-actions-gap)`. Stacked pills are the same width (the wider one), because `stretch` in a shrink-wrapped column does that. The block uses `width: max-content; max-width: calc(100vw - 2 * var(--space-6))`.
- **Continue (primary pill)**: same geometry as `.pill` (height `--cta-height`, `--radius-pill`, `--font-ui` `--text-sm` semibold, uppercase, `--cta-tracking`, `--shadow-rule`) but fill `--cta-primary-bg`, 1px border the same colour, text `--cta-primary-text`. Contrast 8.5:1 (opaque, so independent of the floor). Hover and focus-visible: `--cta-primary-bg-hover` (10.2:1); active `--cta-primary-bg-active` (6.4:1); focus also `--focus-ring`. It is the first Tab stop.
- **Name inside Continue**: `<span class="name">` with `max-width: var(--cta-name-max)`, `min-width: 0`, `overflow: hidden; text-overflow: ellipsis; white-space: nowrap`, rendered as text. It stays uppercase with the pill (tracking applies). The pill is `min-width: 0; max-width: 100%`, so it shrinks and truncates the name rather than overflow; about 11 characters fit at 360px, about 18 from 560px.
- **Design your floor (secondary)**: the existing `.pill` unchanged (glass `--cta-bg`, white, 1px `--cta-border`; white on it 6.6:1 worst case); it opens `/designer?new=1`. When a summary exists add `opacity: 1` only: no dimming.
- **Count line**: `--text-xs`, `--font-ui`, `--weight-medium`, colour `--cta-meta-color`, `--shadow-text`, centred, `margin: 0`, gap above from the block's flex gap. Contrast: it sits below the wordmark's dark pool, so the block gets its own local pool: `.cta::before { content: ''; position: absolute; inset: -3rem -4rem; z-index: -1; pointer-events: none; background: radial-gradient(ellipse closest-side, var(--veil-cta) 70%, transparent 100%) }` (the `::before` fades with the block). White on the pool over the brightest sun-lit oak (lum 0.49) blends to luminance about 0.15-0.19, so 4.5:1 to 5.3:1; over normal oak about 6.5:1 or more. Estimated, to be verified on a screenshot at the bottom of a 360x640 viewport (the count is the lowest, brightest-risk line); if it fails raise `--veil-cta` alpha, not the text weight. The pool is `aria-hidden` by being a pseudo-element.
- **Layout**
  - Below 560px (and taller than 480px): stacked, as above. `.cta { top: min(calc(50% + max(6rem, 14vh)), calc(100dvh - var(--cta-reserve-stacked) - env(safe-area-inset-bottom, 0px))) }`. Check at 360x640: top 416px, bottom 584px, fine. At 360x568 the pills sit just under the rule; acceptable.
  - From 560px wide: `.actions` is a row (`flex-direction: row; align-items: center`), pills use the compact padding `0 var(--cta-pad-x-compact)` and tracking `--cta-tracking-compact`, Continue first (left). `top` uses `--cta-reserve-row`. The name shrinks first (`flex: 0 1 auto`), so 560px works with names up to about 8 characters and shows an ellipsis beyond that.
  - Short landscape (max-height 480px): row layout whatever the width, kicker and count hidden (`display: none`), `top` keeps its current formula with `--cta-reserve-landscape`. The count is hidden with `display: none` (not just visually) because the summary is repeated on the next screen.
- **Reduced motion**: nothing new; the transitions in `.pill` are already off.
- **Keyboard**: `:focus-within` reveals the block; focus ring on the gold pill uses the dark halo, which stays visible against the gold (halo 12.9:1 vs ring).

## 9. Deviations to avoid

No hard-coded colours or sizes in these components; no new animation on the landing; do not add a light theme variant; keep user text (project names) as text only.
