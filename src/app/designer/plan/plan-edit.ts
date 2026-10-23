// Plan edit operations (plan C5, C4). Pure: every op returns a new plan or the errors, and never
// changes its input. A refused edit returns the validation errors (with the edit context); typed
// values are NEVER clamped, so the UI reverts to the last valid value and shows the reason. Drags
// simply keep the last accepted plan.
//
// CONTRACT FILE (signatures). Frozen for parallel tracks.

import type { Room } from '../state/design-defaults';
import {
  doorMaxHeight,
  EditResult,
  EditSubject,
  OPENING_DEFAULTS,
  OpeningKind,
  MAX_ID_NUMBER,
  OpeningPatch,
  Plan,
  PlanError,
  PlanLoop,
  planLoop,
  PLAN_LIMITS as L,
  PlanOpening,
  PlanWall,
  roundMm,
  windowMaxHeight,
  windowMaxSill,
} from './plan-model';
import { validatePlan } from './plan-validate';
import {
  add,
  cross,
  distance,
  dot,
  lineIntersection,
  normalize,
  outwardNormal,
  scale,
  sub,
  Vec2,
} from './polygon';
import { windowFor } from './room-shape';

export type { EditResult, SnapOptions };

/** Snapping while dragging (both toggleable). `tolerance` is in metres (screen px / zoom). */
interface SnapOptions {
  /** Round to the 0.1 m grid anchored at plan (0, 0). */
  grid: boolean;
  /** Align a wall next to the dragged corner to x/y when within 5 degrees or `tolerance` metres. */
  angle: boolean;
  tolerance: number;
}

/** Typed values and keyboard nudges are never snapped. */
export const NO_SNAP: SnapOptions = { grid: false, angle: false, tolerance: 0 };
export const DEFAULT_SNAP: SnapOptions = { grid: true, angle: true, tolerance: 0.05 };

const SIN_PARALLEL = Math.sin((L.parallelDeg * Math.PI) / 180);

// ---- helpers ---------------------------------------------------------------------------------

function fail(
  code: PlanError['code'],
  subject: EditSubject,
  subjectId?: string,
  extra: Partial<PlanError> = {},
): EditResult {
  return { ok: false, errors: [{ code, subject, subjectId, ...extra }] };
}

function clone(plan: Plan): Plan {
  return structuredClone(plan);
}

function allocate(plan: Plan, letter: 'v' | 'w' | 'o'): string {
  if (plan.nextId <= MAX_ID_NUMBER) {
    return `${letter}${plan.nextId++}`;
  }
  // At the limit: reuse the lowest free number (a plan holds far fewer than a million ids).
  const used = new Set<number>([
    ...plan.vertices.map((v) => Number(v.id.slice(1))),
    ...plan.walls.map((w) => Number(w.id.slice(1))),
    ...plan.rooms.map((r) => Number(r.id.slice(1))),
    ...plan.openings.map((o) => Number(o.id.slice(1))),
  ]);
  let n = 1;
  while (used.has(n)) {
    n++;
  }
  return `${letter}${n}`;
}

function openingsOf(plan: Plan, wallId: string): PlanOpening[] {
  return plan.openings.filter((o) => o.wallId === wallId).sort((a, b) => a.offset - b.offset);
}

/**
 * C4: when a wall gets shorter, openings keep their offset but are pushed back toward the start
 * (in order, with the minimum gaps) so they stay inside. They are never shrunk or deleted: if
 * they still do not fit, validation refuses the edit.
 */
function refitOpenings(plan: Plan): void {
  const loop = planLoop(plan);
  if (!loop) {
    return;
  }
  loop.walls.forEach((wall, i) => {
    const a = loop.vertices[i];
    const b = loop.vertices[(i + 1) % loop.vertices.length];
    let limit = distance(a, b) - L.openingMargin;
    const list = openingsOf(plan, wall.id);
    for (let k = list.length - 1; k >= 0; k--) {
      const o = list[k];
      o.offset = roundMm(Math.min(o.offset, limit - o.width));
      limit = o.offset - L.openingGap;
    }
  });
}

function finish(plan: Plan, subject: EditSubject, subjectId: string, refit: boolean): EditResult {
  if (refit) {
    refitOpenings(plan);
  }
  const errors = validatePlan(plan, { subject, subjectId });
  return errors.length > 0 ? { ok: false, errors } : { ok: true, plan };
}

function setPoints(plan: Plan, loop: PlanLoop, points: Vec2[]): void {
  loop.vertices.forEach((v, i) => {
    v.x = roundMm(points[i].x);
    v.y = roundMm(points[i].y);
  });
}

