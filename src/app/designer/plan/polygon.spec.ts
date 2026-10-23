import { describe, expect, it } from 'vitest';
import { createRandom } from '../scene/random';
import {
  area,
  bbox,
  centroid,
  clampPointInside,
  closestPointOnSegment,
  distancePointSegment,
  distanceSegmentSegment,
  distanceToBoundary,
  ensurePositiveWinding,
  findCloseEdges,
  hasSelfIntersection,
  interiorAngles,
  interiorPoint,
  lineIntersection,
  minNonAdjacentDistance,
  offsetPolygon,
  orientedRect,
  perimeter,
  pointInPolygon,
  rectIntersectsPolygon,
  segmentsIntersect,
  signedArea,
  Vec2,
} from './polygon';

const p = (x: number, y: number): Vec2 => ({ x, y });
const SQUARE = [p(0, 0), p(2, 0), p(2, 2), p(0, 2)];
// L: 6 x 5 with a 3 x 2 notch cut from the bottom right. Area 24, positive winding.
const L = [p(0, 0), p(6, 0), p(6, 3), p(3, 3), p(3, 5), p(0, 5)];

describe('area and winding', () => {
  it('computes area for a square, an L and a triangle', () => {
    expect(signedArea(SQUARE)).toBe(4);
    expect(area(L)).toBe(24);
    expect(area([p(0, 0), p(4, 0), p(0, 3)])).toBe(6);
  });

  it('reports the sign of the winding and normalises it', () => {
    const reversed = [...SQUARE].reverse();
    expect(signedArea(reversed)).toBe(-4);
    expect(area(reversed)).toBe(4);
    expect(signedArea(ensurePositiveWinding(reversed))).toBe(4);
    const same = ensurePositiveWinding(SQUARE);
    expect(same).toEqual(SQUARE);
    expect(same).not.toBe(SQUARE);
  });

  it('is invariant to translation and start vertex', () => {
    const moved = L.map((q) => p(q.x + 100.5, q.y - 33.25));
    expect(area(moved)).toBeCloseTo(24, 9);
    expect(area([...L.slice(2), ...L.slice(0, 2)])).toBe(24);
  });

  it('handles degenerate input', () => {
    expect(signedArea([])).toBe(0);
    expect(signedArea([p(1, 1)])).toBe(0);
    expect(signedArea([p(0, 0), p(1, 1), p(2, 2)])).toBe(0);
  });
});

describe('perimeter, bbox, centroid', () => {
  it('sums the edges', () => {
    expect(perimeter(SQUARE)).toBe(8);
    expect(perimeter(L)).toBe(22);
  });

  it('bounds and centres', () => {
    const b = bbox(L);
    expect([b.minX, b.minY, b.maxX, b.maxY, b.width, b.height]).toEqual([0, 0, 6, 5, 6, 5]);
    expect(b.center).toEqual(p(3, 2.5));
    expect(bbox([]).width).toBe(0);
  });

  it('centroid of a square, and it can lie outside a concave polygon', () => {
    expect(centroid(SQUARE)).toEqual(p(1, 1));
    const u = [p(0, 0), p(9, 0), p(9, 9), p(6, 9), p(6, 3), p(3, 3), p(3, 9), p(0, 9)];
    expect(pointInPolygon(centroid(u), u)).toBe(false);
    expect(pointInPolygon(interiorPoint(u), u, 'outside')).toBe(true);
  });
});

describe('pointInPolygon', () => {
  it('classifies inside, outside and the L notch', () => {
    expect(pointInPolygon(p(1, 1), SQUARE)).toBe(true);
    expect(pointInPolygon(p(3, 1), SQUARE)).toBe(false);
    expect(pointInPolygon(p(4.5, 4), L)).toBe(false); // in the notch
    expect(pointInPolygon(p(1.5, 4), L)).toBe(true);
    expect(pointInPolygon(p(4.5, 1.5), L)).toBe(true);
  });

  it('applies the explicit boundary rule on edges and vertices', () => {
    for (const q of [p(1, 0), p(2, 1), p(0, 0), p(2, 2)]) {
      expect(pointInPolygon(q, SQUARE)).toBe(true);
      expect(pointInPolygon(q, SQUARE, 'inside')).toBe(true);
      expect(pointInPolygon(q, SQUARE, 'outside')).toBe(false);
    }
    expect(pointInPolygon(p(3, 4), L, 'outside')).toBe(false); // on the notch edge
    expect(pointInPolygon(p(3, 4), L)).toBe(true);
  });

  it('works for either winding', () => {
    expect(pointInPolygon(p(1, 1), [...SQUARE].reverse())).toBe(true);
  });
});

