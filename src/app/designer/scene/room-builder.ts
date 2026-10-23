import {
  BackSide,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Path,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
} from 'three';
import { autoDoorColor, SurfaceHit, SurfacePaint, SurfaceRef } from '../plan/paint';
import { offsetPolygon, Vec2 } from '../plan/polygon';
import { RoomShape, ShapeOpening } from '../plan/room-shape';
import {
  createCeilingMaterial,
  createDoorMaterial,
  createGlassMaterial,
  createMetalMaterial,
  createSubfloorMaterial,
  createTrimMaterial,
  createWallMaterial,
} from './materials';
import { HIGHLIGHT_COLOR, highlightIntensity } from './highlight';
import { SKIRTING_HEIGHT, WallLayout, wallLayout, WallMitre, wallMitres } from './wall-layout';

/** Wall thickness (metres), growing outward from the inner face. */
export const WALL_THICKNESS = 0.15;
export const FLOOR_THICKNESS = 0.014;
const SKIRTING_THICKNESS = 0.014;
const SUBFLOOR_DEPTH = 0.2;

const FRAME_BAR = 0.045;
const FRAME_DEPTH = 0.06;
/** Window frame and glass sit in the middle of the wall thickness. */
const FRAME_Z = -WALL_THICKNESS / 2 + 0.03;
const CASING_WIDTH = 0.07;
const CASING_DEPTH = 0.02;
const LEAF_THICKNESS = 0.04;
const LEAF_Z = -0.06;
const LEAF_LIFT = 0.012;
const HANDLE_HEIGHT = 1.0;

/** Used before the first paint arrives. */
const FALLBACK_WALL = '#efe9df';
const FALLBACK_DOOR = '#9a7049';

const SKY_RADIUS = 60;
const SKY_CENTER_Y = 1.5;
/** How far below the horizon the sky sphere reaches (radians); below that is the dark backdrop. */
const SKY_BELOW_HORIZON = 0.26;

function skyTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // The horizon sits at 0.5 on a sphere; the gradient bottom is the lowest visible band.
    const gradient = ctx.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, '#7fb2e0');
    gradient.addColorStop(0.38, '#cfe4f5');
    gradient.addColorStop(0.485, '#fff6e2');
    gradient.addColorStop(0.5, '#9fb57a');
    gradient.addColorStop(1, '#5f7a46');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 4, 256);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * Elevation of one wall, inner length x height, extruded outward from the inner face: local x runs
 * along the wall, local y up, and the wall occupies local z in [-thickness, 0] (z > 0 is the room).
 * Windows are holes; openings that reach the floor (doors) are notches in the bottom edge, as a
 * hole may not touch the outline.
 */
export function buildWallGeometry(
  wall: WallLayout,
  height: number,
  mitre: WallMitre = { start: 0, end: 0 },
): BufferGeometry {
  const notches = wall.openings.filter((o) => o.bottom <= 1e-6);
  const holes = wall.openings.filter((o) => o.bottom > 1e-6);
  const shape = new Shape();
  shape.moveTo(0, 0);
  for (const o of notches) {
    shape.lineTo(o.start, 0);
    shape.lineTo(o.start, o.top);
    shape.lineTo(o.end, o.top);
    shape.lineTo(o.end, 0);
  }
  shape.lineTo(wall.length, 0);
  shape.lineTo(wall.length, height);
  shape.lineTo(0, height);
  shape.closePath();
  for (const o of holes) {
    const hole = new Path();
    hole.moveTo(o.start, o.bottom);
    hole.lineTo(o.start, o.top);
    hole.lineTo(o.end, o.top);
    hole.lineTo(o.end, o.bottom);
    hole.closePath();
    shape.holes.push(hole);
  }
  const geometry = new ExtrudeGeometry(shape, { depth: WALL_THICKNESS, bevelEnabled: false });
  geometry.translate(0, 0, -WALL_THICKNESS);
  applyMitre(geometry, wall.length, mitre);
  return geometry;
}

/**
 * Slide the end faces along the wall so each is cut on the mitre plane through the inner corner
 * and the outer corner: neighbouring walls then meet on that plane and never overlap, so no face of
 * one wall is coplanar with a face of another (that z-fought once walls had different colours).
 */
function applyMitre(geometry: BufferGeometry, length: number, mitre: WallMitre): void {
  if (Math.abs(mitre.start) < 1e-9 && Math.abs(mitre.end) < 1e-9) {
    return;
  }
  const pos = geometry.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const depth = -pos.getZ(i) / WALL_THICKNESS;
    if (Math.abs(x) < 1e-9) {
      pos.setX(i, x + mitre.start * depth);
    } else if (Math.abs(x - length) < 1e-9) {
      pos.setX(i, x + mitre.end * depth);
    }
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
}

