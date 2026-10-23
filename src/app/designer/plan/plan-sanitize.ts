// Sanitising a stored plan (plan C6). localStorage is hostile input: anything may be wrong.
//
// CONTRACT FILE (signature). Frozen for parallel tracks.

import { normalizeHex } from './paint';
import {
  ID_PATTERN,
  MAX_ID_NUMBER,
  OpeningAnchor,
  OpeningKind,
  Plan,
  PlanOpening,
  PlanVertex,
  PlanWall,
  PLAN_LIMITS as L,
  roundMm,
} from './plan-model';
import { validatePlan } from './plan-validate';
import { signedArea } from './polygon';

/** Array caps, checked before any loop. Beyond these the whole plan is rejected. */
const MAX_VERTICES = 64;
const MAX_WALLS = 64;
const MAX_OPENINGS = 128;
const MAX_NEXT_ID = MAX_ID_NUMBER;
/** Beyond this `nextId` a plan's ids are renumbered, so it never reaches the `ID_PATTERN` limit. */
export const COMPACT_ID_AT = 100_000;

type Rec = Record<string, unknown>;

function isRecord(value: unknown): value is Rec {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readId(value: unknown, letter: string): string | null {
  return typeof value === 'string' && ID_PATTERN.test(value) && value[0] === letter ? value : null;
}

/** A stored colour: lowercase `#rrggbb` or undefined. */
function readColor(value: unknown): string | undefined {
  return normalizeHex(value) ?? undefined;
}

/** A finite number, rounded to mm and clamped to +-coordMax; null otherwise. */
function readNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return roundMm(Math.max(-L.coordMax, Math.min(L.coordMax, value)));
}

function readVertices(raw: unknown): PlanVertex[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_VERTICES) {
    return null;
  }
  const seen = new Set<string>();
  const out: PlanVertex[] = [];
  for (const item of raw) {
    const id = isRecord(item) ? readId(item['id'], 'v') : null;
    const x = isRecord(item) ? readNumber(item['x']) : null;
    const y = isRecord(item) ? readNumber(item['y']) : null;
    if (id === null || x === null || y === null || seen.has(id)) {
      return null;
    }
    seen.add(id);
    out.push({ id, x, y });
  }
  return out;
}

function readWalls(raw: unknown, vertexIds: Set<string>): PlanWall[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_WALLS) {
    return null;
  }
  const seen = new Set<string>();
  const out: PlanWall[] = [];
  for (const item of raw) {
    const id = isRecord(item) ? readId(item['id'], 'w') : null;
    const from = isRecord(item) ? readId(item['from'], 'v') : null;
    const to = isRecord(item) ? readId(item['to'], 'v') : null;
    if (id === null || from === null || to === null || seen.has(id)) {
      return null;
    }
    if (!vertexIds.has(from) || !vertexIds.has(to) || from === to) {
      return null;
    }
    seen.add(id);
    const color = readColor(item['color']);
    out.push(color ? { id, from, to, color } : { id, from, to });
  }
  return out;
}

interface Loop {
  /** Walls in loop order, each oriented along the loop. */
  walls: PlanWall[];
  flipped: Set<string>;
}

/** Order and orient the walls into one closed loop that uses all of them, or null. */
function chainWalls(wallIds: string[], walls: PlanWall[]): Loop | null {
  const byId = new Map(walls.map((w) => [w.id, w]));
  if (wallIds.length !== walls.length || new Set(wallIds).size !== wallIds.length) {
    return null;
  }
  const ordered = wallIds.map((id) => byId.get(id));
  if (ordered.some((w) => w === undefined) || ordered.length < 3) {
    return null;
  }
  const list = ordered as PlanWall[];
  const [first, second] = list;
  // Orient the first wall by the corner it shares with the second.
  let start: string;
  let cursor: string;
  if (first.to === second.from || first.to === second.to) {
    start = first.from;
    cursor = first.to;
  } else if (first.from === second.from || first.from === second.to) {
    start = first.to;
    cursor = first.from;
  } else {
    return null;
  }
  const out: PlanWall[] = [{ id: first.id, from: start, to: cursor }];
  const flipped = new Set<string>();
  if (start !== first.from) {
    flipped.add(first.id);
  }
  const visited = new Set<string>([start]);
  for (let k = 1; k < list.length; k++) {
    const w = list[k];
    if (visited.has(cursor)) {
      return null;
    }
    visited.add(cursor);
    if (w.from === cursor) {
      out.push({ id: w.id, from: w.from, to: w.to });
      cursor = w.to;
    } else if (w.to === cursor) {
      out.push({ id: w.id, from: w.to, to: w.from });
      flipped.add(w.id);
      cursor = w.from;
    } else {
      return null;
    }
  }
  return cursor === start ? { walls: out, flipped } : null;
}

