import { describe, expect, it } from 'vitest';
import { L_SHAPE } from '../plan/plan-fixtures';
import { pointInPolygon, rectIntersectsPolygon, orientedRect, bbox, Vec2 } from '../plan/polygon';
import { PatternBounds, PatternParams, PlankPlacement } from './pattern';
import { herringbone } from './herringbone';

interface Rect {
  length: number;
  width: number;
}

const rectOutline = (r: Rect): Vec2[] => [
  { x: -r.length / 2, y: -r.width / 2 },
  { x: r.length / 2, y: -r.width / 2 },
  { x: r.length / 2, y: r.width / 2 },
  { x: -r.length / 2, y: r.width / 2 },
];
const bounds: Rect = { length: 5, width: 4 };
const generate = (p: PatternParams, r: Rect | PatternBounds): PlankPlacement[] =>
  herringbone.generate(p, 'outline' in r ? r : { outline: rectOutline(r) });
const params = (angle: number, l = 600, w = 100, n = 1): PatternParams => ({
  plankLength: l,
  plankWidth: w,
  planksPerBlock: n,
  angle,
});

/** Does the plank contain the point (strictly inside, in its own frame)? */
function contains(p: PlankPlacement, x: number, z: number, eps = 0): boolean {
  const dx = x - p.x;
  const dz = z - p.z;
  const along = dx * Math.cos(p.rotation) + dz * Math.sin(p.rotation);
  const across = -dx * Math.sin(p.rotation) + dz * Math.cos(p.rotation);
  return Math.abs(along) < p.length / 2 - eps && Math.abs(across) < p.width / 2 - eps;
}

function samplePoints(b: Rect, n: number): [number, number][] {
  const points: [number, number][] = [];
  for (let a = 0; a < n; a++) {
    for (let c = 0; c < n; c++) {
      // Irrational-ish offsets avoid landing exactly on plank edges.
      points.push([
        ((a + 0.37) / n - 0.5) * b.length * 0.999,
        ((c + 0.61) / n - 0.5) * b.width * 0.999,
      ]);
    }
  }
  return points;
}

