# Colouring mode: visual spec

Plan: `docs/plans/wall-colouring.md`. UX: `docs/ux/wall-colouring.md`. Tokens: `src/styles.scss` ("Colouring mode"). Reuses Swatch, Segmented, Dialog and Button from `design-system.md`. Contrast ratios are computed (WCAG); "typical" = over `--surface-solid`, "worst" = panel over pure white.

Phone scale: size tokens below are base rem. Components use `calc(var(--chip-dot-size) * var(--ui-scale))` (a `:root` token cannot see the host's 0.8). Targets keep `--target-min` (35px on phones). Borders and rings stay 1-2px.

## 1. Colour toggle (view toolbar, popover item)

Same shape as the other toolbar Secondary buttons (height `--target-min`, `--radius-md`, `--text-sm` semibold, icon + text, text hidden below 440px).

| State | Look |
| --- | --- |
| Off | Secondary: transparent, 1px `--control-border`, `--text-primary`; hover `--field-bg-hover` |
| Pressed (`aria-pressed=true`) | Fill `--toggle-pressed-bg` (`--accent`), text and icon `--toggle-pressed-text`, plus a small check (dot) badge on the icon; hover `--toggle-pressed-bg-hover` |
| Focus | `--focus-ring` |
| `aria-disabled` | `opacity: var(--disabled-opacity)`, `cursor: not-allowed`, still focusable |

Contrast: pressed text `#1e150e` on `#e0a85a` 8.5:1 (hover `#ecbb74` 10.2:1). Pressed fill vs panel 8.5:1 typical, 6.0:1 worst (needs 3:1). Off border vs panel 4.2:1 typical, 3.6:1 worst. Pressed differs from off by fill AND the check, not hue alone. Popover item "Colour mode": 44px row, when on shows a trailing check in `--text-accent` (8.5:1) and sub-text `--text-xs` `--text-muted`.

## 2. Surface list (chip row)

`fieldset` per section (Walls, Doors, Other); `legend` = caps label `--text-xs`, `--tracking-caps`, `--text-muted` (10.0:1). Chips wrap with gap `--space-2`.

Chip: inline-flex, min-height `--target-min`, padding `0 var(--space-3)`, gap `--space-2`, `--radius-pill`, `--surface-chip-bg`, 1px `--control-border`, text `--text-sm` medium `--text-primary` (15.8:1 typical, 11.2:1 worst, plus field tint still above 10:1). Native radio visually hidden but focusable; the label is the chip.

| State | Look |
| --- | --- |
| Hover | bg `--field-bg-hover` |
| Selected | bg `--surface-chip-bg-selected`, border 2px `--surface-chip-ring` (accent), check icon (`--chip-check-size`, `--text-accent`) replaces nothing: it sits after the colour chip. Ring 8.5:1 vs panel |
| Focus | `--focus-ring` (use outline variant if clipped) |

Colour chip inside the item (decorative): circle `--chip-dot-size`, fill = current colour, 1px `--chip-dot-border` always, so white and charcoal both stay visible (border 3.6:1 worst case against the panel; the fill edge against the chip bg is the border). Items with "own" colour (accent wall) look the same; the sentence line below the palette carries the meaning.
- Text-only default case: "All walls" shows the base colour. "Skirting" with `null` shows the colour of the walls (first wall). "Door N" shows the resolved auto colour.
- Selected chip with a mixed colour state is not needed.
- Muted line when no doors: `--text-sm`, `--text-muted`.

## 3. Palette row additions (SwatchGroup)

Swatch itself is unchanged (44px / `--target-min`, `--radius-md`, 1px `--control-border`, selected = 2px `--accent` ring at 2px offset + check). Check colour rule: dark check `#1e150e` when swatch relative luminance is above 0.18, otherwise light `#f6efe6`. At the crossover both give 4.0:1 or better, so the check always passes 3:1.

**Default swatch** ("Same as other walls", "Match walls", "Auto"): first in the row, same height as swatches, width auto with min `--default-swatch-min-w`, padding `0 var(--space-3)`. Fill `--field-bg`, 1px `--control-border`, `--radius-md`, text `--text-sm` medium `--text-primary` (over 10:1), wraps to two lines if needed. Hover `--field-bg-hover`. Selected: 2px `--accent` ring at 2px offset + a check icon before the text (text, not a colour). It is a radio in the same group as the presets.

**"+ Custom" swatch**: same size as a preset, 1px dashed `--control-border` (dashed signals "not a preset"; 3.6:1 worst), `+` icon `--text-primary`. After the user picks a non-preset colour: solid border, fill = that colour, check, ring `--custom-swatch-ring` as for selected. The hex readout ("Custom: #a1b2c3") is `--text-xs` `--text-muted`, `font-variant-numeric: tabular-nums`. The door hint "Paints the door and its frame." is `--text-xs` `--text-muted`.

## 4. Confirm dialog (change all walls)

Reuses the image-dialog shell exactly (`ui/image-dialog.scss`: scrim, `--surface-dialog`, `--radius-lg`, `--shadow-dialog`, padding `--space-6`, max-width 26rem, title `--text-xl` semibold, body `--text-md` `--text-muted`). Differences only:
- No image. Body names the walls (max 3).
- Actions row: flex, gap `--space-2`, right-aligned; Cancel = Secondary button (first, initial focus), "Change all walls" = Primary button. On phone both full width, stacked, Cancel on top (visual order matches focus order), Primary below it. Not red: the action is reversible with Undo.
- Contrast: body `--text-muted` on `--surface-dialog` 11.3:1; title 15.2:1; Primary 8.5:1.

## 5. 3D selection highlight

Emissive tint on the selected surface's materials. In three.js (`material.emissive.set(color)` and `emissiveIntensity`):

```ts
export const HIGHLIGHT_COLOR = '#ffb454';        // --highlight-color
export const HIGHLIGHT_INTENSITY = 0.18;         // All walls / All doors (--highlight-intensity)
export const HIGHLIGHT_INTENSITY_SINGLE = 0.26;  // one wall, door, skirting, ceiling
```

Reasoning (estimated, tone mapping dependent; verify in task 6):
- Warm amber matches the UI accent, so the cue reads as "selection" and is a hue shift, not just a brightness change.
- On charcoal `#3d3a38` (linear about 0.045) an added `(0.18, 0.08, 0.02)` is a large relative lift and turns the wall visibly amber-brown. On white `#f7f5f0` the red channel clips and green and blue rise less, so the wall shifts to a warm cream; modest but visible, and the single-surface value 0.26 widens it.
- Kept low for "All walls" (0.18) so the user can still judge the colour; the colour shift on a mid tone is about 5-8 percent.
- If white proves too weak in task 6, first raise `--highlight-intensity-single` to 0.34, then add an `EdgesGeometry` outline in `--accent` (`#e0a85a`, 2px, only for single surfaces, not for "All"). Do not raise "All" above 0.24.
- Dark surfaces: the intensity is scaled by the surface's colour luminance (`highlightIntensity(ref, hex)` in `scene/highlight.ts`). Surfaces at luminance 0.35 or more keep the full values above; below that the factor falls linearly to `HIGHLIGHT_DARK_SHARE` = 0.45 on black (about 0.12 single, 0.08 for "All"), so charcoal stays recognisably charcoal and the selection is still visible.
- Static: no pulse, no fade; reduced motion identical. Not the only cue (list and heading name the target).
- Never in PNG export.

## 6. Palettes (ready to copy into `state/palettes.ts`)

Names are the accessible names. Colours are lowercase `#rrggbb`. `WALL_PAINTS` keeps the eight existing presets (same ids and hexes) so saved designs match, plus four more. Default wall = `warm-white`, default ceiling = `white`. Every swatch needs the always-on 1px border. The `light` flag is not needed: the check colour comes from luminance (section 3).

```ts
export interface PaletteColor {
  readonly id: string;
  readonly name: string;
  readonly hex: string;
}

/** Walls and ceiling (whites first). */
export const WALL_PAINTS: readonly PaletteColor[] = [
  { id: 'white', name: 'White', hex: '#f7f5f0' },
  { id: 'warm-white', name: 'Warm white', hex: '#efe9df' },
  { id: 'linen', name: 'Linen', hex: '#e4d8c5' },
  { id: 'sand', name: 'Sand', hex: '#d2bfa0' },
  { id: 'greige', name: 'Greige', hex: '#cdc4b6' },
  { id: 'sage', name: 'Sage', hex: '#b5bfa5' },
  { id: 'dusty-blue', name: 'Dusty blue', hex: '#a9b9c4' },
  { id: 'blush', name: 'Blush', hex: '#dcc0b4' },
  { id: 'terracotta', name: 'Terracotta', hex: '#c08a6e' },
  { id: 'forest', name: 'Forest green', hex: '#47594b' },
  { id: 'navy', name: 'Navy', hex: '#34445a' },
  { id: 'charcoal', name: 'Charcoal', hex: '#3d3a38' },
];

/** Door leaf and frame together. */
export const DOOR_COLOURS: readonly PaletteColor[] = [
  { id: 'white', name: 'White', hex: '#f7f5f0' },
  { id: 'light-grey', name: 'Light grey', hex: '#cfd0cf' },
  { id: 'grey', name: 'Grey', hex: '#80858a' },
  { id: 'anthracite', name: 'Anthracite', hex: '#3a3d40' },
  { id: 'black', name: 'Black', hex: '#1d1c1b' },
  { id: 'sage', name: 'Sage green', hex: '#7f9181' },
  { id: 'navy', name: 'Navy', hex: '#34445a' },
  { id: 'natural-oak', name: 'Natural oak', hex: '#d0a874' },
  { id: 'golden-oak', name: 'Golden oak', hex: '#b9803f' },
  { id: 'walnut', name: 'Walnut', hex: '#5e3a1f' },
];

export const SKIRTING_COLOURS: readonly PaletteColor[] = [
  { id: 'white', name: 'White', hex: '#f7f5f0' },
  { id: 'warm-white', name: 'Warm white', hex: '#efe9df' },
  { id: 'light-grey', name: 'Light grey', hex: '#d4d2cc' },
  { id: 'natural-oak', name: 'Natural oak', hex: '#d0a874' },
  { id: 'golden-oak', name: 'Golden oak', hex: '#b9803f' },
  { id: 'walnut', name: 'Walnut', hex: '#5e3a1f' },
  { id: 'charcoal', name: 'Charcoal', hex: '#3d3a38' },
  { id: 'black', name: 'Black', hex: '#1d1c1b' },
];
```

Contrast notes: palette fills are not text, so only the 3:1 border/check rules apply (section 3). Colour names are shown as text in the value line (`--text-muted`, 10.0:1), so no information is by colour alone. The names `Natural oak`, `Golden oak` and `Walnut` are door/skirting finishes, not the flooring species; hexes differ slightly on purpose (painted/stained timber reads lighter under lighting than the plank tints).