function isFiniteVec(p: Vec2): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.y);
}

function roundToGrid(value: number): number {
  return Math.round(value / L.grid) * L.grid;
}

/** Translate edge `i` by `t`; its end points slide along the neighbouring walls' lines. */
function shiftWall(points: Vec2[], i: number, t: Vec2): Vec2[] {
  const n = points.length;
  const prev = points[(i - 1 + n) % n];
  const a = points[i];
  const b = points[(i + 1) % n];
  const next = points[(i + 2) % n];
  const u = normalize(sub(b, a));
  const a2 = add(a, t);
  const b2 = add(b, t);
  const slide = (moved: Vec2, start: Vec2, end: Vec2): Vec2 => {
    const dir = normalize(sub(end, start));
    if (Math.abs(cross(u, dir)) < SIN_PARALLEL) {
      return moved; // nearly parallel neighbour: just translate this end
    }
    return lineIntersection(moved, add(moved, u), start, end) ?? moved;
  };
  const result = points.map((p) => ({ ...p }));
  result[i] = slide(a2, prev, a);
  result[(i + 1) % n] = slide(b2, b, next);
  return result;
}

// ---- corners ---------------------------------------------------------------------------------

/**
 * Move a corner to `to` (snapped per `snap`). The connected walls follow; openings are pushed
 * back if a wall gets shorter, and the edit is refused if anything becomes invalid.
 */
export function moveVertex(plan: Plan, vertexId: string, to: Vec2, snap: SnapOptions): EditResult {
  const next = clone(plan);
  const loop = planLoop(next);
  const k = loop?.vertices.findIndex((v) => v.id === vertexId) ?? -1;
  if (!loop || k < 0 || !isFiniteVec(to)) {
    return fail('invalid-structure', 'corner', vertexId);
  }
  const n = loop.vertices.length;
  let target = { x: to.x, y: to.y };
  if (snap.grid) {
    target = { x: roundToGrid(target.x), y: roundToGrid(target.y) };
  }
  if (snap.angle) {
    const limit = Math.tan((L.angleSnapDeg * Math.PI) / 180);
    for (const neighbour of [loop.vertices[(k - 1 + n) % n], loop.vertices[(k + 1) % n]]) {
      const dx = Math.abs(target.x - neighbour.x);
      const dy = Math.abs(target.y - neighbour.y);
      if (dy <= Math.max(dx * limit, snap.tolerance) && dy < dx) {
        target.y = neighbour.y;
      } else if (dx <= Math.max(dy * limit, snap.tolerance) && dx < dy) {
        target.x = neighbour.x;
      }
    }
  }
  loop.vertices[k].x = roundMm(target.x);
  loop.vertices[k].y = roundMm(target.y);
  return finish(next, 'corner', vertexId, true);
}

/** Add a corner on a wall, `at` metres from its `from` corner. The wall keeps its id (first part). */
export function insertVertex(plan: Plan, wallId: string, at: number): EditResult {
  const next = clone(plan);
  const loop = planLoop(next);
  const i = loop?.walls.findIndex((w) => w.id === wallId) ?? -1;
  if (!loop || i < 0 || !Number.isFinite(at)) {
    return fail('invalid-structure', 'wall', wallId);
  }
  const a = loop.vertices[i];
  const b = loop.vertices[(i + 1) % loop.vertices.length];
  const len = distance(a, b);
  if (at <= 0 || at >= len) {
    return fail('wall-too-short', 'wall', wallId, { wallId });
  }
  const wall = loop.walls[i];
  const p = add(a, scale(normalize(sub(b, a)), at));
  const vertexId = allocate(next, 'v');
  const newWallId = allocate(next, 'w');
  // The second part looks the same as the first: it copies the wall's colour.
  const newWall: PlanWall = { id: newWallId, from: vertexId, to: wall.to };
  if (wall.color) {
    newWall.color = wall.color;
  }
  wall.to = vertexId;
  next.vertices.splice(next.vertices.indexOf(a) + 1, 0, {
    id: vertexId,
    x: roundMm(p.x),
    y: roundMm(p.y),
  });
  next.walls.splice(next.walls.indexOf(wall) + 1, 0, newWall);
  loop.room.wallIds.splice(i + 1, 0, newWallId);
  // Openings go to the part holding their centre; validation refuses one that straddles the cut.
  for (const o of openingsOf(next, wallId)) {
    if (o.offset + o.width / 2 >= at) {
      o.wallId = newWallId;
      o.offset = roundMm(o.offset - at);
    }
  }
  return finish(next, 'wall', wallId, false);
}

