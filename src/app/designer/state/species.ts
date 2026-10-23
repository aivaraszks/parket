// Wood species and wall/ceiling colour presets. Source: docs/design/design-system.md.
import { Finish } from './design-defaults';

export interface Species {
  readonly id: string;
  readonly name: string;
  /** Four plank base colours; instances pick among them. */
  readonly bases: readonly [string, string, string, string];
  /** Colour of grain lines, arches and pores. */
  readonly grain: string;
  /** Per-plank lightness variation as a fraction (0.06 = +-6%). */
  readonly tint: number;
  /** Scales grain line opacity, 0-1. */
  readonly grainStrength: number;
  readonly defaultFinish: Finish;
}

export interface ColorPreset {
  readonly id: string;
  readonly name: string;
  readonly hex: string;
}

export const SPECIES: readonly Species[] = [
  {
    id: 'golden-oak',
    name: 'Golden oak',
    bases: ['#c58a4a', '#b97c3e', '#d39a5a', '#a86c34'],
    grain: '#6b3f1c',
    tint: 0.06,
    grainStrength: 0.8,
    defaultFinish: 'satin',
  },
  {
    id: 'natural-oak',
    name: 'Natural oak',
    bases: ['#d9b98a', '#cfae7c', '#e2c699', '#c4a171'],
    grain: '#8a6a3f',
    tint: 0.06,
    grainStrength: 0.7,
    defaultFinish: 'matte',
  },
  {
    id: 'smoked-oak',
    name: 'Smoked oak',
    bases: ['#6e5238', '#624830', '#7a5d41', '#57402a'],
    grain: '#2e1f12',
    tint: 0.07,
    grainStrength: 0.7,
    defaultFinish: 'matte',
  },
  {
    id: 'walnut',
    name: 'Walnut',
    bases: ['#6b4426', '#5e3a1f', '#76502e', '#53341c'],
    grain: '#2a160a',
    tint: 0.08,
    grainStrength: 0.9,
    defaultFinish: 'satin',
  },
  {
    id: 'ash',
    name: 'Ash',
    bases: ['#e0d0b2', '#d6c4a3', '#e8dac0', '#cdba98'],
    grain: '#9a8260',
    tint: 0.05,
    grainStrength: 0.6,
    defaultFinish: 'matte',
  },
  {
    id: 'whitewashed-oak',
    name: 'Whitewashed oak',
    bases: ['#e6dccb', '#ddd1bd', '#eee6d6', '#d3c6b0'],
    grain: '#a99a82',
    tint: 0.04,
    grainStrength: 0.5,
    defaultFinish: 'matte',
  },
];

export const SPECIES_IDS: readonly string[] = SPECIES.map((s) => s.id);

export const DEFAULT_SPECIES_ID = 'golden-oak';

export function isSpeciesId(value: unknown): value is string {
  return typeof value === 'string' && SPECIES_IDS.includes(value);
}

/** Species by id; unknown ids fall back to the default species. */
export function getSpecies(id: string): Species {
  return SPECIES.find((s) => s.id === id) ?? SPECIES[0];
}

/** Shared by the wall and ceiling pickers. */
export const COLOR_PRESETS: readonly ColorPreset[] = [
  { id: 'white', name: 'White', hex: '#f7f5f0' },
  { id: 'warm-white', name: 'Warm white', hex: '#efe9df' },
  { id: 'linen', name: 'Linen', hex: '#e4d8c5' },
  { id: 'sand', name: 'Sand', hex: '#d2bfa0' },
  { id: 'sage', name: 'Sage', hex: '#b5bfa5' },
  { id: 'dusty-blue', name: 'Dusty blue', hex: '#a9b9c4' },
  { id: 'terracotta', name: 'Terracotta', hex: '#c08a6e' },
  { id: 'charcoal', name: 'Charcoal', hex: '#3d3a38' },
];
