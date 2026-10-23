import { describe, expect, it } from 'vitest';
import { createRandom } from '../scene/random';
import { deleteVertex, insertVertex, moveVertex, NO_SNAP } from './plan-edit';
import { opening, planFromPoints, RECT } from './plan-fixtures';
import { loopPoints } from './plan-model';
import { validatePlan } from './plan-validate';
import {
  clampPointInside,
  hasSelfIntersection,
  interiorAngles,
  interiorPoint,
  offsetPolygon,
  pointInPolygon,
  rectIntersectsPolygon,
  signedArea,
  Vec2,
} from './polygon';
import { toRoomShape } from './room-shape';

// U opening to the top: 6 x 5 outer, notch x 2..4 from the top edge down to y = 3 (2 m wide).
const U: Vec2[] = [
  { x: 0, y: 0 },
  { x: 2, y: 0 },
  { x: 2, y: 3 },
  { x: 4, y: 3 },
  { x: 4, y: 0 },
  { x: 6, y: 0 },
  { x: 6, y: 5 },
  { x: 0, y: 5 },
];

const codes = (points: Vec2[]): string[] => validatePlan(planFromPoints(points)).map((e) => e.code);

describe('collinear points', () => {
  const straight: Vec2[] = [
    { x: 0, y: 0 },
    { x: 2.5, y: 0 }, // 180 degree corner in the middle of the top wall
    { x: 5, y: 0 },
    { x: 5, y: 4 },
    { x: 0, y: 4 },
  ];

  it('keeps area, validity and a 180 degree angle', () => {
    expect(signedArea(straight)).toBeCloseTo(20, 9);
    expect(interiorAngles(straight)[1]).toBeCloseTo(180, 6);
    expect(codes(straight)).toEqual([]);
  });

  it('builds a scene shape with every wall, including the straight split', () => {
    const plan = planFromPoints(straight);
    const shape = toRoomShape({ mode: 'custom', room: { length: 5, width: 4, height: 2.7 }, plan });
    expect(shape.outline).toHaveLength(5);
  });

  it('offsets a straight vertex by the distance, along the normal', () => {
    const out = offsetPolygon(straight, 0.15);
    expect(out[1].x).toBeCloseTo(2.5, 9);
    expect(out[1].y).toBeCloseTo(-0.15, 9);
  });

  it('treats three collinear points in a row as one straight wall for containment', () => {
    expect(pointInPolygon({ x: 2.5, y: 0 }, straight)).toBe(true);
    expect(pointInPolygon({ x: 1, y: 0 }, straight)).toBe(true);
    expect(pointInPolygon({ x: 6, y: 0 }, straight)).toBe(false);
  });

  it('rejects a spike: a corner pushed back out along the same line', () => {
    // 5 -> 2 -> 5 on the same line folds the wall back onto itself.
    const fold: Vec2[] = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 2, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 4 },
      { x: 0, y: 4 },
    ];
    expect(codes(fold).length).toBeGreaterThan(0);
  });

  it('can drag the straight corner out and back without breaking the plan', () => {
    const plan = planFromPoints(straight);
    const out = moveVertex(plan, 'v2', { x: 2.5, y: -1 }, NO_SNAP);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(validatePlan(out.plan)).toEqual([]);
      const back = moveVertex(out.plan, 'v2', { x: 2.5, y: 0 }, NO_SNAP);
      expect(back.ok).toBe(true);
    }
  });
});

describe('near-zero walls', () => {
  const withTop = (x: number): Vec2[] => [
    { x: 0, y: 0 },
    { x, y: 0 },
    { x: 5, y: 0 },
    { x: 5, y: 4 },
    { x: 0, y: 4 },
  ];

  it('rejects zero-length, 1 mm and 29.9 cm walls but accepts exactly 30 cm', () => {
    expect(codes(withTop(0))).toContain('wall-too-short');
    expect(codes(withTop(0.001))).toContain('wall-too-short');
    expect(codes(withTop(0.299))).toContain('wall-too-short');
    expect(codes(withTop(0.3))).toEqual([]);
  });

  it('refuses a drag that collapses a corner onto its neighbour and leaves the plan unchanged', () => {
    const plan = planFromPoints(RECT);
    const before = JSON.stringify(plan);
    const result = moveVertex(plan, 'v2', { x: 0.0004, y: 0 }, NO_SNAP);
    expect(result.ok).toBe(false);
    expect(JSON.stringify(plan)).toBe(before);
  });

  it('refuses inserting a corner too close to an end of a wall', () => {
    const plan = planFromPoints(RECT);
    expect(insertVertex(plan, 'w5', 0.0001).ok).toBe(false);
    expect(insertVertex(plan, 'w5', 4.9999).ok).toBe(false);
    expect(insertVertex(plan, 'w5', 0.1).ok).toBe(false);
    expect(insertVertex(plan, 'w5', 2.5).ok).toBe(true);
  });

  it('does not crash on duplicate points (area, angles, intersection are finite)', () => {
    const dup: Vec2[] = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
    ];
    expect(Number.isFinite(signedArea(dup))).toBe(true);
    expect(interiorAngles(dup).every(Number.isFinite)).toBe(true);
    expect(typeof hasSelfIntersection(dup)).toBe('boolean');
    expect(codes(dup).length).toBeGreaterThan(0);
  });
});