describe('segmentsIntersect', () => {
  const cases: Array<[string, Vec2[], boolean]> = [
    ['crossing', [p(0, 0), p(2, 2), p(0, 2), p(2, 0)], true],
    ['disjoint', [p(0, 0), p(1, 0), p(0, 1), p(1, 1)], false],
    ['parallel apart', [p(0, 0), p(2, 0), p(0, 1), p(2, 1)], false],
    ['collinear overlap', [p(0, 0), p(2, 0), p(1, 0), p(3, 0)], true],
    ['collinear disjoint', [p(0, 0), p(1, 0), p(2, 0), p(3, 0)], false],
    ['collinear touching ends', [p(0, 0), p(1, 0), p(1, 0), p(3, 0)], true],
    ['shared endpoint', [p(0, 0), p(1, 1), p(1, 1), p(2, 0)], true],
    ['T touch', [p(0, 0), p(2, 0), p(1, 0), p(1, 2)], true],
    ['near miss', [p(0, 0), p(2, 0), p(1, 0.001), p(1, 2)], false],
    ['vertical collinear', [p(0, 0), p(0, 2), p(0, 1), p(0, 5)], true],
    ['degenerate point on segment', [p(1, 0), p(1, 0), p(0, 0), p(2, 0)], true],
    ['degenerate point off segment', [p(1, 1), p(1, 1), p(0, 0), p(2, 0)], false],
  ];
  it.each(cases)('%s', (_name, [a, b, c, d], expected) => {
    expect(segmentsIntersect(a, b, c, d)).toBe(expected);
    expect(segmentsIntersect(c, d, a, b)).toBe(expected);
    expect(segmentsIntersect(b, a, d, c)).toBe(expected);
  });
});

describe('points, segments and lines', () => {
  it('finds the closest point and distance', () => {
    expect(closestPointOnSegment(p(1, 1), p(0, 0), p(2, 0))).toEqual(p(1, 0));
    expect(closestPointOnSegment(p(-1, 1), p(0, 0), p(2, 0))).toEqual(p(0, 0));
    expect(closestPointOnSegment(p(5, 1), p(0, 0), p(2, 0))).toEqual(p(2, 0));
    expect(closestPointOnSegment(p(5, 1), p(1, 1), p(1, 1))).toEqual(p(1, 1));
    expect(distancePointSegment(p(1, 3), p(0, 0), p(2, 0))).toBe(3);
  });

  it('measures segment to segment distance', () => {
    expect(distanceSegmentSegment(p(0, 0), p(2, 0), p(0, 1), p(2, 1))).toBe(1);
    expect(distanceSegmentSegment(p(0, 0), p(2, 2), p(0, 2), p(2, 0))).toBe(0);
    expect(distanceSegmentSegment(p(0, 0), p(1, 0), p(3, 4), p(3, 5))).toBe(Math.hypot(2, 4));
  });

  it('intersects infinite lines and reports parallels as null', () => {
    expect(lineIntersection(p(0, 0), p(1, 0), p(5, -3), p(5, 3))).toEqual(p(5, 0));
    expect(lineIntersection(p(0, 0), p(1, 0), p(0, 1), p(1, 1))).toBeNull();
    expect(lineIntersection(p(0, 0), p(1, 0), p(2, 0), p(3, 0))).toBeNull();
  });

  it('distanceToBoundary ignores the area', () => {
    expect(distanceToBoundary(p(1, 1), SQUARE)).toBe(1);
    expect(distanceToBoundary(p(5, 1), SQUARE)).toBe(3);
  });
});

