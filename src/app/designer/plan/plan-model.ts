// Plan data model and limits (plan custom-room-shape.md, C2 and C3). Three-free, Angular-free.
//
// CONTRACT FILE. Frozen for parallel tracks: change only through the main session.
//
// Coordinates are metres on the INNER face of the walls. Plan x is right and y is down (same as
// SVG); they map 1:1 to the scene (x, z). Wall thickness is a scene constant and grows outward.

/** A point in metres. */
export interface Vec2 {
  x: number;
  y: number;
}

export interface PlanVertex {
  /** `v<n>`, unique within the plan. */
  id: string;
  x: number;
  y: number;
}

export interface PlanWall {
  /** `w<n>`, unique within the plan. */
  id: string;
  /** Vertex ids. For the room loop, `from` -> `to` always follows the loop direction. */
  from: string;
  to: string;
}

export interface PlanRoom {
  /** `r<n>` */
  id: string;
  /** Closed loop of wall ids, in loop order (see the canonical form on `Plan`). */
  wallIds: string[];
  /** Ceiling height in metres. */
  height: number;
}

export type OpeningKind = 'door' | 'window';
export type OpeningAnchor = 'floor' | 'ceiling';

export interface PlanOpening {
  /** `o<n>`, unique within the plan. */
  id: string;
  wallId: string;
  kind: OpeningKind;
  /** Metres along the wall's inner face from its `from` corner to the opening's near edge. */
  offset: number;
  width: number;
  height: number;
  /** Bottom above the floor. Always 0 for doors. */
  sill: number;
  /**
   * Which gap stays fixed when the window or room height changes (C4). Doors are always 'floor'.
   * The gap to the ceiling is derived: `roomHeight - sill - height`.
   */
  anchor: OpeningAnchor;
}

/**
 * The editable room plan.
 *
 * Canonical form (always true for plans produced by `sanitizePlan`, `rectangleToPlan` and the
 * edit operations; `planLoop` returns null otherwise):
 * - exactly one room, whose `wallIds` list EVERY wall once, in loop order;
 * - `walls[k].to === walls[k + 1].from` around the loop, so wall k runs from loop vertex k to
 *   loop vertex k + 1, i.e. `RoomShape.outline[k] -> outline[k + 1]` (same index as `wall`);
 * - the loop has a positive shoelace area (counter-clockwise in a y-up frame, clockwise on screen);
 * - the outward normal of the edge a -> b is `normalize(dy, -dx)`.
 * The order of the `vertices` / `walls` arrays themselves is irrelevant; use `planLoop`.
 */
export interface Plan {
  vertices: PlanVertex[];
  walls: PlanWall[];
  rooms: PlanRoom[];
  openings: PlanOpening[];
  /** Counter for new ids (`v12`, `w13`, `o14`: one shared counter). */
  nextId: number;
}

/** Editable numeric/enum fields of an opening (used by `updateOpening`). */
export interface OpeningFields {
  offset: number;
  width: number;
  height: number;
  sill: number;
  anchor: OpeningAnchor;
}

/** Patch for `updateOpening`; `topGap` (gap to the ceiling) is the UI's alternative to `sill`. */
export type OpeningPatch = Partial<OpeningFields> & { topGap?: number };

/** Limits from C3. Metres unless noted. */
export const PLAN_LIMITS = {
  corners: { min: 3, max: 32 },
  /** Shortest wall (inner face). */
  wallLengthMin: 0.3,
  /** Interior angle range in degrees; 180 is allowed. */
  angleDeg: { min: 30, max: 330 },
  /** Minimum distance between non-adjacent walls. */
  clearance: 0.3,
  /** Maximum bounding box side. */
  bboxMax: 20,
  /** m2 */
  area: { min: 2, max: 144 },
  /** Same range as the simple room's height (`LIMITS.roomHeight`, which imports this). */
  height: { min: 2.2, max: 4 },
  door: {
    width: { min: 0.6, max: 2.4 },
    heightMin: 1.8,
    /** Door height <= room height - this. */
    headroom: 0.05,
  },
  window: {
    width: { min: 0.3, max: 4 },
    heightMin: 0.3,
    /** Window height <= room height - this. */
    headroom: 0.1,
    /** Gap above the window (room height - sill - height) >= this. */
    topGapMin: 0.05,
  },
  /** Opening distance from either corner of its wall. */
  openingMargin: 0.05,
  /** Gap between two openings on the same wall. */
  openingGap: 0.05,
  maxOpenings: 32,
  /** Grid snap in metres. */
  grid: 0.1,
  /** Stored precision: coordinates and sizes are rounded to this. */
  mm: 0.001,
  /** Sanitize clamps stored coordinates to +-this. */
  coordMax: 50,
  /** Walls within this many degrees of parallel are treated as parallel (push/pull, C5). */
  parallelDeg: 5,
  /** Angle snap threshold in degrees (C5). */
  angleSnapDeg: 5,
} as const;

/** Default opening sizes (C5). Window height/sill are further limited by the room height. */
export const OPENING_DEFAULTS = {
  door: { width: 0.9, height: 2.1 },
  window: { width: 1.2, height: 1.4, sill: 0.9 },
} as const;

