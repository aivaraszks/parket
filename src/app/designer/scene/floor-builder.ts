import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
} from 'three';
import { PlankPlacement } from '../patterns/pattern';
import { RoomShape } from '../plan/room-shape';
import { Finish } from '../state/design-defaults';
import { Species } from '../state/species';
import {
  applyFinish,
  createFloorMaskMaterial,
  createFloorMaterial,
  createThresholdMaterial,
  setFloorMap,
} from './materials';
import { FLOOR_THICKNESS, WALL_THICKNESS } from './room-builder';
import { wallLayout } from './wall-layout';
import { AtlasSize, atlasSize, paintAtlas, UvRect, VARIANT_COUNT, variantUv } from './wood-texture';

/** Above this many planks the chamfers are dropped (flat tops) to keep phones smooth. */
export const FLAT_TOP_PLANK_LIMIT = 8000;
const SEAM_GAP = 0.0006;
const CHAMFER = 0.0016;
const HEADROOM = 1.25;
const THRESHOLD_HEIGHT = FLOOR_THICKNESS + 0.002;
/** How far the threshold strip reaches into the room, over the cut line of the planks. */
const THRESHOLD_INSET = 0.03;

/** Floor-level polygon (scene x, z) as a flat mesh facing up; the stencil mask geometry. */
export function buildMaskGeometry(outline: readonly { x: number; y: number }[]): BufferGeometry {
  // Shape y runs along -z so that rotating by -90 degrees about x lays it flat at x/z.
  const shape = new Shape(outline.map((p) => new Vector2(p.x, -p.y)));
  const geometry = new ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

type Point = [number, number, number];

interface Ring {
  hx: number;
  hz: number;
  y: number;
  shade: number;
}

/**
 * One plank: top face, four 45 degree chamfers and four sides (no bottom), centred on the
 * origin with the length along x. Vertex colours darken the edges to fake contact shadow.
 */
export function buildPlankGeometry(
  length: number,
  width: number,
  uv: UvRect,
  chamfer: boolean,
): BufferGeometry {
  const hx = (length - SEAM_GAP) / 2;
  const hz = (width - SEAM_GAP) / 2;
  const c = chamfer ? CHAMFER : 0;
  const bottom: Ring = { hx, hz, y: 0, shade: 0.3 };
  const shoulder: Ring = { hx, hz, y: FLOOR_THICKNESS - c, shade: chamfer ? 0.62 : 0.78 };
  const top: Ring = { hx: hx - c, hz: hz - c, y: FLOOR_THICKNESS, shade: 1 };

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];

  const vertex = (x: number, y: number, z: number, n: Vector3, shade: number) => {
    positions.push(x, y, z);
    normals.push(n.x, n.y, n.z);
    uvs.push(
      uv.u0 + (x / length + 0.5) * (uv.u1 - uv.u0),
      uv.v0 + (z / width + 0.5) * (uv.v1 - uv.v0),
    );
    colors.push(shade, shade, shade);
  };

  const a = new Vector3();
  const b = new Vector3();
  const quad = (points: Point[], shades: number[], n: Vector3) => {
    // Make the winding agree with the intended normal.
    a.set(points[1][0] - points[0][0], points[1][1] - points[0][1], points[1][2] - points[0][2]);
    b.set(points[2][0] - points[0][0], points[2][1] - points[0][1], points[2][2] - points[0][2]);
    const flip = a.cross(b).dot(n) < 0;
    const order = flip ? [0, 3, 2, 0, 2, 1] : [0, 1, 2, 0, 2, 3];
    for (const i of order) {
      const p = points[i];
      vertex(p[0], p[1], p[2], n, shades[i]);
    }
  };

  const band = (from: Ring, to: Ring) => {
    const sides: [number, number, Vector3][] = [
      [1, 0, new Vector3(1, 0, 0)],
      [-1, 0, new Vector3(-1, 0, 0)],
      [0, 1, new Vector3(0, 0, 1)],
      [0, -1, new Vector3(0, 0, -1)],
    ];
    const slope = to.y - from.y;
    for (const [sx, sz, outward] of sides) {
      const n = outward.clone();
      if (from.hx !== to.hx || from.hz !== to.hz) {
        n.y = 1;
        n.normalize();
      }
      // Points along the edge, at the lower and upper ring.
      const edge = (ring: Ring): Point[] =>
        sx !== 0
          ? [
              [sx * ring.hx, ring.y, -ring.hz],
              [sx * ring.hx, ring.y, ring.hz],
            ]
          : [
              [-ring.hx, ring.y, sz * ring.hz],
              [ring.hx, ring.y, sz * ring.hz],
            ];
      if (slope <= 0) continue;
      const lower = edge(from);
      const upper = edge(to);
      quad(
        [lower[0], lower[1], upper[1], upper[0]],
        [from.shade, from.shade, to.shade, to.shade],
        n,
      );
    }
  };

  band(bottom, shoulder);
  if (chamfer) band(shoulder, top);
  const up = new Vector3(0, 1, 0);
  quad(
    [
      [-top.hx, top.y, -top.hz],
      [-top.hx, top.y, top.hz],
      [top.hx, top.y, top.hz],
      [top.hx, top.y, -top.hz],
    ],
    [1, 1, 1, 1],
    up,
  );

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return geometry;
}

