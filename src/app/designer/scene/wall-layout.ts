// Pure (three-free) layout of the room shell: per wall, where it starts, which way it runs, which
// openings it has and where the skirting runs. RoomBuilder turns this into meshes.

import { RoomShape, ShapeOpening } from '../plan/room-shape';
import { outwardNormal, Vec2 } from '../plan/polygon';

export const SKIRTING_HEIGHT = 0.07;
/** Windows with a sill below this also interrupt the skirting. */
const LOW_SILL = 0.08;

export interface WallLayout {
  /** Index of the edge outline[index] -> outline[index + 1]. */
  index: number;
  /** Start of the inner face, scene (x, z). */
  origin: Vec2;
  /** Unit vector along the inner face. */
  dir: Vec2;
  /** Unit outward normal. */
  normal: Vec2;
  /** Inner face length in metres. */
  length: number;
  /** Openings of this wall, sorted by start and clamped to [0, length]. */
  openings: ShapeOpening[];
  /** Metre ranges [from, to] along the wall where skirting runs (gaps at doors). */
  skirting: [number, number][];
}

export function wallLayout(shape: RoomShape): WallLayout[] {
  const n = shape.outline.length;
  return shape.outline.map((a, index) => {
    const b = shape.outline[(index + 1) % n];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const dir = length > 0 ? { x: (b.x - a.x) / length, y: (b.y - a.y) / length } : { x: 1, y: 0 };
    const openings = shape.openings
      .filter((o) => o.wall === index)
      .map((o) => ({ ...o, start: Math.max(0, o.start), end: Math.min(length, o.end) }))
      .filter((o) => o.end > o.start)
      .sort((p, q) => p.start - q.start);
    return {
      index,
      origin: { x: a.x, y: a.y },
      dir,
      normal: outwardNormal(a, b),
      length,
      openings,
      skirting: skirtingRuns(length, openings),
    };
  });
}

function skirtingRuns(length: number, openings: readonly ShapeOpening[]): [number, number][] {
  const runs: [number, number][] = [];
  let cursor = 0;
  for (const o of openings) {
    if (o.kind === 'window' && o.bottom >= LOW_SILL) {
      continue;
    }
    if (o.start > cursor + 1e-6) {
      runs.push([cursor, o.start]);
    }
    cursor = Math.max(cursor, o.end);
  }
  if (length > cursor + 1e-6) {
    runs.push([cursor, length]);
  }
  return runs;
}

/** How far each end of a wall's outer face sits beyond (+) or short of (-) its inner face end. */
export interface WallMitre {
  start: number;
  end: number;
}

/**
 * Mitre offsets per wall, from the outer polygon (the outline offset by the wall thickness), so
 * adjacent walls meet exactly on the plane through the inner and outer corner.
 */
export function wallMitres(walls: readonly WallLayout[], outer: readonly Vec2[]): WallMitre[] {
  const n = walls.length;
  const along = (wall: WallLayout, p: Vec2, from: Vec2) =>
    (p.x - from.x) * wall.dir.x + (p.y - from.y) * wall.dir.y;
  return walls.map((wall) => {
    const endVertex = {
      x: wall.origin.x + wall.dir.x * wall.length,
      y: wall.origin.y + wall.dir.y * wall.length,
    };
    return {
      start: along(wall, outer[wall.index], wall.origin),
      end: along(wall, outer[(wall.index + 1) % n], endVertex),
    };
  });
}