describe('herringbone', () => {
  it('declares its angle range', () => {
    expect(herringbone.id).toBe('herringbone');
    expect(herringbone.angleRange).toEqual({ min: 0, max: 179 });
  });

  it('plank count is close to area / plank area', () => {
    const planks = generate(params(0), bounds);
    const ideal = (5 * 4) / (0.6 * 0.1);
    expect(planks.length).toBeGreaterThanOrEqual(ideal);
    // Edge planks add at most about one plank length of margin around the perimeter.
    const upper = (5 * 4 + 2 * (5 + 4) * 0.6) / (0.6 * 0.1);
    expect(planks.length).toBeLessThanOrEqual(upper);
  });

  it('count scales with room area', () => {
    const small = generate(params(0), { length: 3, width: 3 }).length;
    const big = generate(params(0), { length: 6, width: 6 }).length;
    expect(big / small).toBeGreaterThan(3);
    expect(big / small).toBeLessThan(5);
  });

  for (const angle of [0, 1, 17, 45, 90, 134, 179]) {
    it(`covers the room exactly once at ${angle} degrees`, () => {
      const planks = generate(params(angle), bounds);
      for (const [x, z] of samplePoints(bounds, 30)) {
        const hits = planks.filter((p) => contains(p, x, z)).length;
        expect(hits, `point ${x.toFixed(3)}, ${z.toFixed(3)}`).toBe(1);
      }
    });
  }

  it('covers non-integer length to width ratios', () => {
    const planks = generate(params(23, 555, 85), { length: 4.3, width: 3.1 });
    for (const [x, z] of samplePoints({ length: 4.3, width: 3.1 }, 25)) {
      expect(planks.filter((p) => contains(p, x, z)).length).toBe(1);
    }
  });

  it('keeps every plank touching the room and none far outside', () => {
    for (const angle of [0, 30, 100]) {
      const planks = generate(params(angle), bounds);
      for (const p of planks) {
        // Centre within the room grown by the plank's half diagonal.
        const reach = Math.hypot(p.length, p.width) / 2;
        expect(Math.abs(p.x)).toBeLessThanOrEqual(bounds.length / 2 + reach);
        expect(Math.abs(p.z)).toBeLessThanOrEqual(bounds.width / 2 + reach);
        expect(p.length).toBeCloseTo(0.6, 10);
        expect(p.width).toBeCloseTo(0.1, 10);
      }
    }
  });

  it('culls planks that do not touch the room', () => {
    const planks = generate(params(0), bounds);
    const far = planks.filter((p) => {
      const reach = Math.hypot(p.length, p.width) / 2;
      return Math.abs(p.x) > bounds.length / 2 + reach || Math.abs(p.z) > bounds.width / 2 + reach;
    });
    expect(far).toHaveLength(0);
  });

  it('is deterministic', () => {
    const a = generate(params(37), bounds);
    const b = generate(params(37), bounds);
    expect(a).toEqual(b);
  });

  it('wraps angles into 0-179 (180 equals 0)', () => {
    const a = generate(params(0), bounds);
    const b = generate(params(180), bounds);
    expect(b.length).toBe(a.length);
    expect(b[0]).toEqual(a[0]);
  });

  it('angle 0 puts plank axes at 45 degrees to the room length', () => {
    const planks = generate(params(0), bounds);
    for (const p of planks.slice(0, 50)) {
      const folded = Math.abs(Math.sin(p.rotation * 2));
      expect(folded).toBeCloseTo(1, 6);
    }
  });

  it('gives distinct, angle-independent seeds per lattice position', () => {
    const planks = generate(params(0), bounds);
    const seeds = new Set(planks.map((p) => p.seed));
    expect(seeds.size).toBe(planks.length);
  });

  it('handles worst-case sizes in reasonable counts', () => {
    const planks = generate(params(77, 300, 50), { length: 12, width: 12 });
    expect(planks.length).toBeGreaterThan(9000);
    expect(planks.length).toBeLessThan(13000);
  });

  it('returns nothing for invalid input', () => {
    expect(generate(params(0, 0, 100), bounds)).toEqual([]);
    expect(generate(params(NaN), bounds)).toEqual([]);
    expect(generate(params(0), { length: 0, width: 4 })).toEqual([]);
  });

  it('covers the smallest room with the longest, widest planks', () => {
    const b: Rect = { length: 2, width: 2 };
    const planks = generate(params(63, 2400, 200), b);
    expect(planks.length).toBeGreaterThan(0);
    for (const [x, z] of samplePoints(b, 20)) {
      expect(planks.filter((p) => contains(p, x, z)).length).toBe(1);
    }
  });

  it('covers the largest room with the smallest planks at a skew angle', () => {
    const b: Rect = { length: 12, width: 12 };
    const planks = generate(params(179, 300, 50), b);
    expect(planks.length).toBeLessThan(14000);
    for (const [x, z] of samplePoints(b, 12)) {
      expect(planks.filter((p) => contains(p, x, z)).length).toBe(1);
    }
  });

  it('works at the minimum length to width ratio of 2', () => {
    const planks = generate(params(10, 300, 150), bounds);
    for (const [x, z] of samplePoints(bounds, 20)) {
      expect(planks.filter((p) => contains(p, x, z)).length).toBe(1);
    }
  });

  describe('planks per block', () => {
    for (const n of [2, 4, 10]) {
      for (const angle of [0, 17, 45, 134]) {
        it(`covers the room exactly once with ${n} strips at ${angle} degrees`, () => {
          const length = Math.max(600, 2 * n * 40);
          const planks = generate(params(angle, length, 40, n), bounds);
          for (const [x, z] of samplePoints(bounds, 30)) {
            const hits = planks.filter((p) => contains(p, x, z)).length;
            expect(hits, `point ${x.toFixed(3)}, ${z.toFixed(3)}`).toBe(1);
          }
        });
      }
    }

    it('emits strips of the single plank size, with distinct seeds', () => {
      const planks = generate(params(30, 600, 60, 4), bounds);
      for (const p of planks) {
        expect(p.length).toBeCloseTo(0.6, 10);
        expect(p.width).toBeCloseTo(0.06, 10);
      }
      expect(new Set(planks.map((p) => p.seed)).size).toBe(planks.length);
    });

    it('is deterministic', () => {
      expect(generate(params(37, 600, 50, 4), bounds)).toEqual(
        generate(params(37, 600, 50, 4), bounds),
      );
    });

    it('keeps the plank count about area / plank area whatever the strips', () => {
      const counts = [1, 2, 4, 10].map(
        (n) => generate(params(20, 800, 40, n), { length: 8, width: 8 }).length,
      );
      const ideal = 64 / (0.8 * 0.04);
      for (const c of counts) {
        expect(c).toBeGreaterThanOrEqual(ideal);
        expect(c).toBeLessThan(ideal * 1.4);
      }
    });

    it('treats a missing planksPerBlock as 1', () => {
      const { planksPerBlock: _omit, ...rest } = params(10);
      expect(generate(rest, bounds)).toEqual(generate(params(10), bounds));
    });
  });

  it('returns nothing for negative or infinite sizes', () => {
    expect(generate(params(0, 600, -1), bounds)).toEqual([]);
    expect(generate(params(0), { length: Infinity, width: 4 })).toEqual([]);
  });

  describe('polygon outlines', () => {
    const c = bbox(L_SHAPE).center;
    const lShape: PatternBounds = {
      outline: L_SHAPE.map((p) => ({ x: p.x - c.x, y: p.y - c.y })),
    };
    const lSamples = (n: number): [number, number][] => {
      const b = bbox(lShape.outline);
      const out: [number, number][] = [];
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const q = {
            x: b.minX + ((i + 0.37) / n) * b.width,
            y: b.minY + ((j + 0.61) / n) * b.height,
          };
          if (pointInPolygon(q, lShape.outline)) out.push([q.x, q.y]);
        }
      }
      return out;
    };

    for (const angle of [0, 17, 45, 90, 133]) {
      it(`covers an L-shape exactly once at ${angle} degrees`, () => {
        const planks = generate(params(angle), lShape);
        for (const [x, z] of lSamples(40)) {
          expect(planks.filter((p) => contains(p, x, z)).length, `${x}, ${z}`).toBe(1);
        }
      });

      it(`emits no plank fully outside the L at ${angle} degrees`, () => {
        const planks = generate(params(angle), lShape);
        const outside = planks.filter(
          (p) =>
            !rectIntersectsPolygon(
              orientedRect(p.x, p.z, p.length / 2, p.width / 2, p.rotation),
              lShape.outline,
            ),
        );
        expect(outside).toHaveLength(0);
      });
    }

    it('emits fewer planks than the bounding box would need', () => {
      const b = bbox(lShape.outline);
      const full = generate(params(0), { length: b.width, width: b.height }).length;
      expect(generate(params(0), lShape).length).toBeLessThan(full * 0.9);
    });

    it('stays fast at the 144 m2 cap with the smallest planks', () => {
      // 12 x 12 square: the same plank count as an L-shape of 144 m2.
      const start = performance.now();
      const planks = generate(params(41, 300, 40), { length: 12, width: 12 });
      const ms = performance.now() - start;
      expect(planks.length).toBeGreaterThan(10000);
      expect(ms).toBeLessThan(200);
    });

    it('returns nothing for a degenerate outline', () => {
      expect(generate(params(0), { outline: [] })).toEqual([]);
      expect(
        generate(params(0), {
          outline: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
            { x: 2, y: 2 },
          ],
        }),
      ).toEqual([]);
    });
  });
});
