// Single source of truth for design limits and defaults (used by state, UI and tests).
// Units: room in metres, planks in millimetres, angles in degrees.

import { Plan, PLAN_LIMITS } from '../plan/plan-model';

export interface Limit {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

export interface Room {
  length: number;
  width: number;
  height: number;
}

export interface Plank {
  length: number;
  width: number;
}

export interface Sun {
  on: boolean;
  azimuth: number;
  elevation: number;
  intensity: number;
}

export type PatternId = 'herringbone';
export type Finish = 'matte' | 'satin' | 'gloss';

export type RoomMode = 'simple' | 'custom';

export interface Design {
  /** Which room is active. Both are kept saved; switching never loses the other. */
  mode: RoomMode;
  /** The simple-mode rectangle. */
  room: Room;
  /** The custom-mode plan; null until the first switch to custom. */
  plan: Plan | null;
  wallColor: string;
  ceilingColor: string;
  /** Skirting colour; null = each skirting piece matches its wall. */
  skirtingColor: string | null;
  /** Door colour (leaf and casing); null = auto (wood on light walls, white on dark). */
  doorColor: string | null;
  /** Simple-mode wall colours, exactly 4, index = outline edge (0 = window wall); null = base wall colour. */
  simpleWallColors: (string | null)[];
  species: string;
  plank: Plank;
  /** Parallel planks per herringbone block (1 = classic herringbone). */
  planksPerBlock: number;
  pattern: PatternId;
  angle: number;
  finish: Finish;
  sun: Sun;
  wastePercent: number;
}

export const PATTERNS: readonly PatternId[] = ['herringbone'];
export const FINISHES: readonly Finish[] = ['matte', 'satin', 'gloss'];

export const LIMITS = {
  roomLength: { min: 2, max: 12, step: 0.01 },
  roomWidth: { min: 2, max: 12, step: 0.01 },
  roomHeight: { min: PLAN_LIMITS.height.min, max: PLAN_LIMITS.height.max, step: 0.01 },
  plankLength: { min: 300, max: 1200, step: 10 },
  plankWidth: { min: 40, max: 200, step: 5 },
  planksPerBlock: { min: 1, max: 10, step: 1 },
  angle: { min: 0, max: 179, step: 1 },
  // Full circle: with custom rooms a window can face any way. Old 90-270 values stay valid.
  sunAzimuth: { min: 0, max: 359, step: 1 },
  sunElevation: { min: 10, max: 70, step: 1 },
  sunIntensity: { min: 0, max: 2, step: 0.1 },
  wastePercent: { min: 0, max: 30, step: 1 },
} as const satisfies Record<string, Limit>;

/** Herringbone needs plank length >= this factor x block width (planks per block x plank width). */
export const MIN_LENGTH_TO_WIDTH = 2;

/** Smallest plank length (mm) allowed for the given width and planks per block. */
export function minPlankLength(width: number, planksPerBlock: number): number {
  return Math.max(LIMITS.plankLength.min, width * planksPerBlock * MIN_LENGTH_TO_WIDTH);
}

/** Largest plank width (mm, on the step grid) allowed for the given length and planks per block. */
export function maxPlankWidth(length: number, planksPerBlock: number): number {
  const fit =
    Math.floor(length / (MIN_LENGTH_TO_WIDTH * planksPerBlock) / LIMITS.plankWidth.step) *
    LIMITS.plankWidth.step;
  return Math.min(LIMITS.plankWidth.max, fit);
}

/**
 * Make plank size and planks per block satisfy length >= 2 x block width. The width shrinks
 * first (never below its minimum), then the length grows (up to its maximum), and only if
 * that still fails is planks per block reduced.
 */
export function fitPlank(
  plank: Plank,
  planksPerBlock: number,
): { plank: Plank; planksPerBlock: number } {
  let n = planksPerBlock;
  let { length, width } = plank;
  for (; n > LIMITS.planksPerBlock.min; n--) {
    if (minPlankLength(LIMITS.plankWidth.min, n) <= LIMITS.plankLength.max) break;
  }
  if (length < width * n * MIN_LENGTH_TO_WIDTH) {
    width = Math.max(LIMITS.plankWidth.min, Math.min(width, maxPlankWidth(length, n)));
    const need = width * n * MIN_LENGTH_TO_WIDTH;
    if (length < need) {
      const step = LIMITS.plankLength.step;
      length = Math.min(LIMITS.plankLength.max, Math.ceil(need / step) * step);
    }
  }
  return { plank: { length, width }, planksPerBlock: n };
}

export const DEFAULT_SPECIES = 'golden-oak'; // must be an id in species.ts

export const DEFAULT_DESIGN: Readonly<Design> = {
  mode: 'simple',
  plan: null,
  room: { length: 5, width: 4, height: 2.7 },
  wallColor: '#efe9df',
  ceilingColor: '#f7f5f0',
  skirtingColor: null,
  doorColor: null,
  simpleWallColors: [null, null, null, null],
  species: DEFAULT_SPECIES,
  plank: { length: 600, width: 100 },
  planksPerBlock: 1,
  pattern: 'herringbone',
  angle: 0,
  finish: 'satin',
  sun: { on: true, azimuth: 135, elevation: 35, intensity: 1 },
  wastePercent: 12,
};

export const STORAGE_KEY = 'parket.design.v3';
/** Read-only migration source (before wall colouring); never written again. */
export const STORAGE_KEY_V2 = 'parket.design.v2';
/** Read-only fallback for designs saved before custom rooms; never written again. */
export const STORAGE_KEY_V1 = 'parket.design.v1';
export const PERSIST_DEBOUNCE_MS = 300;

/** Clamp to [min, max] and snap to the step grid; non-finite input returns the fallback. */
export function clampToLimit(value: unknown, limit: Limit, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  const clamped = Math.min(limit.max, Math.max(limit.min, value));
  const decimals = Math.max(0, Math.ceil(-Math.log10(limit.step) - 1e-9));
  const snapped = Math.round(clamped / limit.step) * limit.step;
  return Math.min(limit.max, Math.max(limit.min, Number(snapped.toFixed(decimals))));
}
