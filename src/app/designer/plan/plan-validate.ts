// Plan validation (plan C3). Pure; cheap enough (O(n^2), n <= 32) to run on every pointer move.
//
// CONTRACT FILE (signature). Frozen for parallel tracks.

import {
  doorMaxHeight,
  EditSubject,
  ErrorContext,
  LIMIT_EPS,
  loopPoints,
  Plan,
  PlanError,
  PlanLoop,
  planLoop,
  PLAN_LIMITS as L,
  PlanOpening,
  windowMaxHeight,
  windowMaxSill,
} from './plan-model';
import {
  area,
  bbox,
  distance,
  findCloseEdges,
  hasSelfIntersection,
  interiorAngles,
  signedArea,
  Vec2,
} from './polygon';

const DEFAULT_CONTEXT: ErrorContext = { subject: 'wall' };

/**
 * Check every C3 rule. Returns `[]` for a valid plan. Each error carries the edit `context`
 * (what the user was editing) so the UI can pick the right copy; sanitize ignores it.
 */
export function validatePlan(plan: Plan, context: ErrorContext = DEFAULT_CONTEXT): PlanError[] {
  const errors: PlanError[] = [];
  const err = (code: PlanError['code'], extra: Partial<PlanError> = {}): void => {
    errors.push({ code, subject: context.subject, subjectId: context.subjectId, ...extra });
  };

  const loop = planLoop(plan);
  const points = loopPoints(plan);
  if (!loop || !points || plan.vertices.length !== points.length || !allFinite(plan)) {
    err('invalid-structure');
    return errors;
  }
  const n = points.length;
  if (n < L.corners.min) {
    err('too-few-corners');
  }
  if (n > L.corners.max) {
    err('too-many-corners');
  }
  if (signedArea(points) <= 0 && !hasSelfIntersection(points)) {
    err('invalid-structure');
    return errors;
  }

  validateHeight(loop, err);
  validateWalls(loop, points, err);

  if (hasSelfIntersection(points)) {
    err('self-intersection');
  } else {
    validateClearance(loop, points, err);
    validateSize(points, err);
  }

  validateOpenings(plan, loop, points, err);
  return errors;
}

type Report = (code: PlanError['code'], extra?: Partial<PlanError>) => void;

function allFinite(plan: Plan): boolean {
  return (
    plan.vertices.every((v) => Number.isFinite(v.x) && Number.isFinite(v.y)) &&
    plan.rooms.every((r) => Number.isFinite(r.height)) &&
    plan.openings.every((o) =>
      [o.offset, o.width, o.height, o.sill].every((value) => Number.isFinite(value)),
    )
  );
}

function validateHeight(loop: PlanLoop, err: Report): void {
  const h = loop.room.height;
  if (h < L.height.min - LIMIT_EPS || h > L.height.max + LIMIT_EPS) {
    err('height-out-of-range');
  }
}

function validateWalls(loop: PlanLoop, points: Vec2[], err: Report): void {
  const n = points.length;
  loop.walls.forEach((wall, i) => {
    if (distance(points[i], points[(i + 1) % n]) < L.wallLengthMin - LIMIT_EPS) {
      err('wall-too-short', { wallId: wall.id });
    }
  });
  interiorAngles(points).forEach((angle, i) => {
    if (angle < L.angleDeg.min - LIMIT_EPS || angle > L.angleDeg.max + LIMIT_EPS) {
      err('angle-too-sharp', { vertexId: loop.vertices[i].id });
    }
  });
}

function validateClearance(loop: PlanLoop, points: Vec2[], err: Report): void {
  const close = findCloseEdges(points, L.clearance - LIMIT_EPS);
  if (close) {
    err('walls-too-close', { wallId: loop.walls[close[0]].id });
  }
}

function validateSize(points: Vec2[], err: Report): void {
  const box = bbox(points);
  if (box.width > L.bboxMax + LIMIT_EPS || box.height > L.bboxMax + LIMIT_EPS) {
    err('too-large');
  }
  const a = area(points);
  if (a < L.area.min - LIMIT_EPS || a > L.area.max + LIMIT_EPS) {
    err('area-out-of-range');
  }
}

function validateOpenings(plan: Plan, loop: PlanLoop, points: Vec2[], err: Report): void {
  if (plan.openings.length > L.maxOpenings) {
    err('too-many-openings');
  }
  const n = points.length;
  const byWall = new Map<string, PlanOpening[]>();
  for (const o of plan.openings) {
    const index = loop.walls.findIndex((w) => w.id === o.wallId);
    if (index < 0 || (o.kind !== 'door' && o.kind !== 'window')) {
      err('invalid-structure', { openingId: o.id });
      continue;
    }
    byWall.set(o.wallId, [...(byWall.get(o.wallId) ?? []), o]);
    if (!sizeOk(o, loop.room.height)) {
      err('opening-size-out-of-range', { openingId: o.id, wallId: o.wallId });
    }
  }
  loop.walls.forEach((wall, i) => {
    const wallLen = distance(points[i], points[(i + 1) % n]);
    const list = [...(byWall.get(wall.id) ?? [])].sort((a, b) => a.offset - b.offset);
    list.forEach((o, k) => {
      const fits =
        o.offset >= L.openingMargin - LIMIT_EPS &&
        o.offset + o.width <= wallLen - L.openingMargin + LIMIT_EPS;
      if (!fits) {
        err('opening-does-not-fit', { openingId: o.id, wallId: wall.id });
      }
      const prev = list[k - 1];
      if (prev && o.offset < prev.offset + prev.width + L.openingGap - LIMIT_EPS) {
        err('openings-overlap', { openingId: o.id, wallId: wall.id });
      }
    });
  });
}

function sizeOk(o: PlanOpening, roomHeight: number): boolean {
  const e = LIMIT_EPS;
  if (o.kind === 'door') {
    return (
      o.width >= L.door.width.min - e &&
      o.width <= L.door.width.max + e &&
      o.height >= L.door.heightMin - e &&
      o.height <= doorMaxHeight(roomHeight) + e &&
      Math.abs(o.sill) <= e
    );
  }
  return (
    o.width >= L.window.width.min - e &&
    o.width <= L.window.width.max + e &&
    o.height >= L.window.heightMin - e &&
    o.height <= windowMaxHeight(roomHeight) + e &&
    o.sill >= -e &&
    o.sill <= windowMaxSill(roomHeight, o.height) + e
  );
}

export type { EditSubject };
