// Scene contract (plan C11): what the 3D scene, estimate and camera know about the room.
// Three-free.
//
// CONTRACT FILE. Frozen for parallel tracks: change only through the main session.

import type { Design, Room } from '../state/design-defaults';
import { bbox, perimeter, signedArea } from './polygon';
import { SIMPLE_WALL_IDS } from './paint';
import { loopPoints, PlanOpening, roundMm, Vec2, planLoop } from './plan-model';

/**
 * A door or window in a wall.
 *
 * Doors are CLOSED doors (plan answer Q3): the renderer builds the frame (casing) plus a door leaf
 * filling the opening between `bottom` (= 0) and `top`, so the data is just the rectangle. The
 * leaf, handle and frame depth are scene constants. Windows get frame, sill board and glass.
 */
export interface ShapeOpening {
  /** Plan opening id (`o12`), or `window` for the fixed simple-mode window. Stable across edits. */
  id: string;
  kind: 'door' | 'window';
  /** Index i of the edge `outline[i] -> outline[i + 1]` this opening is in. */
  wall: number;
  /** Metres along the wall's inner face from `outline[i]`; start < end. */
  start: number;
  end: number;
  /** Heights above the floor: doors bottom = 0; windows bottom = sill. bottom < top <= height. */
  bottom: number;
  top: number;
}

export interface RoomShape {
  /**
   * Inner outline in metres (scene x, z), positive winding, centred on the bounding-box centre
   * so the scene origin is the middle of the room. Edge i runs outline[i] -> outline[i + 1].
   * Outward normal of an edge a -> b is normalize(dy, -dx) (y here is scene z).
   */
  outline: readonly Vec2[];
  /**
   * Wall ids, parallel to `outline`: wall i runs outline[i] -> outline[i + 1]. Custom mode uses
   * the plan wall ids; simple mode the fixed ids `s0`..`s3` (`SIMPLE_WALL_IDS`). They are the
   * keys of `SurfacePaint.walls`.
   */
  wallIds: readonly string[];
  /** Ceiling height in metres. */
  height: number;
  openings: readonly ShapeOpening[];
}

/** The fixed simple-mode window in wall 0 (the -z wall), as plan opening fields. */
export interface FixedWindow {
  /** Metres from the wall's `from` corner to the near edge. */
  offset: number;
  width: number;
  height: number;
  sill: number;
}

const SIMPLE_SILL = 0.85;

/** The single fixed window of the simple rectangle room: centred in the long (-z) wall. */
export function windowFor(room: Pick<Room, 'length' | 'height'>): FixedWindow {
  const width = roundMm(Math.min(1.8, Math.max(0.8, room.length * 0.35)));
  const top = Math.min(SIMPLE_SILL + 1.45, room.height - 0.3);
  return {
    offset: roundMm((room.length - width) / 2),
    width,
    height: roundMm(top - SIMPLE_SILL),
    sill: SIMPLE_SILL,
  };
}

function simpleShape(room: Room): RoomShape {
  const hx = room.length / 2;
  const hy = room.width / 2;
  const w = windowFor(room);
  return {
    outline: [
      { x: -hx, y: -hy },
      { x: hx, y: -hy },
      { x: hx, y: hy },
      { x: -hx, y: hy },
    ],
    wallIds: SIMPLE_WALL_IDS,
    height: room.height,
    openings: [
      {
        id: 'window',
        kind: 'window',
        wall: 0,
        start: w.offset,
        end: w.offset + w.width,
        bottom: w.sill,
        top: w.sill + w.height,
      },
    ],
  };
}

function customShape(design: Pick<Design, 'plan'>): RoomShape | null {
  const plan = design.plan;
  const loop = plan && planLoop(plan);
  const points = plan && loopPoints(plan);
  if (!plan || !loop || !points || signedArea(points) <= 0) {
    return null;
  }
  const center = bbox(points).center;
  const wallIndex = new Map(loop.walls.map((w, i) => [w.id, i]));
  const toOpening = (o: PlanOpening): ShapeOpening | null => {
    const wall = wallIndex.get(o.wallId);
    return wall === undefined
      ? null
      : {
          id: o.id,
          kind: o.kind,
          wall,
          start: o.offset,
          end: o.offset + o.width,
          bottom: o.kind === 'door' ? 0 : o.sill,
          top: (o.kind === 'door' ? 0 : o.sill) + o.height,
        };
  };
  return {
    outline: points.map((p) => ({ x: p.x - center.x, y: p.y - center.y })),
    wallIds: loop.walls.map((w) => w.id),
    height: loop.room.height,
    openings: plan.openings.map(toOpening).filter((o): o is ShapeOpening => o !== null),
  };
}

/**
 * The active mode as a RoomShape. Custom mode with a missing or broken plan falls back to the
 * simple room, so the result is always drawable.
 */
export function toRoomShape(design: Pick<Design, 'mode' | 'room' | 'plan'>): RoomShape {
  return (design.mode === 'custom' ? customShape(design) : null) ?? simpleShape(design.room);
}

/** Structural equality, used to memoise the `roomShape` signal. */
export function roomShapesEqual(a: RoomShape, b: RoomShape): boolean {
  return (
    a.height === b.height &&
    a.outline.length === b.outline.length &&
    a.outline.every((p, i) => p.x === b.outline[i].x && p.y === b.outline[i].y) &&
    a.wallIds.length === b.wallIds.length &&
    a.wallIds.every((id, i) => id === b.wallIds[i]) &&
    a.openings.length === b.openings.length &&
    a.openings.every((o, i) => {
      const p = b.openings[i];
      return (
        o.id === p.id &&
        o.kind === p.kind &&
        o.wall === p.wall &&
        o.start === p.start &&
        o.end === p.end &&
        o.bottom === p.bottom &&
        o.top === p.top
      );
    })
  );
}

/** Floor area in m2 (the outline has positive winding). */
export function shapeArea(shape: RoomShape): number {
  return Math.round(signedArea(shape.outline) * 1e9) / 1e9;
}

/** Skirting length in metres: the perimeter minus the width of every door. */
export function shapeSkirtingLength(shape: RoomShape): number {
  const doors = shape.openings
    .filter((o) => o.kind === 'door')
    .reduce((sum, o) => sum + (o.end - o.start), 0);
  return Math.max(0, perimeter(shape.outline) - doors);
}