describe('self-intersection', () => {
  it('accepts simple polygons, including 180 degree corners', () => {
    expect(hasSelfIntersection(SQUARE)).toBe(false);
    expect(hasSelfIntersection(L)).toBe(false);
    expect(hasSelfIntersection([p(0, 0), p(1, 0), p(2, 0), p(2, 2), p(0, 2)])).toBe(false);
    expect(hasSelfIntersection([p(0, 0), p(4, 0), p(0, 3)])).toBe(false);
  });

  it('detects a bow-tie', () => {
    expect(hasSelfIntersection([p(0, 0), p(2, 2), p(2, 0), p(0, 2)])).toBe(true);
  });

  it('detects a corner dragged across a wall', () => {
    const dragged = [p(0, 0), p(6, 0), p(6, 3), p(3, 3), p(3, -1), p(0, 5)];
    expect(hasSelfIntersection(dragged)).toBe(true);
  });

  it('detects touching walls and a vertex on a non-adjacent edge', () => {
    expect(hasSelfIntersection([p(0, 0), p(4, 0), p(4, 4), p(2, 0), p(0, 4)])).toBe(true);
  });

  it('detects an adjacent edge folded back onto the previous one', () => {
    expect(hasSelfIntersection([p(0, 0), p(4, 0), p(2, 0), p(2, 3)])).toBe(true);
  });

  it('rejects fewer than three points and zero-length edges', () => {
    expect(hasSelfIntersection([p(0, 0), p(1, 1)])).toBe(true);
    expect(hasSelfIntersection([p(0, 0), p(0, 0), p(1, 0), p(0, 1)])).toBe(true);
  });

  it('measures and finds close non-adjacent edges', () => {
    expect(minNonAdjacentDistance(SQUARE)).toBe(2);
    expect(minNonAdjacentDistance([p(0, 0), p(1, 0), p(0, 1)])).toBe(Infinity);
    const slim = [p(0, 0), p(5, 0), p(5, 0.2), p(0, 0.2)];
    expect(minNonAdjacentDistance(slim)).toBeCloseTo(0.2, 10);
    expect(findCloseEdges(slim, 0.3)).toEqual([0, 2]);
    expect(findCloseEdges(SQUARE, 0.3)).toBeNull();
  });

  it('flags no random star-shaped (simple) polygon, and agrees with a brute-force oracle', () => {
    const rnd = createRandom(7);
    for (let k = 0; k < 100; k++) {
      const n = 3 + Math.floor(rnd() * 10);
      const pts = Array.from({ length: n }, (_, i) => {
        const a = ((i + 0.2 + rnd() * 0.6) / n) * Math.PI * 2;
        const r = 1 + rnd() * 4;
        return p(Math.cos(a) * r, Math.sin(a) * r);
      });
      expect(hasSelfIntersection(pts)).toBe(false);
      const swapped = [...pts];
      [swapped[0], swapped[2]] = [swapped[2], swapped[0]];
      let crossing = false;
      const m = swapped.length;
      for (let i = 0; i < m && !crossing; i++) {
        for (let j = i + 2; j < m && !crossing; j++) {
          if (i === 0 && j === m - 1) continue;
          crossing = segmentsIntersect(
            swapped[i],
            swapped[(i + 1) % m],
            swapped[j],
            swapped[(j + 1) % m],
          );
        }
      }
      if (crossing) {
        expect(hasSelfIntersection(swapped)).toBe(true);
      }
    }
  });
});

describe('interiorAngles', () => {
  it('gives 90 for a square and handles reflex and straight corners', () => {
    expect(interiorAngles(SQUARE).map(Math.round)).toEqual([90, 90, 90, 90]);
    expect(interiorAngles(L).map(Math.round)).toEqual([90, 90, 90, 270, 90, 90]);
    expect(Math.round(interiorAngles([p(0, 0), p(1, 0), p(2, 0), p(2, 2), p(0, 2)])[1])).toBe(180);
  });

  it('is independent of the winding and sums to (n - 2) x 180', () => {
    const sum = (a: number[]): number => a.reduce((s, v) => s + v, 0);
    expect(sum(interiorAngles([...L].reverse()))).toBeCloseTo(4 * 180, 9);
    expect(sum(interiorAngles(L))).toBeCloseTo(4 * 180, 9);
    expect(interiorAngles([p(0, 0), p(4, 0), p(0, 3)])[1]).toBeCloseTo(36.87, 2);
  });
});

