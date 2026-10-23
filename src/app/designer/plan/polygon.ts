// 2D polygon geometry (plan C8). Own code, no dependency, three-free.
//
// CONTRACT FILE. Frozen for parallel tracks: change only through the main session.
//
// Polygons are arrays of points without a repeated closing point. Edge i runs from p[i] to
// p[i + 1] (wrapping). "Positive winding" means a positive shoelace area (clockwise on screen with
// y down). Outward normal of the edge a -> b of a positively wound polygon is normalize(dy, -dx).

import { Vec2 } from './plan-model';

export type { Vec2 };

/** Distances and orientation tests below this (metres) count as zero. */
export const GEOMETRY_EPS = 1e-9;

// ---- vector helpers --------------------------------------------------------------------------

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, y: a.y * k });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
export const length = (a: Vec2): number => Math.hypot(a.x, a.y);
export const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Unit vector, or (0, 0) for a zero vector. */
export function normalize(a: Vec2): Vec2 {
  const l = Math.hypot(a.x, a.y);
  return l > 0 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 };
}

/** Twice the signed area of triangle abc (positive for a left turn in a y-up frame). */
export const orient = (a: Vec2, b: Vec2, c: Vec2): number => cross(sub(b, a), sub(c, a));

// ---- area, winding, bounds -------------------------------------------------------------------

/** Shoelace area: positive for positive winding. */
export function signedArea(poly: readonly Vec2[]): number {
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

export function area(poly: readonly Vec2[]): number {
  return Math.abs(signedArea(poly));
}

/** The same polygon with positive winding (a reversed copy when it was negative). */
export function ensurePositiveWinding(poly: readonly Vec2[]): Vec2[] {
  return signedArea(poly) < 0 ? [...poly].reverse() : [...poly];
}

export function perimeter(poly: readonly Vec2[]): number {
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    sum += distance(poly[i], poly[(i + 1) % poly.length]);
  }
  return sum;
}

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  center: Vec2;
}

export function bbox(poly: readonly Vec2[]): BBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  if (poly.length === 0) {
    minX = minY = maxX = maxY = 0;
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
  };
}

/** Area centroid (may lie outside a concave polygon). Falls back to the vertex mean if degenerate. */
export function centroid(poly: readonly Vec2[]): Vec2 {
  const a = signedArea(poly);
  if (Math.abs(a) < GEOMETRY_EPS) {
    const n = Math.max(1, poly.length);
    return {
      x: poly.reduce((s, p) => s + p.x, 0) / n,
      y: poly.reduce((s, p) => s + p.y, 0) / n,
    };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const w = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * w;
    cy += (p.y + q.y) * w;
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

/** Outward unit normal of edge a -> b for a positively wound polygon. */
export function outwardNormal(a: Vec2, b: Vec2): Vec2 {
  return normalize({ x: b.y - a.y, y: -(b.x - a.x) });
}

// ---- points and segments ---------------------------------------------------------------------

export function closestPointOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const ab = sub(b, a);
  const len2 = dot(ab, ab);
  if (len2 === 0) {
    return { x: a.x, y: a.y };
  }
  const t = Math.min(1, Math.max(0, dot(sub(p, a), ab) / len2));
  return { x: a.x + ab.x * t, y: a.y + ab.y * t };
}

export function distancePointSegment(p: Vec2, a: Vec2, b: Vec2): number {
  return distance(p, closestPointOnSegment(p, a, b));
}

/** True when p lies on segment ab (within GEOMETRY_EPS). */
export function pointOnSegment(p: Vec2, a: Vec2, b: Vec2): boolean {
  return distancePointSegment(p, a, b) <= GEOMETRY_EPS;
}

/** Does segment ab touch or cross segment cd? Includes collinear overlap and touching endpoints. */
export function segmentsIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const d1 = orient(c, d, a);
  const d2 = orient(c, d, b);
  const d3 = orient(a, b, c);
  const d4 = orient(a, b, d);
  if (
    ((d1 > GEOMETRY_EPS && d2 < -GEOMETRY_EPS) || (d1 < -GEOMETRY_EPS && d2 > GEOMETRY_EPS)) &&
    ((d3 > GEOMETRY_EPS && d4 < -GEOMETRY_EPS) || (d3 < -GEOMETRY_EPS && d4 > GEOMETRY_EPS))
  ) {
    return true;
  }
  return (
    pointOnSegment(a, c, d) ||
    pointOnSegment(b, c, d) ||
    pointOnSegment(c, a, b) ||
    pointOnSegment(d, a, b)
  );
}

/** Shortest distance between two segments (0 when they touch or cross). */
export function distanceSegmentSegment(a: Vec2, b: Vec2, c: Vec2, d: Vec2): number {
  if (segmentsIntersect(a, b, c, d)) {
    return 0;
  }
  return Math.min(
    distancePointSegment(a, c, d),
    distancePointSegment(b, c, d),
    distancePointSegment(c, a, b),
    distancePointSegment(d, a, b),
  );
}

