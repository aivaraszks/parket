// Pure estimate formulas (plan D8, C14). Area in m2, lengths in metres, planks in millimetres.

const EPSILON = 1e-9;

/** Round up, ignoring float noise such as 50.000000001. */
function ceilSafe(value: number): number {
  return Math.ceil(value - EPSILON);
}

export function floorArea(length: number, width: number): number {
  return length * width;
}

/** Skirting length in metres: the room perimeter minus the width of every door. */
export function skirtingLength(perimeter: number, doorWidths: readonly number[]): number {
  return Math.max(0, perimeter - doorWidths.reduce((sum, w) => sum + w, 0));
}

/** Area of one plank in m2. */
export function plankArea(plankLengthMm: number, plankWidthMm: number): number {
  return (plankLengthMm / 1000) * (plankWidthMm / 1000);
}

export function areaWithWaste(area: number, wastePercent: number): number {
  return area * (1 + wastePercent / 100);
}

export function planksNeeded(area: number, singlePlankArea: number): number {
  if (singlePlankArea <= 0) {
    return 0;
  }
  return Math.max(0, ceilSafe(area / singlePlankArea));
}

export interface Estimate {
  floorArea: number;
  plankArea: number;
  planksNet: number;
  areaWithWaste: number;
  planksWithWaste: number;
  /** Metres of skirting board (perimeter minus doors). */
  skirtingLength: number;
}

export function estimate(
  area: number,
  plank: { length: number; width: number },
  wastePercent: number,
  skirting = 0,
): Estimate {
  const single = plankArea(plank.length, plank.width);
  const withWaste = areaWithWaste(area, wastePercent);
  return {
    floorArea: area,
    plankArea: single,
    planksNet: planksNeeded(area, single),
    areaWithWaste: withWaste,
    planksWithWaste: planksNeeded(withWaste, single),
    skirtingLength: skirting,
  };
}