/** Remove a corner (min 3 remain). Its two walls merge into the first one; ids stay stable. */
export function deleteVertex(plan: Plan, vertexId: string): EditResult {
  const next = clone(plan);
  const loop = planLoop(next);
  const k = loop?.vertices.findIndex((v) => v.id === vertexId) ?? -1;
  if (!loop || k < 0) {
    return fail('invalid-structure', 'corner', vertexId);
  }
  const n = loop.vertices.length;
  if (n <= L.corners.min) {
    return fail('too-few-corners', 'corner', vertexId, { vertexId });
  }
  const prev = loop.walls[(k - 1 + n) % n];
  const removed = loop.walls[k];
  const prevLength = distance(loop.vertices[(k - 1 + n) % n], loop.vertices[k]);
  for (const o of next.openings) {
    if (o.wallId === removed.id) {
      o.wallId = prev.id;
      o.offset = roundMm(o.offset + prevLength);
    }
  }
  prev.to = removed.to;
  next.walls = next.walls.filter((w) => w.id !== removed.id);
  next.vertices = next.vertices.filter((v) => v.id !== vertexId);
  loop.room.wallIds = loop.room.wallIds.filter((id) => id !== removed.id);
  return finish(next, 'corner', vertexId, true);
}

// ---- walls -----------------------------------------------------------------------------------

/**
 * Push/pull: move a wall parallel to itself by `distance` metres along its outward normal
 * (negative = inward). Its end points slide along the neighbouring walls, which keep their
 * direction; a neighbour within 5 degrees of parallel is just translated.
 */
export function moveWall(
  plan: Plan,
  wallId: string,
  distanceMoved: number,
  snap: SnapOptions,
): EditResult {
  const next = clone(plan);
  const loop = planLoop(next);
  const i = loop?.walls.findIndex((w) => w.id === wallId) ?? -1;
  if (!loop || i < 0 || !Number.isFinite(distanceMoved)) {
    return fail('invalid-structure', 'wall', wallId);
  }
  const points = loop.vertices.map((v) => ({ x: v.x, y: v.y }));
  const a = points[i];
  const normal = outwardNormal(a, points[(i + 1) % points.length]);
  let d = distanceMoved;
  if (snap.grid) {
    const axisAligned = Math.abs(normal.x) > 0.999 || Math.abs(normal.y) > 0.999;
    d = axisAligned ? roundToGrid(dot(a, normal) + d) - dot(a, normal) : roundToGrid(d);
  }
  setPoints(next, loop, shiftWall(points, i, scale(normal, d)));
  return finish(next, 'wall', wallId, true);
}

/**
 * Set the inner length of a wall (typed value, never snapped). The end opposite `keep` moves
 * along the wall and the wall next to it is pushed parallel, so a rectangle stays a rectangle.
 */
export function setWallLength(
  plan: Plan,
  wallId: string,
  newLength: number,
  keep: 'start' | 'end',
): EditResult {
  const next = clone(plan);
  const loop = planLoop(next);
  const i = loop?.walls.findIndex((w) => w.id === wallId) ?? -1;
  if (!loop || i < 0 || !Number.isFinite(newLength) || newLength <= 0) {
    return fail('invalid-structure', 'wall', wallId);
  }
  const points = loop.vertices.map((v) => ({ x: v.x, y: v.y }));
  const n = points.length;
  const a = points[i];
  const b = points[(i + 1) % n];
  const u = normalize(sub(b, a));
  const delta = roundMm(newLength) - distance(a, b);
  const moved =
    keep === 'start'
      ? shiftWall(points, (i + 1) % n, scale(u, delta))
      : shiftWall(points, (i - 1 + n) % n, scale(u, -delta));
  setPoints(next, loop, moved);
  return finish(next, 'wall', wallId, true);
}

/** The shortest a wall may be: 0.30 m, or longer to hold its openings. For UI hints. */
export function minWallLength(plan: Plan, wallId: string): number {
  const list = openingsOf(plan, wallId);
  if (list.length === 0) {
    return L.wallLengthMin;
  }
  const used = list.reduce((sum, o) => sum + o.width, 0) + (list.length - 1) * L.openingGap;
  return Math.max(L.wallLengthMin, roundMm(used + 2 * L.openingMargin));
}

// ---- openings --------------------------------------------------------------------------------