/** A flat polygon (scene x, z) at height `y`, facing down (ceilings). */
export function buildCeilingGeometry(outline: readonly Vec2[], y: number): BufferGeometry {
  const geometry = new ShapeGeometry(new Shape(outline.map((p) => new Vector2(p.x, p.y))));
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, y, 0);
  return geometry;
}

/** A vertical prism of the polygon (scene x, z) between y0 and y0 + height. */
export function buildPrismGeometry(
  polygon: readonly Vec2[],
  y0: number,
  height: number,
): BufferGeometry {
  const geometry = new ExtrudeGeometry(new Shape(polygon.map((p) => new Vector2(p.x, p.y))), {
    depth: height,
    bevelEnabled: false,
  });
  // Shape y becomes scene z, the extrusion (+z) becomes -y.
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, y0 + height, 0);
  return geometry;
}

/** Walls with real openings, ceiling, subfloor, skirting, frames, glass, doors and the sky. */
export class RoomBuilder {
  readonly group = new Group();

  private readonly ceilingMaterial = createCeilingMaterial('#f7f5f0');
  private readonly subfloorMaterial = createSubfloorMaterial();
  private readonly trimMaterial = createTrimMaterial();
  private readonly glassMaterial: MeshPhysicalMaterial = createGlassMaterial();
  private readonly metalMaterial = createMetalMaterial();
  private readonly skyTexture = skyTexture();
  private readonly skyMaterial = new MeshBasicMaterial({
    map: this.skyTexture,
    side: BackSide,
    toneMapped: false,
    fog: false,
    depthWrite: false,
  });
  private readonly skyGeometry = new SphereGeometry(
    SKY_RADIUS,
    32,
    16,
    0,
    Math.PI * 2,
    0,
    Math.PI / 2 + SKY_BELOW_HORIZON,
  );
  private readonly shell = new Group();
  private geometries: BufferGeometry[] = [];
  /** Per-surface materials of the current shell, keyed by wall id / door opening id. */
  private wallMaterials = new Map<string, MeshStandardMaterial>();
  private skirtingMaterials = new Map<string, MeshStandardMaterial>();
  private doorMaterials = new Map<string, MeshStandardMaterial>();
  private pickableMeshes: Mesh[] = [];
  private paint: SurfacePaint | null = null;
  private highlight: SurfaceRef | null = null;

  constructor() {
    const sky = new Mesh(this.skyGeometry, this.skyMaterial);
    sky.position.y = SKY_CENTER_Y;
    sky.renderOrder = -3;
    sky.frustumCulled = false;
    this.group.add(sky, this.shell);
  }

  /** The tagged meshes a tap can hit (flat list, rebuilt with the shell). */
  get pickables(): readonly Mesh[] {
    return this.pickableMeshes;
  }

  /** Surface materials alive: one per wall, per wall's skirting, per door, plus the ceiling. */
  get materialCount(): number {
    return this.wallMaterials.size + this.skirtingMaterials.size + this.doorMaterials.size + 1;
  }

  /** Set colours on the existing materials. Never touches geometry. */
  applyPaint(paint: SurfacePaint): void {
    this.paint = paint;
    const base = paint.base || FALLBACK_WALL;
    this.ceilingMaterial.color.set(paint.ceiling);
    for (const [id, material] of this.wallMaterials) {
      material.color.set(paint.walls[id] ?? base);
    }
    for (const [id, material] of this.skirtingMaterials) {
      material.color.set(paint.skirting[id] ?? paint.walls[id] ?? base);
    }
    for (const [id, material] of this.doorMaterials) {
      material.color.set(paint.doors[id] ?? autoDoorColor(base));
    }
  }

  /** Emissive tint on the selected surface (groups tint all members); null clears it. */
  setHighlight(ref: SurfaceRef | null): void {
    this.highlight = ref;
    this.applyHighlight();
  }

  private highlightTargets(ref: SurfaceRef): MeshStandardMaterial[] {
    const one = (m: MeshStandardMaterial | undefined) => (m ? [m] : []);
    switch (ref.kind) {
      case 'walls':
        return [...this.wallMaterials.values()];
      case 'wall':
        return one(this.wallMaterials.get(ref.id));
      case 'doors':
        return [...this.doorMaterials.values()];
      case 'door':
        return one(this.doorMaterials.get(ref.id));
      case 'skirting':
        return [...this.skirtingMaterials.values()];
      case 'ceiling':
        return [this.ceilingMaterial];
    }
  }

