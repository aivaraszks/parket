// Turning unknown (stored, shared) data into a valid `Design`. Pure; no Angular.

import { normalizeHex } from '../plan/paint';
import { sanitizePlan } from '../plan/plan-sanitize';
import {
  clampToLimit,
  DEFAULT_DESIGN,
  Design,
  Finish,
  FINISHES,
  fitPlank,
  LIMITS,
  PatternId,
  PATTERNS,
  Plank,
} from './design-defaults';
import { isSpeciesId } from './species';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function cloneDefaults(): Design {
  return structuredClone(DEFAULT_DESIGN) as Design;
}

/** Clamp plank and planks per block to their limits and to the length >= 2 x block width rule. */
function sanitizePlank(
  length: unknown,
  width: unknown,
  planksPerBlock: unknown,
): { plank: Plank; planksPerBlock: number } {
  return fitPlank(
    {
      length: clampToLimit(length, LIMITS.plankLength, DEFAULT_DESIGN.plank.length),
      width: clampToLimit(width, LIMITS.plankWidth, DEFAULT_DESIGN.plank.width),
    },
    clampToLimit(planksPerBlock, LIMITS.planksPerBlock, DEFAULT_DESIGN.planksPerBlock),
  );
}

/** Exactly 4 entries: only the first 4 of an array are read, bad or missing ones are null. */
function sanitizeSimpleWallColors(raw: unknown): (string | null)[] {
  const list = Array.isArray(raw) ? raw.slice(0, 4) : [];
  return [0, 1, 2, 3].map((i) => normalizeHex(list[i]));
}

/** Turn unknown (stored) data into a valid design; every bad field falls back to its default. */
export function sanitizeDesign(raw: unknown): Design {
  const d = cloneDefaults();
  if (!isRecord(raw)) {
    return d;
  }
  const room = isRecord(raw['room']) ? raw['room'] : {};
  const plank = isRecord(raw['plank']) ? raw['plank'] : {};
  const sun = isRecord(raw['sun']) ? raw['sun'] : {};
  // Designs saved before multi-strip herringbone have no planksPerBlock: it defaults to 1.
  const fitted = sanitizePlank(plank['length'], plank['width'], raw['planksPerBlock']);
  // A custom mode needs a plan that survives the sanitiser; otherwise fall back to simple.
  const plan = sanitizePlan(raw['plan']);
  return {
    mode: raw['mode'] === 'custom' && plan ? 'custom' : 'simple',
    plan,
    room: {
      length: clampToLimit(room['length'], LIMITS.roomLength, d.room.length),
      width: clampToLimit(room['width'], LIMITS.roomWidth, d.room.width),
      height: clampToLimit(room['height'], LIMITS.roomHeight, d.room.height),
    },
    wallColor: normalizeHex(raw['wallColor']) ?? d.wallColor,
    ceilingColor: normalizeHex(raw['ceilingColor']) ?? d.ceilingColor,
    skirtingColor: normalizeHex(raw['skirtingColor']),
    doorColor: normalizeHex(raw['doorColor']),
    simpleWallColors: sanitizeSimpleWallColors(raw['simpleWallColors']),
    species: isSpeciesId(raw['species']) ? raw['species'] : d.species,
    plank: fitted.plank,
    planksPerBlock: fitted.planksPerBlock,
    pattern: PATTERNS.includes(raw['pattern'] as PatternId)
      ? (raw['pattern'] as PatternId)
      : d.pattern,
    angle: clampToLimit(raw['angle'], LIMITS.angle, d.angle),
    finish: FINISHES.includes(raw['finish'] as Finish) ? (raw['finish'] as Finish) : d.finish,
    sun: {
      on: typeof sun['on'] === 'boolean' ? sun['on'] : d.sun.on,
      azimuth: clampToLimit(sun['azimuth'], LIMITS.sunAzimuth, d.sun.azimuth),
      elevation: clampToLimit(sun['elevation'], LIMITS.sunElevation, d.sun.elevation),
      intensity: clampToLimit(sun['intensity'], LIMITS.sunIntensity, d.sun.intensity),
    },
    wastePercent: clampToLimit(raw['wastePercent'], LIMITS.wastePercent, d.wastePercent),
  };
}
