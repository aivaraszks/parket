import type { Vec2 } from '../plan/polygon';

/**
 * Coordinates: the room is centred on the origin in the x/z plane (metres). Outline points are
 * (x, z) pairs, see `RoomShape`.
 */
export interface PatternParams {
  /** Plank length in mm. */
  plankLength: number;
  /** Plank width in mm. */
  plankWidth: number;
  /** Parallel planks per herringbone block (1 = classic herringbone). Defaults to 1. */
  planksPerBlock?: number;
  /** User rotation in degrees; generators wrap it into their own range. */
  angle: number;
}

export interface PatternBounds {
  /** Inner room outline (any simple polygon), centred on the bounding-box centre. */
  outline: readonly Vec2[];
}

export interface PlankPlacement {
  /** Plank centre, metres. */
  x: number;
  z: number;
  /**
   * Angle of the plank's length axis from +x towards +z, in radians (math convention in
   * the x/z plane). For three.js use `mesh.rotation.y = -rotation`.
   */
  rotation: number;
  /** Metres. */
  length: number;
  width: number;
  /** Stable per-plank seed (depends on the pattern lattice, not on the angle). */
  seed: number;
}

export interface PatternGenerator {
  readonly id: string;
  readonly angleRange: { readonly min: number; readonly max: number };
  generate(params: PatternParams, bounds: PatternBounds): PlankPlacement[];
}