  private applyHighlight(): void {
    const ref = this.highlight;
    const targets = new Set(ref ? this.highlightTargets(ref) : []);
    const all = [
      this.ceilingMaterial,
      ...this.wallMaterials.values(),
      ...this.skirtingMaterials.values(),
      ...this.doorMaterials.values(),
    ];
    for (const material of all) {
      if (ref && targets.has(material)) {
        material.emissive.set(HIGHLIGHT_COLOR);
        material.emissiveIntensity = highlightIntensity(ref, `#${material.color.getHexString()}`);
      } else {
        material.emissive.set(0x000000);
        material.emissiveIntensity = 1;
      }
    }
  }

  /** Rebuild all geometry for the room. */
  setRoom(shape: RoomShape): void {
    this.clearShell();
    const { outline, height: H } = shape;
    const t = WALL_THICKNESS;
    const outer = offsetPolygon(outline, t);
    const inset = offsetPolygon(outline, -SKIRTING_THICKNESS);
    const walls = wallLayout(shape);
    const mitres = wallMitres(walls, outer);
    const n = outline.length;

    const wallIds = walls.map((wall) => shape.wallIds[wall.index] ?? `w${wall.index}`);
    walls.forEach((_wall, i) => {
      const material = createWallMaterial(FALLBACK_WALL);
      this.wallMaterials.set(wallIds[i], material);
    });

    for (const wall of walls) {
      const id = wallIds[wall.index];
      const wallMaterial = this.wallMaterials.get(id) as MeshStandardMaterial;
      const frame = this.addFrame(wall);
      this.addGeometry(
        frame,
        buildWallGeometry(wall, H, mitres[wall.index]),
        wallMaterial,
        true,
        true,
        {
          kind: 'wall',
          id,
        },
      );
      for (const o of wall.openings) {
        if (o.kind === 'door') {
          this.buildDoor(frame, o);
        } else {
          this.buildWindow(frame, o);
        }
      }
      for (const [from, to] of wall.skirting) {
        let skirtingMaterial = this.skirtingMaterials.get(id);
        if (!skirtingMaterial) {
          skirtingMaterial = createWallMaterial(FALLBACK_WALL);
          this.skirtingMaterials.set(id, skirtingMaterial);
        }
        const a = pointAlong(wall, from, 0);
        const b = pointAlong(wall, to, 0);
        const ia = from <= 1e-6 ? inset[wall.index] : pointAlong(wall, from, SKIRTING_THICKNESS);
        const ib =
          to >= wall.length - 1e-6
            ? inset[(wall.index + 1) % n]
            : pointAlong(wall, to, SKIRTING_THICKNESS);
        this.addGeometry(
          this.shell,
          buildPrismGeometry([a, b, ib, ia], 0, SKIRTING_HEIGHT),
          skirtingMaterial,
          true,
          true,
          { kind: 'skirting' },
        );
      }
    }

    this.addGeometry(
      this.shell,
      buildPrismGeometry(outer, -SUBFLOOR_DEPTH, SUBFLOOR_DEPTH),
      this.subfloorMaterial,
      false,
      true,
    );
    this.addGeometry(this.shell, buildCeilingGeometry(outer, H), this.ceilingMaterial, true, true, {
      kind: 'ceiling',
    });
    // New materials start at the fallback colour; paint and highlight carry over.
    if (this.paint) {
      this.applyPaint(this.paint);
    }
    this.applyHighlight();
  }

  dispose(): void {
    this.clearShell();
    this.ceilingMaterial.dispose();
    this.subfloorMaterial.dispose();
    this.trimMaterial.dispose();
    this.glassMaterial.dispose();
    this.metalMaterial.dispose();
    this.skyMaterial.dispose();
    this.skyGeometry.dispose();
    this.skyTexture.dispose();
  }

  private clearShell(): void {
    this.shell.clear();
    for (const geometry of this.geometries) {
      geometry.dispose();
    }
    this.geometries = [];
    this.pickableMeshes = [];
    for (const map of [this.wallMaterials, this.skirtingMaterials, this.doorMaterials]) {
      map.forEach((material) => material.dispose());
      map.clear();
    }
  }

  /** Group in the wall's frame: local x along the wall, y up, z into the room. */
  private addFrame(wall: WallLayout): Group {
    const frame = new Group();
    frame.position.set(wall.origin.x, 0, wall.origin.y);
    frame.rotation.y = -Math.atan2(wall.dir.y, wall.dir.x);
    this.shell.add(frame);
    return frame;
  }