function readOpening(item: unknown, wallIds: Set<string>): PlanOpening | null {
  if (!isRecord(item)) {
    return null;
  }
  const id = readId(item['id'], 'o');
  const wallId = readId(item['wallId'], 'w');
  const kind = item['kind'];
  const offset = readNumber(item['offset']);
  const width = readNumber(item['width']);
  const height = readNumber(item['height']);
  const sill = readNumber(item['sill']);
  if (id === null || wallId === null || !wallIds.has(wallId)) {
    return null;
  }
  if ((kind !== 'door' && kind !== 'window') || offset === null || width === null) {
    return null;
  }
  if (height === null || sill === null) {
    return null;
  }
  const isDoor = (kind as OpeningKind) === 'door';
  const anchor: OpeningAnchor = !isDoor && item['anchor'] === 'ceiling' ? 'ceiling' : 'floor';
  const color = isDoor ? readColor(item['color']) : undefined;
  const opening: PlanOpening = {
    id,
    wallId,
    kind,
    offset,
    width,
    height,
    sill: isDoor ? 0 : sill,
    anchor,
  };
  if (color) {
    opening.color = color;
  }
  return opening;
}

function readCounter(value: unknown, minimum: number): number {
  const n = typeof value === 'number' && Number.isInteger(value) ? value : 0;
  return Math.min(MAX_NEXT_ID, Math.max(n, minimum));
}

function maxIdNumber(ids: string[]): number {
  return ids.reduce((max, id) => Math.max(max, Number(id.slice(1))), 0);
}

/**
 * Renumber every id compactly (v1, v2, ... w.., r.., o..), keeping letters, order and references,
 * so `nextId` is small again. Returns a new plan.
 */
export function compactIds(plan: Plan): Plan {
  let counter = 1;
  const map = new Map<string, string>();
  const fresh = (id: string): string => {
    const next = `${id[0]}${counter++}`;
    map.set(id, next);
    return next;
  };
  const vertices = plan.vertices.map((v) => ({ ...v, id: fresh(v.id) }));
  const walls = plan.walls.map((w) => ({ ...w, id: fresh(w.id) }));
  const rooms = plan.rooms.map((r) => ({ ...r, id: fresh(r.id) }));
  const openings = plan.openings.map((o) => ({ ...o, id: fresh(o.id) }));
  const ref = (id: string): string => map.get(id) ?? id;
  return {
    vertices,
    walls: walls.map((w) => ({ ...w, from: ref(w.from), to: ref(w.to) })),
    rooms: rooms.map((r) => ({ ...r, wallIds: r.wallIds.map(ref) })),
    openings: openings.map((o) => ({ ...o, wallId: ref(o.wallId) })),
    nextId: counter,
  };
}

/**
 * Turn unknown (stored) data into a valid canonical plan, or null when the geometry cannot be
 * trusted (the caller then falls back to the simple room, silently). Bad openings are dropped
 * one by one. Never throws and never trusts array lengths, ids, references or numbers.
 */