/**
 * Intersection of the infinite lines through (a, b) and (c, d), or null when parallel
 * (including collinear).
 */
export function lineIntersection(a: Vec2, b: Vec2, c: Vec2, d: Vec2): Vec2 | null {
  const r = sub(b, a);
  const s = sub(d, c);
  const denom = cross(r, s);
  if (Math.abs(denom) < GEOMETRY_EPS) {
    return null;
  }
  const t = cross(sub(c, a), s) / denom;
  return { x: a.x + r.x * t, y: a.y + r.y * t };
}

// ---- polygon queries -------------------------------------------------------------------------

/** Shortest distance from p to the polygon outline (the edges, not the area). */
export function distanceToBoundary(p: Vec2, poly: readonly Vec2[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    best = Math.min(best, distancePointSegment(p, poly[i], poly[(i + 1) % poly.length]));
  }
  return best;
}

/**
 * Even-odd point in polygon. A point ON an edge or vertex (within GEOMETRY_EPS) counts as inside
 * by default; pass `boundary = 'outside'` to count it as outside.
 */
export function pointInPolygon(
  p: Vec2,
  poly: readonly Vec2[],
  boundary: 'inside' | 'outside' = 'inside',
): boolean {
  const n = poly.length;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = poly[j];
    const b = poly[i];
    if (pointOnSegment(p, a, b)) {
      return boundary === 'inside';
    }
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

function adjacentEdges(i: number, j: number, n: number): boolean {
  return j === i + 1 || (i === 0 && j === n - 1);
}

/**
 * True when the outline is not a simple polygon: fewer than 3 points, a zero-length edge, two
 * non-adjacent edges that touch or cross, or two adjacent edges folded back onto each other
 * (collinear overlap). Adjacent edges meeting at a normal corner or at 180 degrees are fine.
 */
export function hasSelfIntersection(poly: readonly Vec2[]): boolean {
  const n = poly.length;
  if (n < 3) {
    return true;
  }
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    if (distance(a, b) <= GEOMETRY_EPS) {
      return true;
    }
    for (let j = i + 1; j < n; j++) {
      const c = poly[j];
      const d = poly[(j + 1) % n];
      if (adjacentEdges(i, j, n)) {
        // Shared vertex s; the other ends are p and q. Folded back if both lie on one ray from s.
        const s = j === i + 1 ? b : a;
        const p = j === i + 1 ? a : b;
        const q = j === i + 1 ? d : c;
        const u = sub(p, s);
        const v = sub(q, s);
        const sin = Math.abs(cross(u, v)) / (length(u) * length(v) || 1);
        if (sin < 1e-9 && dot(u, v) > 0) {
          return true;
        }
      } else if (segmentsIntersect(a, b, c, d)) {
        return true;
      }
    }
  }
  return false;
}

/** First pair of non-adjacent edges (indices i < j) closer than `limit`, or null. */
export function findCloseEdges(poly: readonly Vec2[], limit: number): [number, number] | null {
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (
        !adjacentEdges(i, j, n) &&
        distanceSegmentSegment(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n]) < limit
      ) {
        return [i, j];
      }
    }
  }
  return null;
}

/** Smallest distance between any two non-adjacent edges (Infinity for a triangle). */
export function minNonAdjacentDistance(poly: readonly Vec2[]): number {
  const n = poly.length;
  let best = Infinity;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (adjacentEdges(i, j, n)) {
        continue;
      }
      best = Math.min(
        best,
        distanceSegmentSegment(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n]),
      );
    }
  }
  return best;
}

/**
 * Interior angle in degrees at every vertex (0..360): 90 for a rectangle corner, above 180 at a
 * reflex corner, 180 on a straight run. Independent of the winding direction.
 */
export function interiorAngles(poly: readonly Vec2[]): number[] {
  const n = poly.length;
  const sign = signedArea(poly) < 0 ? -1 : 1;
  const angles: number[] = [];
  for (let i = 0; i < n; i++) {
    const d1 = sub(poly[i], poly[(i - 1 + n) % n]);
    const d2 = sub(poly[(i + 1) % n], poly[i]);
    const turn = Math.atan2(sign * cross(d1, d2), dot(d1, d2));
    angles.push(180 - (turn * 180) / Math.PI);
  }
  return angles;
}

// ---- offsetting ------------------------------------------------------------------------------

/** Longest miter, as a multiple of the offset distance (a 30 degree corner needs about 3.9). */
export const MITER_LIMIT = 4;

/**
 * Miter offset. A positive `distance` moves every edge outward (for either winding), a negative
 * one inward. Used for the outer wall face and the skirting inset. Straight (180 degree) vertices
 * simply move along the normal; absurdly sharp ones are capped at MITER_LIMIT.
 */