/** Instanced planks: one InstancedMesh per grain variant sharing one material and atlas. */
export class FloorBuilder {
  readonly group = new Group();
  readonly material: MeshPhysicalMaterial = createFloorMaterial();

  private readonly canvas = document.createElement('canvas');
  private readonly size: AtlasSize;
  private texture: CanvasTexture | null = null;
  private species: Species | null = null;
  private placements: PlankPlacement[] = [];
  private meshes: (InstancedMesh | null)[] = new Array<InstancedMesh | null>(VARIANT_COUNT).fill(
    null,
  );
  private capacities: number[] = new Array<number>(VARIANT_COUNT).fill(0);
  private geometries: (BufferGeometry | null)[] = new Array<BufferGeometry | null>(
    VARIANT_COUNT,
  ).fill(null);
  private geometryKey = '';
  private readonly maskMaterial: MeshBasicMaterial = createFloorMaskMaterial();
  private readonly thresholdMaterial: MeshStandardMaterial = createThresholdMaterial();
  private roomParts = new Group();
  private readonly dummy = new Object3D();
  private readonly color = new Color();

  constructor(
    lowMemory: boolean,
    private readonly maxAnisotropy: number,
  ) {
    this.size = atlasSize(lowMemory);
  }

  /** Rebuild the stencil mask (the room outline) and the door thresholds. */
  setRoom(shape: RoomShape): void {
    this.clearRoomParts();
    const mask = new Mesh(buildMaskGeometry(shape.outline), this.maskMaterial);
    mask.position.y = FLOOR_THICKNESS;
    mask.renderOrder = -1;
    mask.frustumCulled = false;
    this.roomParts.add(mask);

    for (const wall of wallLayout(shape)) {
      for (const door of wall.openings.filter((o) => o.kind === 'door')) {
        const width = door.end - door.start;
        const depth = WALL_THICKNESS + THRESHOLD_INSET;
        const strip = new Mesh(
          new BoxGeometry(width, THRESHOLD_HEIGHT, depth),
          this.thresholdMaterial,
        );
        // Wall frame: local x along the wall, local z pointing into the room.
        const along = (door.start + door.end) / 2;
        strip.position.set(
          wall.origin.x + wall.dir.x * along,
          THRESHOLD_HEIGHT / 2,
          wall.origin.y + wall.dir.y * along,
        );
        strip.rotation.y = -Math.atan2(wall.dir.y, wall.dir.x);
        strip.translateZ((THRESHOLD_INSET - WALL_THICKNESS) / 2);
        strip.receiveShadow = true;
        this.roomParts.add(strip);
      }
    }
    this.group.add(this.roomParts);
  }

  setFinish(finish: Finish): void {
    applyFinish(this.material, finish);
  }

