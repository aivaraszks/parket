import {
  Color,
  DirectionalLight,
  HemisphereLight,
  MathUtils,
  PMREMGenerator,
  Scene,
  Texture,
  Vector3,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { offsetPolygon } from '../plan/polygon';
import { RoomShape } from '../plan/room-shape';
import { Sun } from '../state/design-defaults';
import { WALL_THICKNESS } from './room-builder';

const SUN_COLOR = new Color('#ffe6bf'); // about 5500 K, slightly warm
const SUN_BASE_INTENSITY = 3.4;

/** Direction from the room towards the sun. Azimuth 180 is the sun on the -z side. */
export function sunDirection(azimuthDeg: number, elevationDeg: number): Vector3 {
  const az = MathUtils.degToRad(azimuthDeg);
  const el = MathUtils.degToRad(elevationDeg);
  return new Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
}

/** Image based light, warm bounce and the sun that comes in through the window. */
export class Lighting {
  readonly sun: DirectionalLight;
  private readonly hemisphere: HemisphereLight;
  private environment: Texture | null = null;
  private shape: RoomShape = {
    outline: [
      { x: -2.5, y: -2 },
      { x: 2.5, y: -2 },
      { x: 2.5, y: 2 },
      { x: -2.5, y: 2 },
    ],
    height: 2.7,
    openings: [],
  };
  private sunState: Sun = { on: true, azimuth: 135, elevation: 35, intensity: 1 };

  constructor(
    private readonly scene: Scene,
    private readonly renderer: WebGLRenderer,
    shadowMapSize: number,
  ) {
    this.hemisphere = new HemisphereLight(0xfff4e0, 0x8a6a48, 0.5);
    this.sun = new DirectionalLight(SUN_COLOR, SUN_BASE_INTENSITY);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 3;
    scene.add(this.hemisphere, this.sun, this.sun.target);
    scene.environmentIntensity = 0.35;
    this.buildEnvironment();
    this.layoutSun();
  }

  /** Re-create the environment map; needed after a lost WebGL context was restored. */
  buildEnvironment(): void {
    this.environment?.dispose();
    const generator = new PMREMGenerator(this.renderer);
    const environment = new RoomEnvironment();
    this.environment = generator.fromScene(environment, 0.04).texture;
    this.scene.environment = this.environment;
    environment.dispose();
    generator.dispose();
    this.markShadowDirty();
  }

  setRoom(shape: RoomShape): void {
    this.shape = shape;
    this.layoutSun();
  }

  setSun(sun: Sun): void {
    this.sunState = sun;
    this.layoutSun();
  }

  /** Call after anything that casts or receives shadows changed. */
  markShadowDirty(): void {
    // The renderer-level flag: with autoUpdate off the shadow pass only runs when it is set.
    this.renderer.shadowMap.needsUpdate = true;
  }

  dispose(): void {
    this.environment?.dispose();
    this.environment = null;
    this.sun.shadow.map?.dispose();
    this.scene.environment = null;
  }

  private layoutSun(): void {
    const { outline, height } = this.shape;
    const outer = offsetPolygon(outline, WALL_THICKNESS);
    const center = new Vector3(0, height / 2, 0);
    const direction = sunDirection(this.sunState.azimuth, this.sunState.elevation);
    const frustum = fitShadowFrustum(outer, height, direction);

    const distance = frustum.radius + 6;
    this.sun.target.position.copy(center);
    this.sun.position.copy(center).addScaledVector(direction, distance);
    // Intensity 0 instead of hiding the light: no shader recompile when the sun is toggled.
    this.sun.intensity = this.sunState.on ? SUN_BASE_INTENSITY * this.sunState.intensity : 0;

    const camera = this.sun.shadow.camera;
    camera.up.set(frustum.up.x, frustum.up.y, frustum.up.z);
    camera.left = frustum.left;
    camera.right = frustum.right;
    camera.top = frustum.top;
    camera.bottom = frustum.bottom;
    camera.near = Math.max(0.5, distance + frustum.minDepth - 1);
    camera.far = distance + frustum.maxDepth + 1;
    camera.updateProjectionMatrix();
    this.sun.target.updateMatrixWorld();
    this.markShadowDirty();
  }
}

export interface ShadowFrustum {
  left: number;
  right: number;
  top: number;
  bottom: number;
  /** Extent of the room along the light direction, relative to the room centre (negative = towards the sun). */
  minDepth: number;
  maxDepth: number;
  /** Half the diagonal of the room box, for placing the light. */
  radius: number;
  up: Vector3;
}

/**
 * Orthographic shadow box that tightly wraps the walls (outer polygon from floor to ceiling) as seen
 * from the sun, so the shadow map resolution is spent on the room whatever its shape.
 * The room centre is at (0, height / 2, 0).
 */
export function fitShadowFrustum(
  outer: readonly { x: number; y: number }[],
  height: number,
  direction: Vector3,
): ShadowFrustum {
  const forward = direction.clone().negate(); // from the sun into the room
  const up = Math.abs(direction.y) > 0.99 ? new Vector3(0, 0, 1) : new Vector3(0, 1, 0);
  const right = new Vector3().crossVectors(forward, up).normalize();
  const camUp = new Vector3().crossVectors(right, forward).normalize();
  let left = Infinity;
  let rightMax = -Infinity;
  let bottom = Infinity;
  let top = -Infinity;
  let minDepth = Infinity;
  let maxDepth = -Infinity;
  let radius = 0;
  const p = new Vector3();
  for (const q of outer) {
    for (const y of [0, height]) {
      p.set(q.x, y - height / 2, q.y);
      const x = p.dot(right);
      const v = p.dot(camUp);
      const d = p.dot(forward);
      left = Math.min(left, x);
      rightMax = Math.max(rightMax, x);
      bottom = Math.min(bottom, v);
      top = Math.max(top, v);
      minDepth = Math.min(minDepth, d);
      maxDepth = Math.max(maxDepth, d);
      radius = Math.max(radius, p.length());
    }
  }
  const pad = 0.3;
  return {
    left: left - pad,
    right: rightMax + pad,
    bottom: bottom - pad,
    top: top + pad,
    minDepth,
    maxDepth,
    radius: radius + 0.4,
    up,
  };
}
