import { hashSeed } from '../scene/random';
import {
  BBox,
  bbox,
  orientedRect,
  pointInPolygon,
  rectIntersectsPolygon,
  signedArea,
  Vec2,
} from '../plan/polygon';
import { PatternBounds, PatternGenerator, PatternParams, PlankPlacement } from './pattern';

/*
 * Pattern space: horizontal block of cell (i, j) sits at p = i*(B, B) + j*(L, -L) with
 * extent [0, L] x [0, B], B = planks per block x plank width; its vertical partner has
 * extent [-B, 0] x [0, L] relative to p. Each block is split into parallel strips (planks).
 * The staircase runs along (1, 1); rotating by -45 degrees puts that spine on +x, which is
 * "angle 0". The user angle then rotates counter-clockwise about the room centre.
 */

const SPINE_OFFSET = -Math.PI / 4;
const EDGE_EPSILON = 1e-6;

function wrapAngle(angle: number): number {
  return ((angle % 180) + 180) % 180;
}

/** Does the plank (shrunk by a hair so mere edge contact does not count) overlap the room? */
function touchesRoom(
  cx: number,
  cz: number,
  halfLength: number,
  halfWidth: number,
  rotation: number,
  outline: readonly Vec2[],
  box: BBox,
): boolean {
  const cos = Math.abs(Math.cos(rotation));
  const sin = Math.abs(Math.sin(rotation));
  const extentX = cos * halfLength + sin * halfWidth;
  const extentZ = sin * halfLength + cos * halfWidth;
  if (cx + extentX <= box.minX + EDGE_EPSILON || cx - extentX >= box.maxX - EDGE_EPSILON) {
    return false;
  }
  if (cz + extentZ <= box.minY + EDGE_EPSILON || cz - extentZ >= box.maxY - EDGE_EPSILON) {
    return false;
  }
  return rectIntersectsPolygon(
    orientedRect(cx, cz, halfLength - EDGE_EPSILON, halfWidth - EDGE_EPSILON, rotation),
    outline,
  );
}

/**
 * Coarse world-space grid classifying each cell as wholly inside, wholly outside, or near the
 * outline (within `reach` of an edge). A plank whose centre lies in an inside/outside cell cannot
 * touch the outline, so only near-boundary planks need the exact polygon test.
 */
class RoomGrid {
  static readonly INSIDE = 1;
  static readonly OUTSIDE = 0;
  static readonly NEAR = 2;
  private readonly cols: number;
  private readonly rows: number;
  private readonly cells: Uint8Array;

  constructor(
    private readonly box: BBox,
    private readonly size: number,
    outline: readonly Vec2[],
    reach: number,
  ) {
    this.cols = Math.max(1, Math.ceil(box.width / size));
    this.rows = Math.max(1, Math.ceil(box.height / size));
    this.cells = new Uint8Array(this.cols * this.rows);
    const n = outline.length;
    for (let e = 0; e < n; e++) {
      this.markEdge(outline[e], outline[(e + 1) % n], reach);
    }
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const idx = r * this.cols + c;
        if (this.cells[idx] === RoomGrid.NEAR) {
          continue;
        }
        const centre = {
          x: box.minX + (c + 0.5) * size,
          y: box.minY + (r + 0.5) * size,
        };
        this.cells[idx] = pointInPolygon(centre, outline) ? RoomGrid.INSIDE : RoomGrid.OUTSIDE;
      }
    }
  }

  classify(x: number, z: number): number {
    const c = Math.floor((x - this.box.minX) / this.size);
    const r = Math.floor((z - this.box.minY) / this.size);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) {
      return RoomGrid.NEAR; // outside the grid: let the exact test decide
    }
    return this.cells[r * this.cols + c];
  }

  private markEdge(a: Vec2, b: Vec2, reach: number): void {
    const { box, size } = this;
    const c0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - reach - box.minX) / size));
    const c1 = Math.min(this.cols - 1, Math.floor((Math.max(a.x, b.x) + reach - box.minX) / size));
    const r0 = Math.max(0, Math.floor((Math.min(a.y, b.y) - reach - box.minY) / size));
    const r1 = Math.min(this.rows - 1, Math.floor((Math.max(a.y, b.y) + reach - box.minY) / size));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const minX = box.minX + c * size - reach;
        const maxX = box.minX + (c + 1) * size + reach;
        const minY = box.minY + r * size - reach;
        const maxY = box.minY + (r + 1) * size + reach;
        if (segmentHitsBox(a, b, minX, minY, maxX, maxY)) {
          this.cells[r * this.cols + c] = RoomGrid.NEAR;
        }
      }
    }
  }
}