  setSpecies(species: Species): void {
    this.species = species;
    paintAtlas(this.canvas, species, this.size);
    if (!this.texture) {
      const texture = new CanvasTexture(this.canvas);
      texture.colorSpace = SRGBColorSpace;
      texture.anisotropy = this.maxAnisotropy;
      texture.minFilter = LinearMipmapLinearFilter;
      this.texture = texture;
      setFloorMap(this.material, texture);
    } else {
      this.texture.needsUpdate = true;
    }
    this.applyInstances();
  }

  /** Replace all planks. Placements share one size (every generator emits equal planks). */
  setPlacements(placements: PlankPlacement[]): void {
    this.placements = placements;
    this.applyInstances();
  }

  dispose(): void {
    this.clearRoomParts();
    this.maskMaterial.dispose();
    this.thresholdMaterial.dispose();
    for (const mesh of this.meshes) {
      mesh?.dispose();
    }
    for (const geometry of this.geometries) {
      geometry?.dispose();
    }
    this.group.clear();
    this.texture?.dispose();
    this.material.dispose();
    this.meshes.fill(null);
    this.geometries.fill(null);
  }

  private clearRoomParts(): void {
    this.group.remove(this.roomParts);
    this.roomParts.traverse((object) => {
      if (object instanceof Mesh) {
        object.geometry.dispose();
      }
    });
    this.roomParts = new Group();
  }

  private ensureGeometries(length: number, width: number, flat: boolean): void {
    const key = `${length}|${width}|${flat}`;
    if (key === this.geometryKey) return;
    this.geometryKey = key;
    for (let v = 0; v < VARIANT_COUNT; v++) {
      this.geometries[v]?.dispose();
      this.geometries[v] = buildPlankGeometry(
        length,
        width,
        variantUv(v, this.size, length / width),
        !flat,
      );
      // Meshes keep the old geometry reference until recreated below.
      const mesh = this.meshes[v];
      if (mesh) {
        mesh.geometry = this.geometries[v]!;
      }
    }
  }

  private applyInstances(): void {
    const species = this.species;
    const placements = this.placements;
    if (!species || placements.length === 0) {
      for (const mesh of this.meshes) {
        if (mesh) mesh.count = 0;
      }
      return;
    }
    const { length, width } = placements[0];
    this.ensureGeometries(length, width, placements.length > FLAT_TOP_PLANK_LIMIT);

    const buckets: PlankPlacement[][] = Array.from({ length: VARIANT_COUNT }, () => []);
    for (const placement of placements) {
      buckets[placement.seed % VARIANT_COUNT].push(placement);
    }

    for (let v = 0; v < VARIANT_COUNT; v++) {
      const bucket = buckets[v];
      let mesh = this.meshes[v];
      if (!mesh || bucket.length > this.capacities[v]) {
        if (mesh) {
          this.group.remove(mesh);
          mesh.dispose();
        }
        const capacity = Math.max(8, Math.ceil(bucket.length * HEADROOM));
        mesh = new InstancedMesh(this.geometries[v]!, this.material, capacity);
        mesh.frustumCulled = false;
        mesh.receiveShadow = true;
        mesh.castShadow = false;
        // Allocate the colour buffer up front.
        mesh.setColorAt(0, this.color.setRGB(1, 1, 1));
        this.meshes[v] = mesh;
        this.capacities[v] = capacity;
        this.group.add(mesh);
      }
      mesh.count = bucket.length;
      for (let i = 0; i < bucket.length; i++) {
        const p = bucket[i];
        const flip = (p.seed >>> 8) & 1;
        const shade = 1 + (((p.seed >>> 12) & 0xff) / 255 - 0.5) * 2 * species.tint;
        this.dummy.position.set(p.x, 0, p.z);
        this.dummy.rotation.set(0, -p.rotation + (flip ? Math.PI : 0), 0);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(i, this.dummy.matrix);
        mesh.setColorAt(i, this.color.setRGB(shade, shade, shade));
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
}