/** Ids: one letter plus up to six digits. Sanitize enforces this on stored data. */
export const ID_PATTERN = /^[vwor]\d{1,6}$/;

/** Largest id number (and `nextId`) that still matches `ID_PATTERN`. */
export const MAX_ID_NUMBER = 999_999;

/** Slack for float comparison of limits (values are stored in whole millimetres). */
export const LIMIT_EPS = 1e-6;

export function roundMm(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Error codes; UX maps them to copy. */
export type PlanErrorCode =
  | 'self-intersection'
  | 'wall-too-short'
  | 'angle-too-sharp'
  | 'walls-too-close'
  | 'too-many-corners'
  | 'too-few-corners'
  | 'too-large'
  | 'area-out-of-range'
  | 'height-out-of-range'
  /** Ceiling lower than a door or window allows; the plan is never shrunk silently (see `minPlanHeight`). */
  | 'ceiling-too-low'
  /** Door/window width, height or sill outside its limits (typed value; revert + "Use {min} to {max}"). */
  | 'opening-size-out-of-range'
  /** An opening does not fit on its wall (wall edit: "Too short for its door or window"). */
  | 'opening-does-not-fit'
  | 'openings-overlap'
  | 'too-many-openings'
  /** Broken references / not canonical / non-finite input; not user-reachable through the editor. */
  | 'invalid-structure';

/** What the rejected edit was applied to. Drives the copy of context-dependent codes. */
export type EditSubject = 'wall' | 'corner' | 'opening';

export interface PlanError {
  code: PlanErrorCode;
  /**
   * What the rejected edit was applied to: a wall edit (move wall, set length), a corner edit
   * (move, insert, delete corner) or an opening edit (add, update). For example
   * `opening-does-not-fit` with subject 'wall'/'corner' means "Too short for its door or
   * window", with subject 'opening' it means "Doesn't fit on this wall".
   */
  subject: EditSubject;
  /** Id of the edited wall / corner / opening (the thing the user touched). */
  subjectId?: string;
  /** The wall the offending condition is on (for highlighting). */
  wallId?: string;
  vertexId?: string;
  openingId?: string;
}

/** Passed to `validatePlan` so errors carry the edit context. */
export interface ErrorContext {
  subject: EditSubject;
  subjectId?: string;
}

export type EditResult = { ok: true; plan: Plan } | { ok: false; errors: PlanError[] };

/** The room loop of a canonical plan, in loop order. */
export interface PlanLoop {
  room: PlanRoom;
  /** vertices[k] is the `from` vertex of walls[k]. */
  vertices: PlanVertex[];
  walls: PlanWall[];
}

/** Resolve the canonical loop, or null when the plan is not canonical (see `Plan`). */
export function planLoop(plan: Plan): PlanLoop | null {
  if (plan.rooms.length !== 1) {
    return null;
  }
  const room = plan.rooms[0];
  const n = room.wallIds.length;
  if (n < 3 || n !== plan.walls.length) {
    return null;
  }
  const wallById = new Map(plan.walls.map((w) => [w.id, w]));
  const vertexById = new Map(plan.vertices.map((v) => [v.id, v]));
  const walls: PlanWall[] = [];
  const vertices: PlanVertex[] = [];
  for (const id of room.wallIds) {
    const wall = wallById.get(id);
    const vertex = wall && vertexById.get(wall.from);
    if (!wall || !vertex) {
      return null;
    }
    walls.push(wall);
    vertices.push(vertex);
  }
  for (let k = 0; k < n; k++) {
    if (walls[k].to !== walls[(k + 1) % n].from || !vertexById.has(walls[k].to)) {
      return null;
    }
  }
  if (new Set(room.wallIds).size !== n || new Set(vertices.map((v) => v.id)).size !== n) {
    return null;
  }
  return { room, vertices, walls };
}

/** Loop corner points in loop order, or null when the plan is not canonical. */
export function loopPoints(plan: Plan): Vec2[] | null {
  const loop = planLoop(plan);
  return loop ? loop.vertices.map((v) => ({ x: v.x, y: v.y })) : null;
}

/** Inner length of a wall in metres, or 0 if unknown. */
export function wallLength(plan: Plan, wallId: string): number {
  const wall = plan.walls.find((w) => w.id === wallId);
  const a = wall && plan.vertices.find((v) => v.id === wall.from);
  const b = wall && plan.vertices.find((v) => v.id === wall.to);
  return a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
}

/** Largest window height for a room height. */
export function windowMaxHeight(roomHeight: number): number {
  return roomHeight - PLAN_LIMITS.window.headroom;
}

/** Largest door height for a room height. */
export function doorMaxHeight(roomHeight: number): number {
  return roomHeight - PLAN_LIMITS.door.headroom;
}

/** Largest window sill for a window height and room height. */
export function windowMaxSill(roomHeight: number, windowHeight: number): number {
  return roomHeight - windowHeight - PLAN_LIMITS.window.topGapMin;
}