function defaultOpening(
  kind: OpeningKind,
  roomHeight: number,
): { width: number; height: number; sill: number } {
  if (kind === 'door') {
    return {
      width: OPENING_DEFAULTS.door.width,
      height: Math.min(OPENING_DEFAULTS.door.height, doorMaxHeight(roomHeight)),
      sill: 0,
    };
  }
  const height = Math.min(OPENING_DEFAULTS.window.height, windowMaxHeight(roomHeight));
  return {
    width: OPENING_DEFAULTS.window.width,
    height,
    sill: Math.min(OPENING_DEFAULTS.window.sill, windowMaxSill(roomHeight, height)),
  };
}

/**
 * Add a door (0.90 x 2.10) or window (1.20 x 1.40, sill 0.90) near `at` (the wanted CENTRE, in
 * metres from the wall's `from` corner; default the middle). It is nudged to the nearest free
 * spot; if the default width does not fit the widest gap, it shrinks to the gap (if still above
 * the minimum width). Otherwise the edit is refused with `opening-does-not-fit`.
 */
export function addOpening(plan: Plan, wallId: string, kind: OpeningKind, at?: number): EditResult {
  const next = clone(plan);
  const loop = planLoop(next);
  const i = loop?.walls.findIndex((w) => w.id === wallId) ?? -1;
  if (!loop || i < 0 || (at !== undefined && !Number.isFinite(at))) {
    return fail('invalid-structure', 'opening', wallId);
  }
  if (next.openings.length >= L.maxOpenings) {
    return fail('too-many-openings', 'opening', wallId, { wallId });
  }
  const wallLen = distance(loop.vertices[i], loop.vertices[(i + 1) % loop.vertices.length]);
  const size = defaultOpening(kind, loop.room.height);
  const minWidth = kind === 'door' ? L.door.width.min : L.window.width.min;

  // Free intervals for the near edge..far edge of a new opening.
  const gaps: Array<[number, number]> = [];
  let start: number = L.openingMargin;
  for (const o of openingsOf(next, wallId)) {
    gaps.push([start, o.offset - L.openingGap]);
    start = o.offset + o.width + L.openingGap;
  }
  gaps.push([start, wallLen - L.openingMargin]);

  const centre = at ?? wallLen / 2;
  let width = size.width;
  let usable = gaps.filter(([s, e]) => e - s >= width - 1e-9);
  if (usable.length === 0) {
    const widest = gaps.reduce((best, g) => (g[1] - g[0] > best[1] - best[0] ? g : best));
    const w = Math.floor((widest[1] - widest[0]) * 1000) / 1000;
    if (w < minWidth - 1e-9) {
      return fail('opening-does-not-fit', 'opening', wallId, { wallId });
    }
    width = w;
    usable = [widest];
  }
  let offset = 0;
  let best = Infinity;
  for (const [s, e] of usable) {
    const wanted = centre - width / 2;
    const clamped = Math.min(e - width, Math.max(s, wanted));
    if (Math.abs(clamped - wanted) < best) {
      best = Math.abs(clamped - wanted);
      offset = clamped;
    }
  }
  const opening: PlanOpening = {
    id: allocate(next, 'o'),
    wallId,
    kind,
    offset: roundMm(offset),
    width: roundMm(width),
    height: roundMm(size.height),
    sill: roundMm(size.sill),
    anchor: 'floor',
  };
  next.openings.push(opening);
  return finish(next, 'opening', opening.id, false);
}

/**
 * Change an opening. Typed values are validated, not clamped: a bad value returns the errors and
 * the UI reverts. Window rules (C4): editing `sill` anchors to the floor, editing `topGap` anchors
 * to the ceiling; changing `height` alone keeps the anchored gap fixed. Doors ignore sill/anchor.
 */