  private buildWindow(frame: Group, o: ShapeOpening): void {
    const width = o.end - o.start;
    const height = o.top - o.bottom;
    const cx = (o.start + o.end) / 2;
    const cy = (o.top + o.bottom) / 2;
    const bar = FRAME_BAR;
    const m = this.trimMaterial;
    const z = FRAME_Z;
    this.addBox(frame, width, bar, FRAME_DEPTH, cx, o.top - bar / 2, z, m);
    this.addBox(frame, width, bar, FRAME_DEPTH, cx, o.bottom + bar / 2, z, m);
    this.addBox(frame, bar, height, FRAME_DEPTH, o.start + bar / 2, cy, z, m);
    this.addBox(frame, bar, height, FRAME_DEPTH, o.end - bar / 2, cy, z, m);
    // Sill board, protruding into the room.
    this.addBox(frame, width + 2 * bar + 0.06, 0.035, 0.2, cx, o.bottom - 0.0175, 0.1, m);
    if (width > 1) {
      this.addBox(frame, 0.03, height, 0.04, cx, cy, z, m);
    }
    if (height > 1) {
      this.addBox(frame, width, 0.03, 0.04, cx, cy, z, m);
    }
    const glass = new PlaneGeometry(width - 2 * bar, height - 2 * bar);
    this.addGeometry(frame, glass, this.glassMaterial, false, false).position.set(cx, cy, z);
  }

  /**
   * Closed door: casing on the room side, a leaf in the reveal and a lever handle. Leaf and casing
   * share one material (the door colour); the handle is metal. All three are tagged as the door.
   */
  private buildDoor(frame: Group, o: ShapeOpening): void {
    const width = o.end - o.start;
    const cx = (o.start + o.end) / 2;
    const cz = CASING_DEPTH / 2;
    const m = createDoorMaterial(FALLBACK_DOOR);
    this.doorMaterials.set(o.id, m);
    const tag: SurfaceHit = { kind: 'door', id: o.id };
    const casing = (w: number, h: number, x: number, y: number) =>
      this.addBox(frame, w, h, CASING_DEPTH, x, y, cz, m, tag);
    casing(
      CASING_WIDTH,
      o.top + CASING_WIDTH,
      o.start - CASING_WIDTH / 2,
      (o.top + CASING_WIDTH) / 2,
    );
    casing(
      CASING_WIDTH,
      o.top + CASING_WIDTH,
      o.end + CASING_WIDTH / 2,
      (o.top + CASING_WIDTH) / 2,
    );
    casing(width + 2 * CASING_WIDTH, CASING_WIDTH, cx, o.top + CASING_WIDTH / 2);

    const leafHeight = o.top - LEAF_LIFT;
    this.addBox(
      frame,
      width - 0.01,
      leafHeight,
      LEAF_THICKNESS,
      cx,
      LEAF_LIFT + leafHeight / 2,
      LEAF_Z,
      m,
      tag,
    );

    const faceZ = LEAF_Z + LEAF_THICKNESS / 2;
    const pivot = o.end - 0.07;
    const metal = this.metalMaterial;
    const rose = new CylinderGeometry(0.025, 0.025, 0.01, 16);
    rose.rotateX(Math.PI / 2);
    this.addGeometry(frame, rose, metal, true, false, tag).position.set(
      pivot,
      HANDLE_HEIGHT,
      faceZ + 0.005,
    );
    this.addBox(frame, 0.02, 0.02, 0.05, pivot, HANDLE_HEIGHT, faceZ + 0.03, metal, tag);
    this.addBox(frame, 0.13, 0.02, 0.02, pivot - 0.055, HANDLE_HEIGHT, faceZ + 0.055, metal, tag);
  }

  private addBox(
    parent: Group,
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    material: MeshStandardMaterial,
    surface?: SurfaceHit,
  ): Mesh {
    const mesh = this.addGeometry(
      parent,
      new BoxGeometry(width, height, depth),
      material,
      true,
      true,
      surface,
    );
    mesh.position.set(x, y, z);
    return mesh;
  }

  /** `surface` tags the mesh as pickable (a tap reports it). */
  private addGeometry(
    parent: Group,
    geometry: BufferGeometry,
    material: MeshStandardMaterial | MeshPhysicalMaterial | MeshBasicMaterial,
    cast: boolean,
    receive: boolean,
    surface?: SurfaceHit,
  ): Mesh {
    this.geometries.push(geometry);
    const mesh = new Mesh(geometry, material);
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    if (surface) {
      mesh.userData['surface'] = surface;
      this.pickableMeshes.push(mesh);
    }
    parent.add(mesh);
    return mesh;
  }
}

/** Scene point `u` metres along the wall, moved `inward` metres into the room. */
function pointAlong(wall: WallLayout, u: number, inward: number): Vec2 {
  return {
    x: wall.origin.x + wall.dir.x * u - wall.normal.x * inward,
    y: wall.origin.y + wall.dir.y * u - wall.normal.y * inward,
  };
}