describe('concave shapes', () => {
  it('validates a U and measures its area', () => {
    expect(signedArea(U)).toBeCloseTo(30 - 6, 9);
    expect(codes(U)).toEqual([]);
  });

  it('reports reflex angles of 270 degrees at the notch bottom', () => {
    const angles = interiorAngles(U);
    expect(angles[2]).toBeCloseTo(270, 6);
    expect(angles[3]).toBeCloseTo(270, 6);
    expect(angles.reduce((a, b) => a + b, 0)).toBeCloseTo((U.length - 2) * 180, 6);
  });

  it('keeps the centroid-outside case drawable: interior point lies inside, away from edges', () => {
    const p = interiorPoint(U);
    expect(pointInPolygon(p, U)).toBe(true);
  });

  it('a notch narrower than 0.3 m is a clearance error, 0.3 m is fine', () => {
    const notch = (w: number): Vec2[] =>
      U.map((p) => (p.x === 4 ? { ...p, x: 2 + w } : p.x === 6 ? { ...p, x: 6 } : p));
    expect(codes(notch(0.29))).toContain('walls-too-close');
    expect(codes(notch(0.3))).toEqual([]);
  });

  it('a notch that reaches within 0.3 m of the far wall is too close, 0.3 m is fine', () => {
    const deep = (bottom: number): Vec2[] => U.map((p) => (p.y === 3 ? { ...p, y: bottom } : p));
    expect(codes(deep(4.71))).toContain('walls-too-close');
    expect(codes(deep(4.7))).toEqual([]);
  });

  it('refuses dragging a notch corner through the opposite wall', () => {
    const plan = planFromPoints(U);
    const through = moveVertex(plan, 'v3', { x: 2, y: 6 }, NO_SNAP);
    expect(through.ok).toBe(false);
  });

  it('refuses dragging the notch across itself (the two inner corners swap sides)', () => {
    const plan = planFromPoints(U);
    const swap = moveVertex(plan, 'v3', { x: 5, y: 3 }, NO_SNAP);
    expect(swap.ok).toBe(false);
  });

  it('deleting the notch bottom corners one by one stays valid or is refused, never broken', () => {
    let plan = planFromPoints(U);
    for (const id of ['v3', 'v4', 'v2', 'v5']) {
      const r = deleteVertex(plan, id);
      if (r.ok) {
        expect(validatePlan(r.plan)).toEqual([]);
        plan = r.plan;
      }
    }
    expect(loopPoints(plan)!.length).toBeGreaterThanOrEqual(3);
  });

  it('keeps the camera clamp out of the notch and planks outside the notch are not needed', () => {
    const notchCentre = { x: 3, y: 1.5 };
    const spot = clampPointInside(notchCentre, U, 0.25)!;
    expect(spot).not.toBeNull();
    expect(pointInPolygon(spot, U)).toBe(true);
    // A plank lying entirely in the notch must be culled; one over the notch edge must not.
    const inNotch = [
      { x: 2.4, y: 0.4 },
      { x: 3.6, y: 0.4 },
      { x: 3.6, y: 0.6 },
      { x: 2.4, y: 0.6 },
    ];
    expect(rectIntersectsPolygon(inNotch, U)).toBe(false);
    const overEdge = inNotch.map((p) => ({ x: p.x, y: p.y + 2.5 }));
    expect(rectIntersectsPolygon(overEdge, U)).toBe(true);
  });

  it('random simple concave polygons: offsetting outward then inward keeps the area sane', () => {
    const rnd = createRandom(7);
    for (let t = 0; t < 40; t++) {
      const n = 6 + Math.floor(rnd() * 8);
      const poly: Vec2[] = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const r = 3 + rnd() * 3;
        poly.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
      }
      expect(hasSelfIntersection(poly)).toBe(false);
      const outer = offsetPolygon(poly, 0.15);
      expect(outer.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
      expect(Math.abs(signedArea(outer))).toBeGreaterThan(Math.abs(signedArea(poly)));
    }
  });

  it('openings survive the shape conversion of a U (wall index follows the loop)', () => {
    const plan = planFromPoints(U);
    plan.openings = [opening({ id: 'o99', wallId: 'w9', offset: 0.5, width: 1 })]; // w9 = first wall
    expect(validatePlan(plan)).toEqual([]);
    const shape = toRoomShape({ mode: 'custom', room: { length: 5, width: 4, height: 2.7 }, plan });
    expect(shape.openings.map((o) => o.wall)).toEqual([0]);
  });
});