/** Liang-Barsky: does segment a-b intersect the axis-aligned box (boundary included)? */
function segmentHitsBox(
  a: Vec2,
  b: Vec2,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const p = [-dx, dx, -dy, dy];
  const q = [a.x - minX, maxX - a.x, a.y - minY, maxY - a.y];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) {
        return false;
      }
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        t0 = Math.max(t0, t);
      } else {
        t1 = Math.min(t1, t);
      }
      if (t0 > t1) {
        return false;
      }
    }
  }
  return true;
}

function generate(params: PatternParams, bounds: PatternBounds): PlankPlacement[] {
  const length = params.plankLength / 1000;
  const width = params.plankWidth / 1000;
  const outline = bounds.outline;
  const strips = Math.max(1, Math.round(params.planksPerBlock ?? 1));
  // Herringbone lattice cells are blocks of `strips` parallel planks, length x block width.
  const block = width * strips;
  if (
    !(length > 0) ||
    !(width > 0) ||
    !Number.isFinite(strips) ||
    outline.length < 3 ||
    !outline.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)) ||
    !(Math.abs(signedArea(outline)) > 0) ||
    !Number.isFinite(params.angle)
  ) {
    return [];
  }

  const rotation = SPINE_OFFSET + (wrapAngle(params.angle) * Math.PI) / 180;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const box = bbox(outline);

  // Outline corners in pattern space (inverse rotation), padded by one plank.
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (const { x, y: z } of outline) {
    const u = x * cos + z * sin;
    const v = -x * sin + z * cos;
    minU = Math.min(minU, u);
    maxU = Math.max(maxU, u);
    minV = Math.min(minV, v);
    maxV = Math.max(maxV, v);
  }
  const pad = length + block;
  minU -= pad;
  maxU += pad;
  minV -= pad;
  maxV += pad;

  // u = i*B + j*L, v = i*B - j*L (B = block width)  =>  i = (u + v) / 2B, j = (u - v) / 2L.
  let minI = Infinity;
  let maxI = -Infinity;
  let minJ = Infinity;
  let maxJ = -Infinity;
  for (const [u, v] of [
    [minU, minV],
    [minU, maxV],
    [maxU, minV],
    [maxU, maxV],
  ]) {
    const i = (u + v) / (2 * block);
    const j = (u - v) / (2 * length);
    minI = Math.min(minI, i);
    maxI = Math.max(maxI, i);
    minJ = Math.min(minJ, j);
    maxJ = Math.max(maxJ, j);
  }

  const placements: PlankPlacement[] = [];
  const halfLength = length / 2;
  const halfWidth = width / 2;
  // Any plank lies within its half-diagonal of its centre; add slack for the epsilon shrink.
  const reach = Math.hypot(halfLength, halfWidth) + 1e-3;
  const gridSize = Math.max(2 * reach, Math.max(box.width, box.height) / 400);
  const grid = new RoomGrid(box, gridSize, outline, reach);

  const emit = (
    cu: number,
    cv: number,
    planeAngle: number,
    i: number,
    j: number,
    kind: number,
    strip: number,
  ) => {
    const x = cu * cos - cv * sin;
    const z = cu * sin + cv * cos;
    const plankRotation = rotation + planeAngle;
    const zone = grid.classify(x, z);
    if (zone === RoomGrid.OUTSIDE) {
      return;
    }
    if (
      zone === RoomGrid.NEAR &&
      !touchesRoom(x, z, halfLength, halfWidth, plankRotation, outline, box)
    ) {
      return;
    }
    placements.push({
      x,
      z,
      rotation: plankRotation,
      length,
      width,
      seed: hashSeed(i, j, kind, strip),
    });
  };

  for (let i = Math.floor(minI); i <= Math.ceil(maxI); i++) {
    for (let j = Math.floor(minJ); j <= Math.ceil(maxJ); j++) {
      const pu = i * block + j * length;
      const pv = i * block - j * length;
      for (let k = 0; k < strips; k++) {
        const offset = (k + 0.5) * width;
        // Horizontal block: strips stacked along v. Vertical block: strips stacked along u.
        emit(pu + halfLength, pv + offset, 0, i, j, 0, k);
        emit(pu - block + offset, pv + halfLength, Math.PI / 2, i, j, 1, k);
      }
    }
  }
  return placements;
}

export const herringbone: PatternGenerator = {
  id: 'herringbone',
  angleRange: { min: 0, max: 179 },
  generate,
};