export function updateOpening(plan: Plan, openingId: string, patch: OpeningPatch): EditResult {
  const next = clone(plan);
  const loop = planLoop(next);
  const o = next.openings.find((x) => x.id === openingId);
  if (!loop || !o) {
    return fail('invalid-structure', 'opening', openingId);
  }
  const values = [patch.offset, patch.width, patch.height, patch.sill, patch.topGap];
  if (values.some((v) => v !== undefined && !Number.isFinite(v))) {
    return fail('invalid-structure', 'opening', openingId, { openingId });
  }
  const roomHeight = loop.room.height;
  const oldTopGap = roomHeight - o.sill - o.height;
  if (patch.offset !== undefined) o.offset = roundMm(patch.offset);
  if (patch.width !== undefined) o.width = roundMm(patch.width);
  if (patch.height !== undefined) o.height = roundMm(patch.height);
  if (o.kind === 'door') {
    o.sill = 0;
    o.anchor = 'floor';
  } else {
    if (patch.anchor === 'floor' || patch.anchor === 'ceiling') o.anchor = patch.anchor;
    if (patch.sill !== undefined) {
      o.sill = roundMm(patch.sill);
      o.anchor = patch.anchor ?? 'floor';
    } else if (patch.topGap !== undefined) {
      o.sill = roundMm(roomHeight - o.height - patch.topGap);
      o.anchor = patch.anchor ?? 'ceiling';
    } else if (patch.height !== undefined && o.anchor === 'ceiling') {
      o.sill = roundMm(roomHeight - oldTopGap - o.height);
    }
  }
  return finish(next, 'opening', openingId, false);
}

export function removeOpening(plan: Plan, openingId: string): Plan {
  const next = clone(plan);
  next.openings = next.openings.filter((o) => o.id !== openingId);
  return next;
}

// ---- room ------------------------------------------------------------------------------------

/**
 * The lowest ceiling that keeps every door and window intact (never below the global minimum).
 * Floor-anchored windows keep their sill, ceiling-anchored ones keep their gap to the ceiling.
 * For UI hints ("Lowest possible: X m").
 */
export function minPlanHeight(plan: Plan): number {
  const loop = planLoop(plan);
  const current = loop?.room.height ?? L.height.max;
  let min: number = L.height.min;
  for (const o of plan.openings) {
    if (o.kind === 'door') {
      min = Math.max(min, o.height + L.door.headroom);
      continue;
    }
    const byHeadroom = o.height + L.window.headroom;
    const byAnchor =
      o.anchor === 'ceiling' ? current - o.sill : o.sill + o.height + L.window.topGapMin;
    min = Math.max(min, byHeadroom, byAnchor);
  }
  return Math.min(current, Math.ceil(min * 1000 - 1e-6) / 1000);
}

/**
 * Set the ceiling height (typed; out-of-range values are refused). Windows keep their anchored
 * gap and the other gap absorbs the change. Door and window sizes are never changed: a ceiling
 * too low for one is refused with `ceiling-too-low`.
 */
export function setPlanHeight(plan: Plan, height: number): EditResult {
  const next = clone(plan);
  const loop = planLoop(next);
  if (!loop || !Number.isFinite(height)) {
    return fail('invalid-structure', 'wall');
  }
  const oldHeight = loop.room.height;
  const h = roundMm(height);
  if (h < L.height.min - 1e-9 || h > L.height.max + 1e-9) {
    return fail('height-out-of-range', 'wall');
  }
  if (h < minPlanHeight(plan) - 1e-9) {
    return fail('ceiling-too-low', 'wall');
  }
  loop.room.height = h;
  for (const o of next.openings) {
    if (o.kind === 'door') {
      continue;
    }
    const topGap = oldHeight - o.sill - o.height;
    if (o.anchor === 'ceiling') {
      o.sill = roundMm(h - topGap - o.height);
    }
  }
  return finish(next, 'wall', '', false);
}

/**
 * The simple rectangle (with its fixed window as a real opening) as a plan. `simpleWallColors`
 * (4 entries, index = wall; null = base) are copied onto the walls as colour overrides.
 */
export function rectangleToPlan(
  room: Room,
  simpleWallColors: readonly (string | null)[] = [],
): Plan {
  const { length, width, height } = room;
  const w = windowFor(room);
  return {
    vertices: [
      { id: 'v1', x: 0, y: 0 },
      { id: 'v2', x: length, y: 0 },
      { id: 'v3', x: length, y: width },
      { id: 'v4', x: 0, y: width },
    ],
    walls: [
      { id: 'w5', from: 'v1', to: 'v2' },
      { id: 'w6', from: 'v2', to: 'v3' },
      { id: 'w7', from: 'v3', to: 'v4' },
      { id: 'w8', from: 'v4', to: 'v1' },
    ].map((wall, i) => {
      const color = simpleWallColors[i];
      return color ? { ...wall, color } : wall;
    }),
    rooms: [{ id: 'r1', wallIds: ['w5', 'w6', 'w7', 'w8'], height }],
    openings: [
      {
        id: 'o9',
        wallId: 'w5',
        kind: 'window',
        offset: w.offset,
        width: w.width,
        height: w.height,
        sill: w.sill,
        anchor: 'floor',
      },
    ],
    nextId: 10,
  };
}