export function sanitizePlan(raw: unknown): Plan | null {
  if (!isRecord(raw) || !Array.isArray(raw['rooms']) || raw['rooms'].length !== 1) {
    return null;
  }
  const vertices = readVertices(raw['vertices']);
  const walls = vertices && readWalls(raw['walls'], new Set(vertices.map((v) => v.id)));
  const rawRoom: unknown = raw['rooms'][0];
  if (!vertices || !walls || !isRecord(rawRoom) || !Array.isArray(rawRoom['wallIds'])) {
    return null;
  }
  const roomId = readId(rawRoom['id'], 'r');
  const height = readNumber(rawRoom['height']);
  const wallIdsRaw: unknown[] = rawRoom['wallIds'];
  if (roomId === null || height === null || wallIdsRaw.length > MAX_WALLS) {
    return null;
  }
  const wallIds = wallIdsRaw.filter((id): id is string => typeof id === 'string');
  if (wallIds.length !== wallIdsRaw.length) {
    return null;
  }
  const loop = chainWalls(wallIds, walls);
  if (!loop) {
    return null;
  }
  const byId = new Map(vertices.map((v) => [v.id, v]));
  let orderedWalls = loop.walls;
  const loopVertices = orderedWalls.map((w) => byId.get(w.from) as PlanVertex);
  if (new Set(loopVertices.map((v) => v.id)).size !== loopVertices.length) {
    return null;
  }

  const rawOpenings = raw['openings'];
  if (!Array.isArray(rawOpenings) || rawOpenings.length > MAX_OPENINGS) {
    return null;
  }
  const wallSet = new Set(wallIds);
  const candidates: PlanOpening[] = [];
  const seen = new Set<string>();
  for (const item of rawOpenings) {
    const o = readOpening(item, wallSet);
    if (o && !seen.has(o.id)) {
      seen.add(o.id);
      candidates.push(o);
    }
  }

  // Offsets are measured from a wall's `from` corner: mirror them for every wall whose direction
  // changed, either by chaining the loop or by reversing it to fix the winding.
  const n = loopVertices.length;
  const lengthOf = new Map<string, number>();
  orderedWalls.forEach((w, k) => {
    const a = loopVertices[k];
    const b = loopVertices[(k + 1) % n];
    lengthOf.set(w.id, Math.hypot(b.x - a.x, b.y - a.y));
  });
  const reverse = signedArea(loopVertices) < 0;
  for (const o of candidates) {
    if (loop.flipped.has(o.wallId) !== reverse) {
      o.offset = roundMm((lengthOf.get(o.wallId) ?? 0) - o.offset - o.width);
    }
  }
  let orderedVertices = loopVertices;
  if (reverse) {
    const original = orderedWalls;
    orderedVertices = loopVertices.map((_, j) => loopVertices[(n - j) % n]);
    orderedWalls = original
      .map((_, j) => original[n - 1 - j])
      .map((w, j) => ({
        id: w.id,
        from: orderedVertices[j].id,
        to: orderedVertices[(j + 1) % n].id,
      }));
  }

  const colorOf = new Map(walls.flatMap((w) => (w.color ? [[w.id, w.color] as const] : [])));
  const plan: Plan = {
    vertices: orderedVertices.map((v) => ({ ...v })),
    // chainWalls / the winding fix rebuild wall records, so colours are restored by id.
    walls: orderedWalls.map((w) => {
      const color = colorOf.get(w.id);
      return color ? { ...w, color } : w;
    }),
    rooms: [{ id: roomId, wallIds: orderedWalls.map((w) => w.id), height }],
    openings: [],
    nextId: readCounter(
      raw['nextId'],
      1 +
        maxIdNumber([
          ...vertices.map((v) => v.id),
          ...walls.map((w) => w.id),
          ...candidates.map((o) => o.id),
          roomId,
        ]),
    ),
  };
  if (validatePlan(plan, { subject: 'wall' }).length > 0) {
    return null;
  }
  for (const o of candidates) {
    plan.openings.push(o);
    if (validatePlan(plan, { subject: 'opening' }).length > 0) {
      plan.openings.pop();
    }
  }
  return plan.nextId > COMPACT_ID_AT ? compactIds(plan) : plan;
}
