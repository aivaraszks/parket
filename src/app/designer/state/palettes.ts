// Curated palettes for the Surfaces tab (docs/design/components/colouring.md, section 6).
// Names are the accessible names. Colours are lowercase #rrggbb.

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

/** The palette name of a colour, or null for a custom colour. */
export function paletteName(hex: string): string | null {
  const all = [...WALL_PAINTS, ...DOOR_COLOURS, ...SKIRTING_COLOURS];
  return all.find((c) => c.hex === hex)?.name ?? null;
}