export function offsetPolygon(poly: readonly Vec2[], distance: number): Vec2[] {
  const n = poly.length;
  const sign = signedArea(poly) < 0 ? -1 : 1;
  const normals = poly.map((a, i) => {
    const nm = outwardNormal(a, poly[(i + 1) % n]);
    return { x: nm.x * sign, y: nm.y * sign };
  });
  return poly.map((p, i) => {
    const n1 = normals[(i - 1 + n) % n];
    const n2 = normals[i];
    const denom = 1 + dot(n1, n2);
    let move: Vec2;
    if (denom < 1e-6) {
      move = scale(n1, distance);
    } else {
      move = scale(add(n1, n2), distance / denom);
      const max = Math.abs(distance) * MITER_LIMIT;
      const len = length(move);
      if (len > max) {
        move = scale(move, max / len);
      }
    }
    return add(p, move);
  });
}

// ---- rectangles (planks) ---------------------------------------------------------------------

/** Corners of a rectangle with half sizes (hx along `angle`, hy across), rotated about its centre. */
export function orientedRect(
  cx: number,
  cy: number,
  hx: number,
  hy: number,
  angle: number,
): Vec2[] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [
    [-hx, -hy],
    [hx, -hy],
    [hx, hy],
    [-hx, hy],
  ].map(([x, y]) => ({ x: cx + x * c - y * s, y: cy + x * s + y * c }));
}

/**
 * Does the convex rectangle (4 corners, e.g. from `orientedRect`) overlap the polygon area?
 * Touching counts. Handles a rectangle inside, crossing, around a polygon vertex, or fully outside
 * a concave notch.
 */
export function rectIntersectsPolygon(rect: readonly Vec2[], poly: readonly Vec2[]): boolean {
  const rb = bbox(rect);
  const pb = bbox(poly);
  if (rb.maxX < pb.minX || rb.minX > pb.maxX || rb.maxY < pb.minY || rb.minY > pb.maxY) {
    return false;
  }
  if (rect.some((c) => pointInPolygon(c, poly))) {
    return true;
  }
  if (poly.some((v) => pointInPolygon(v, rect))) {
    return true;
  }
  for (let i = 0; i < rect.length; i++) {
    const a = rect[i];
    const b = rect[(i + 1) % rect.length];
    for (let j = 0; j < poly.length; j++) {
      if (segmentsIntersect(a, b, poly[j], poly[(j + 1) % poly.length])) {
        return true;
      }
    }
  }
  return false;
}

// ---- camera / label helpers ------------------------------------------------------------------

/** Signed distance to the outline: positive inside, negative outside. */
function signedDistance(p: Vec2, poly: readonly Vec2[]): number {
  const d = distanceToBoundary(p, poly);
  return pointInPolygon(p, poly) ? d : -d;
}

/**
 * Move p inside the polygon, at least `margin` from every edge. Returns p itself when it already
 * qualifies, the nearest qualifying point found by pushing away from the closest boundary point
 * (iterated, so corners work), or null when none is found (a very narrow notch): the caller then
 * keeps the last valid position.
 */
export function clampPointInside(p: Vec2, poly: readonly Vec2[], margin: number): Vec2 | null {
  const ok = (q: Vec2): boolean => signedDistance(q, poly) >= margin - 1e-6;
  if (ok(p)) {
    return p;
  }
  const n = poly.length;
  const sign = signedArea(poly) < 0 ? -1 : 1;
  let cur = p;
  for (let iter = 0; iter < 8; iter++) {
    let best = Infinity;
    let q = cur;
    let edge = 0;
    for (let i = 0; i < n; i++) {
      const c = closestPointOnSegment(cur, poly[i], poly[(i + 1) % n]);
      const d = distance(cur, c);
      if (d < best) {
        best = d;
        q = c;
        edge = i;
      }
    }
    const inside = pointInPolygon(cur, poly);
    let dir = scale(sub(cur, q), inside ? 1 : -1);
    if (length(dir) < GEOMETRY_EPS) {
      const out = outwardNormal(poly[edge], poly[(edge + 1) % n]);
      dir = { x: -out.x * sign, y: -out.y * sign };
    }
    cur = add(q, scale(normalize(dir), margin));
    if (ok(cur)) {
      return cur;
    }
  }
  return null;
}

/**
 * A point well inside the polygon, far from its edges (a pole-of-inaccessibility approximation by
 * grid search and refinement). Unlike the centroid it is always inside, also for L and U shapes.
 */
export function interiorPoint(poly: readonly Vec2[]): Vec2 {
  const b = bbox(poly);
  let best = centroid(poly);
  let bestD = signedDistance(best, poly);
  const consider = (q: Vec2): void => {
    const d = signedDistance(q, poly);
    if (d > bestD) {
      bestD = d;
      best = q;
    }
  };
  const N = 16;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      consider({ x: b.minX + ((i + 0.5) / N) * b.width, y: b.minY + ((j + 0.5) / N) * b.height });
    }
  }
  let step = Math.max(b.width, b.height) / N;
  for (let round = 0; round < 8; round++) {
    const center = best;
    for (let i = -2; i <= 2; i++) {
      for (let j = -2; j <= 2; j++) {
        consider({ x: center.x + i * step, y: center.y + j * step });
      }
    }
    step /= 2;
  }
  return best;
}