describe('offsetPolygon', () => {
  it('grows a square outward and shrinks it inward', () => {
    expect(offsetPolygon(SQUARE, 0.5)).toEqual([
      p(-0.5, -0.5),
      p(2.5, -0.5),
      p(2.5, 2.5),
      p(-0.5, 2.5),
    ]);
    expect(area(offsetPolygon(SQUARE, -0.5))).toBeCloseTo(1, 9);
  });

  it('offsets outward for either winding', () => {
    expect(area(offsetPolygon([...SQUARE].reverse(), 0.5))).toBeCloseTo(9, 9);
  });

  it('handles reflex corners: edges stay parallel and 0.15 away', () => {
    const out = offsetPolygon(L, 0.15);
    for (let i = 0; i < L.length; i++) {
      const j = (i + 1) % L.length;
      const dx = out[j].x - out[i].x;
      const dy = out[j].y - out[i].y;
      expect(dx * (L[j].y - L[i].y) - dy * (L[j].x - L[i].x)).toBeCloseTo(0, 9); // parallel
      expect(distancePointSegment(out[i], L[i], L[j])).toBeGreaterThan(0.1);
    }
    expect(out[3].x).toBeCloseTo(3.15, 9); // the reflex corner moves diagonally outward
    expect(out[3].y).toBeCloseTo(3.15, 9);
    // 24 + perimeter x d + (convex - reflex corners) x d^2 = 24 + 22 x 0.15 + 4 x 0.0225
    expect(area(out)).toBeCloseTo(24 + 22 * 0.15 + 4 * 0.15 * 0.15, 9);
  });

  it('moves a straight (180 degree) vertex along the normal', () => {
    const out = offsetPolygon([p(0, 0), p(1, 0), p(2, 0), p(2, 2), p(0, 2)], 0.1);
    expect(out[1].x).toBeCloseTo(1, 9);
    expect(out[1].y).toBeCloseTo(-0.1, 9);
  });

  it('puts the apex of a 30 degree corner at distance / sin(15 degrees)', () => {
    const wedge = [p(0, 0), p(5, 0), p(5 * Math.cos(Math.PI / 6), 5 * Math.sin(Math.PI / 6))];
    // This wedge is negatively wound (y down); offsetting is winding independent.
    const out = offsetPolygon(wedge, 0.1);
    const miter = Math.hypot(out[0].x - wedge[0].x, out[0].y - wedge[0].y);
    expect(miter).toBeCloseTo(0.1 / Math.sin(Math.PI / 12), 6);
    expect(miter).toBeLessThanOrEqual(0.4 + 1e-9);
  });

  it('caps absurdly sharp corners', () => {
    const needle = [p(0, 0), p(10, 0.05), p(10, 0)];
    const out = offsetPolygon(needle, 0.1);
    for (let i = 0; i < 3; i++) {
      const moved = Math.hypot(out[i].x - needle[i].x, out[i].y - needle[i].y);
      expect(moved).toBeLessThanOrEqual(0.4 + 1e-9);
    }
  });
});

describe('rectIntersectsPolygon', () => {
  const rect = (cx: number, cy: number, hx = 0.3, hy = 0.05, angle = 0): Vec2[] =>
    orientedRect(cx, cy, hx, hy, angle);

  it('builds oriented rectangles', () => {
    const r = orientedRect(0, 0, 1, 0.5, Math.PI / 2);
    expect(r[0].x).toBeCloseTo(0.5, 9);
    expect(r[0].y).toBeCloseTo(-1, 9);
    expect(area(r)).toBeCloseTo(2, 9);
  });

  it('plank fully inside', () => {
    expect(rectIntersectsPolygon(rect(1, 1), SQUARE)).toBe(true);
  });

  it('plank crossing an edge', () => {
    expect(rectIntersectsPolygon(rect(2, 1), SQUARE)).toBe(true);
    expect(rectIntersectsPolygon(rect(1, 1, 0.3, 0.05, Math.PI / 4), SQUARE)).toBe(true);
  });

  it('plank fully outside', () => {
    expect(rectIntersectsPolygon(rect(5, 5), SQUARE)).toBe(false);
    expect(rectIntersectsPolygon(rect(2.5, 1), SQUARE)).toBe(false);
  });

  it('plank fully outside inside the bbox of a concave notch', () => {
    expect(rectIntersectsPolygon(rect(4.5, 4), L)).toBe(false);
    expect(rectIntersectsPolygon(rect(4.5, 3.0), L)).toBe(true); // on the notch roof edge
  });

  it('plank around a polygon vertex and a plank containing a whole polygon', () => {
    expect(rectIntersectsPolygon(rect(0, 0, 0.5, 0.5), SQUARE)).toBe(true);
    const tiny = [p(1, 1), p(1.1, 1), p(1.1, 1.1)];
    expect(rectIntersectsPolygon(rect(1.05, 1.05, 1, 1), tiny)).toBe(true);
  });

  it('plank crossing a polygon with no corner of either inside the other', () => {
    const slim = [p(0, 0), p(0.1, 0), p(0.1, 4), p(0, 4)];
    expect(rectIntersectsPolygon(rect(0.05, 2, 0.05, 1, 0), slim)).toBe(true);
    const cross = orientedRect(0.05, 2, 1, 0.05, 0);
    expect(rectIntersectsPolygon(cross, slim)).toBe(true);
  });

  it('never misses an overlap found by dense sampling on random planks in the L', () => {
    const rnd = createRandom(11);
    for (let k = 0; k < 300; k++) {
      const r = rect(
        rnd() * 8 - 1,
        rnd() * 7 - 1,
        0.1 + rnd() * 0.5,
        0.05 + rnd() * 0.1,
        rnd() * Math.PI,
      );
      let sampled = false;
      for (let i = 0; i <= 12 && !sampled; i++) {
        for (let j = 0; j <= 12 && !sampled; j++) {
          const u = i / 12;
          const v = j / 12;
          sampled = pointInPolygon(
            p(
              r[0].x + (r[1].x - r[0].x) * u + (r[3].x - r[0].x) * v,
              r[0].y + (r[1].y - r[0].y) * u + (r[3].y - r[0].y) * v,
            ),
            L,
          );
        }
      }
      if (sampled) {
        expect(rectIntersectsPolygon(r, L)).toBe(true);
      }
    }
  });
});

