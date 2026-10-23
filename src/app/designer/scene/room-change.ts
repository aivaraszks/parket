import { RoomShape } from '../plan/room-shape';

/** What a room update invalidates; keeps the costly herringbone rebuild to real outline changes. */
export interface RoomChange {
  /** Walls, openings, ceiling, lighting and camera fit. */
  shell: boolean;
  /** Floor stencil mask and door thresholds (cheap). */
  mask: boolean;
  /** Plank placements (expensive): only the outline feeds the pattern generators. */
  placements: boolean;
}

function sameOutline(a: RoomShape['outline'], b: RoomShape['outline']): boolean {
  return a.length === b.length && a.every((p, i) => p.x === b[i].x && p.y === b[i].y);
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

function sameOpenings(a: RoomShape['openings'], b: RoomShape['openings']): boolean {
  return (
    a.length === b.length &&
    a.every((o, i) => {
      const p = b[i];
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

/** Compare the shape the scene last built with the new one. A null `prev` means everything. */
export function diffRoom(prev: RoomShape | null, next: RoomShape): RoomChange {
  if (!prev) return { shell: true, mask: true, placements: true };
  const outline = !sameOutline(prev.outline, next.outline);
  const openings = !sameOpenings(prev.openings, next.openings);
  // Wall ids key the per-wall materials, so a renamed wall needs a shell rebuild (not a floor one).
  const ids = !sameIds(prev.wallIds, next.wallIds);
  return {
    shell: outline || openings || ids || prev.height !== next.height,
    mask: outline || openings,
    placements: outline,
  };
}
