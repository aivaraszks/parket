// Test helpers for plan specs (not used by app code).

import { Plan, PlanOpening } from './plan-model';
import { Vec2 } from './polygon';

/** A canonical plan from loop points (positive winding expected), without openings. */
export function planFromPoints(points: Vec2[], height = 2.7): Plan {
  const n = points.length;
  const wallId = (i: number): string => `w${n + i + 1}`;
  return {
    vertices: points.map((p, i) => ({ id: `v${i + 1}`, x: p.x, y: p.y })),
    walls: points.map((_, i) => ({
      id: wallId(i),
      from: `v${i + 1}`,
      to: `v${((i + 1) % n) + 1}`,
    })),
    rooms: [{ id: 'r1', wallIds: points.map((_, i) => wallId(i)), height }],
    openings: [],
    nextId: 2 * n + 1,
  };
}

export const RECT: Vec2[] = [
  { x: 0, y: 0 },
  { x: 5, y: 0 },
  { x: 5, y: 4 },
  { x: 0, y: 4 },
];

/** L-shape, 6 x 5 with a 3 x 2 notch at the bottom right: area 24. */
export const L_SHAPE: Vec2[] = [
  { x: 0, y: 0 },
  { x: 6, y: 0 },
  { x: 6, y: 3 },
  { x: 3, y: 3 },
  { x: 3, y: 5 },
  { x: 0, y: 5 },
];

export function opening(
  partial: Partial<PlanOpening> & Pick<PlanOpening, 'id' | 'wallId'>,
): PlanOpening {
  return {
    kind: 'window',
    offset: 1,
    width: 1,
    height: 1.2,
    sill: 0.9,
    anchor: 'floor',
    ...partial,
  };
}