describe('clampPointInside', () => {
  it('keeps a point that is already inside by the margin', () => {
    const q = p(1, 1);
    expect(clampPointInside(q, SQUARE, 0.25)).toBe(q);
  });

  it('pulls an outside point and an edge-hugging point in', () => {
    const out = clampPointInside(p(5, 1), SQUARE, 0.25)!;
    expect(out.x).toBeCloseTo(1.75, 9);
    expect(out.y).toBeCloseTo(1, 9);
    const near = clampPointInside(p(0.05, 1), SQUARE, 0.25)!;
    expect(near.x).toBeCloseTo(0.25, 9);
  });

  it('handles corners', () => {
    const c = clampPointInside(p(-3, -3), SQUARE, 0.25)!;
    expect(pointInPolygon(c, SQUARE)).toBe(true);
    expect(distanceToBoundary(c, SQUARE)).toBeGreaterThanOrEqual(0.25 - 1e-6);
  });

  it('stays out of the L notch', () => {
    for (const q of [p(4.5, 4), p(4.5, 3.05), p(3.05, 4.9), p(3, 4), p(9, 9), p(-2, 6)]) {
      const c = clampPointInside(q, L, 0.25)!;
      expect(c).not.toBeNull();
      expect(pointInPolygon(c, L, 'outside')).toBe(true);
      expect(distanceToBoundary(c, L)).toBeGreaterThanOrEqual(0.25 - 1e-6);
    }
  });

  it('returns null when nothing fits (a narrow room)', () => {
    const narrow = [p(0, 0), p(4, 0), p(4, 0.4), p(0, 0.4)];
    expect(clampPointInside(p(2, 0.2), narrow, 0.25)).toBeNull();
  });

  it('always lands inside for random points around an L', () => {
    const rnd = createRandom(3);
    for (let k = 0; k < 200; k++) {
      const c = clampPointInside(p(rnd() * 14 - 4, rnd() * 14 - 4), L, 0.25);
      expect(c).not.toBeNull();
      expect(distanceToBoundary(c!, L)).toBeGreaterThanOrEqual(0.25 - 1e-6);
      expect(pointInPolygon(c!, L, 'outside')).toBe(true);
    }
  });
});

describe('interiorPoint', () => {
  it('is the middle of a square and inside an L, away from the edges', () => {
    const s = interiorPoint(SQUARE);
    expect(s.x).toBeCloseTo(1, 6);
    expect(s.y).toBeCloseTo(1, 6);
    const q = interiorPoint(L);
    expect(pointInPolygon(q, L, 'outside')).toBe(true);
    expect(distanceToBoundary(q, L)).toBeGreaterThan(1.2);
  });

  it('is inside a U where the centroid is outside', () => {
    const u = [p(0, 0), p(9, 0), p(9, 9), p(6, 9), p(6, 3), p(3, 3), p(3, 9), p(0, 9)];
    expect(distanceToBoundary(interiorPoint(u), u)).toBeGreaterThan(1);
  });
});
