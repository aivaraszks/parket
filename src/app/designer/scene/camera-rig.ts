import { MathUtils, PerspectiveCamera, Spherical, Vector2, Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  bbox,
  clampPointInside,
  distance,
  interiorAngles,
  interiorPoint,
  normalize,
  outwardNormal,
  Vec2,
} from '../plan/polygon';
import { RoomShape } from '../plan/room-shape';
import { ViewPreset } from './scene-commands';

const WALL_MARGIN = 0.25;
const MIN_HEIGHT = 0.25;
const TWEEN_MS = 700;
const FOV = 58;
const KEY_ORBIT_STEP = 0.1;
const ZOOM_FACTOR = 0.8;

export interface CameraPose {
  position: Vector3;
  target: Vector3;
}

const NEAR_WALL = 0.4;
const CORNER_WALL_DISTANCE = 0.27;

/** Pull a candidate camera spot inside the room (margin from the walls); the fallback if that fails. */
function inside(p: Vec2, outline: readonly Vec2[], fallback: Vec2): Vec2 {
  return clampPointInside(p, outline, WALL_MARGIN) ?? fallback;
}

/** The convex corner farthest from the room middle, a little way in along its bisector. */
function cornerSpot(outline: readonly Vec2[], middle: Vec2): Vec2 {
  const angles = interiorAngles(outline);
  const n = outline.length;
  let best = -1;
  let bestDistance = -1;
  for (let i = 0; i < n; i++) {
    const d = distance(outline[i], middle);
    if (angles[i] < 179 && d > bestDistance) {
      best = i;
      bestDistance = d;
    }
  }
  if (best < 0) {
    return middle;
  }
  const v = outline[best];
  const prev = outwardNormal(outline[(best - 1 + n) % n], v);
  const next = outwardNormal(v, outline[(best + 1) % n]);
  const inward = normalize({ x: -(prev.x + next.x), y: -(prev.y + next.y) });
  const half = (angles[best] * Math.PI) / 360;
  const reach = Math.max(0.35, CORNER_WALL_DISTANCE / Math.sin(half));
  return inside({ x: v.x + inward.x * reach, y: v.y + inward.y * reach }, outline, middle);
}

/** Just inside the first door, or the middle of the longest wall when there is none. */
function doorwaySpot(shape: RoomShape, middle: Vec2): Vec2 {
  const { outline, openings } = shape;
  const n = outline.length;
  const door = openings.find((o) => o.kind === 'door');
  let wall = door?.wall ?? 0;
  let at = door ? (door.start + door.end) / 2 : 0;
  if (!door) {
    // Longest wall; on a tie the one with fewer openings, so the view looks towards the windows.
    const count = (i: number): number => openings.filter((o) => o.wall === i).length;
    let bestLength = -1;
    for (let i = 0; i < n; i++) {
      const len = distance(outline[i], outline[(i + 1) % n]);
      if (
        len > bestLength + 1e-6 ||
        (Math.abs(len - bestLength) <= 1e-6 && count(i) < count(wall))
      ) {
        wall = i;
        bestLength = len;
      }
    }
    at = bestLength / 2;
  }
  const a = outline[wall];
  const b = outline[(wall + 1) % n];
  const dir = normalize({ x: b.x - a.x, y: b.y - a.y });
  const normal = outwardNormal(a, b);
  const spot = {
    x: a.x + dir.x * at - normal.x * NEAR_WALL,
    y: a.y + dir.y * at - normal.y * NEAR_WALL,
  };
  return inside(spot, outline, middle);
}

/** Camera position and look-at point for a preset. Pure, so it is easy to test. */
export function presetPose(name: ViewPreset, shape: RoomShape, aspect: number): CameraPose {
  const { outline, height: H } = shape;
  const eye = Math.min(1.6, H - 0.4);
  switch (name) {
    case 'top': {
      const box = bbox(outline);
      const tanHalf = Math.tan(MathUtils.degToRad(FOV / 2));
      // The long side runs up the screen on portrait displays so the room fills the view.
      const portrait = aspect < 1 && box.width > box.height;
      const halfAcross = (portrait ? box.height : box.width) / 2;
      const halfUp = (portrait ? box.width : box.height) / 2;
      const height =
        Math.max(halfUp / tanHalf, halfAcross / (tanHalf * Math.min(aspect, 4))) * 1.06;
      // A tiny offset picks which room axis points up on the screen.
      const cx = box.center.x;
      const cz = box.center.y;
      return {
        position: portrait
          ? new Vector3(cx + 0.02, height, cz)
          : new Vector3(cx, height, cz + 0.02),
        target: new Vector3(cx, 0, cz),
      };
    }
    case 'doorway': {
      const middle = interiorPoint(outline);
      const spot = doorwaySpot(shape, middle);
      return {
        position: new Vector3(spot.x, eye, spot.y),
        target: new Vector3(middle.x, 0.35, middle.y),
      };
    }
    case 'corner':
    default: {
      const middle = interiorPoint(outline);
      const spot = cornerSpot(outline, middle);
      return {
        position: new Vector3(spot.x, eye, spot.y),
        target: new Vector3(middle.x, 0.3, middle.y),
      };
    }
  }
}

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

interface Tween {
  start: number;
  fromPosition: Vector3;
  toPosition: Vector3;
  fromTarget: Vector3;
  toTarget: Vector3;
  preset: ViewPreset;
}

/** Orbit camera kept inside the room, with presets, zoom buttons and keyboard control. */
export class CameraRig {
  readonly camera = new PerspectiveCamera(FOV, 1, 0.05, 200);
  readonly controls: OrbitControls;

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
  /** Last camera and target ground positions that were inside the room (x, z). */
  private readonly lastPosition = new Vector2();
  private readonly lastTarget = new Vector2();
  private aspect = 1;
  private tween: Tween | null = null;
  /** Preset the camera still sits at; null once the user moved it. */
  private activePreset: ViewPreset | null = null;
  /** True after the top-down preset: the camera may then sit above the (see-through) ceiling. */
  private elevated = false;
  private readonly spherical = new Spherical();
  private readonly offset = new Vector3();
  private readonly beforePosition = new Vector3();
  private readonly beforeTarget = new Vector3();
  /** Height of the top-down view for the current room and aspect; cached for `clamp()`. */
  private topY = presetPose('top', this.shape, this.aspect).position.y;

  constructor(
    private readonly element: HTMLElement,
    private readonly reducedMotion: boolean,
    private readonly onChange: () => void,
  ) {
    this.controls = new OrbitControls(this.camera, element);
    this.controls.enableDamping = !reducedMotion;
    this.controls.dampingFactor = 0.12;
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = 0.4;
    this.controls.maxDistance = 60;
    this.controls.minPolarAngle = 0;
    this.controls.maxPolarAngle = 1.75;
    this.controls.addEventListener('change', this.onChange);
    this.controls.addEventListener('start', this.onUserStart);
    this.controls.addEventListener('end', this.onChange);
    element.addEventListener('keydown', this.onKeyDown);
    this.setPreset('corner', true);
  }

  setRoom(shape: RoomShape): void {
    this.shape = shape;
    const middle = interiorPoint(shape.outline);
    this.lastPosition.set(middle.x, middle.y);
    this.lastTarget.set(middle.x, middle.y);
    this.updateTopY();
    this.refit();
  }

  setAspect(aspect: number): void {
    this.aspect = aspect > 0 ? aspect : 1;
    this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();
    this.updateTopY();
    if (this.activePreset === 'top') {
      this.refit();
    }
  }

  setPreset(name: ViewPreset, instant = false): void {
    const pose = presetPose(name, this.shape, this.aspect);
    this.activePreset = name;
    if (instant || this.reducedMotion) {
      this.tween = null;
      this.applyPose(pose, name);
      this.onChange();
      return;
    }
    this.tween = {
      start: performance.now(),
      fromPosition: this.camera.position.clone(),
      toPosition: pose.position,
      fromTarget: this.controls.target.clone(),
      toTarget: pose.target,
      preset: name,
    };
    this.onChange();
  }

  zoom(direction: 1 | -1): void {
    this.tween = null;
    this.offset.subVectors(this.camera.position, this.controls.target);
    const factor = direction === 1 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
    const length = MathUtils.clamp(
      this.offset.length() * factor,
      this.controls.minDistance,
      this.controls.maxDistance,
    );
    this.offset.setLength(length);
    this.camera.position.copy(this.controls.target).add(this.offset);
    this.moved();
  }

  /** Advance animation and damping. Returns true while another frame is needed. */
  update(now: number): boolean {
    let animating = false;
    if (this.tween) {
      const t = Math.min(1, (now - this.tween.start) / TWEEN_MS);
      const k = easeInOut(t);
      this.camera.position.lerpVectors(this.tween.fromPosition, this.tween.toPosition, k);
      this.controls.target.lerpVectors(this.tween.fromTarget, this.tween.toTarget, k);
      if (t >= 1) {
        const preset = this.tween.preset;
        this.tween = null;
        this.elevated = preset === 'top';
      } else {
        animating = true;
      }
    }
    const changed = this.controls.update();
    if (!this.tween) {
      if (this.clamp()) {
        this.controls.update();
      }
    }
    return animating || changed;
  }

  dispose(): void {
    this.element.removeEventListener('keydown', this.onKeyDown);
    this.controls.removeEventListener('change', this.onChange);
    this.controls.removeEventListener('start', this.onUserStart);
    this.controls.removeEventListener('end', this.onChange);
    this.controls.dispose();
  }

  /** Keep the camera inside the room (the top-down view may rise above the ceiling plane). */
  clamp(): boolean {
    const { outline, height } = this.shape;
    const p = this.camera.position;
    const t = this.controls.target;
    const topY = this.topY;
    if (this.elevated && p.y < height - WALL_MARGIN - 1e-3) {
      this.elevated = false;
    }
    const maxY = this.elevated ? Math.max(height - WALL_MARGIN, topY * 1.02) : height - WALL_MARGIN;
    const beforePosition = this.beforePosition.copy(p);
    const beforeTarget = this.beforeTarget.copy(t);

    if (this.elevated) {
      // Looking down from above: the whole bounding box is fair game (the middle of a U is outside).
      const box = bbox(outline);
      p.x = MathUtils.clamp(p.x, box.minX, box.maxX);
      p.z = MathUtils.clamp(p.z, box.minY, box.maxY);
      t.x = MathUtils.clamp(t.x, box.minX, box.maxX);
      t.z = MathUtils.clamp(t.z, box.minY, box.maxY);
    } else {
      const spot = clampPointInside({ x: p.x, y: p.z }, outline, WALL_MARGIN);
      if (spot) {
        p.x = spot.x;
        p.z = spot.y;
      } else {
        // A notch too narrow to stand in: stay where the camera last was inside the room.
        p.x = this.lastPosition.x;
        p.z = this.lastPosition.y;
      }
      const aim = clampPointInside({ x: t.x, y: t.z }, outline, 0);
      if (aim) {
        t.x = aim.x;
        t.z = aim.y;
      } else {
        t.x = this.lastTarget.x;
        t.z = this.lastTarget.y;
      }
      const seen = this.lineOfSight({ x: p.x, y: p.z }, { x: t.x, y: t.z }, outline);
      p.x = seen.x;
      p.z = seen.y;
      this.lastPosition.set(p.x, p.z);
      this.lastTarget.set(t.x, t.z);
    }
    p.y = MathUtils.clamp(p.y, MIN_HEIGHT, maxY);
    t.y = MathUtils.clamp(t.y, 0, height);
    return !beforePosition.equals(p) || !beforeTarget.equals(t);
  }

  /**
   * In a concave room the clamped camera and target can face each other through a wall. Pull the
   * camera along the line to the target until the wall nearest the target is behind it.
   */
  private lineOfSight(eye: Vec2, aim: Vec2, outline: readonly Vec2[]): Vec2 {
    const dx = eye.x - aim.x;
    const dy = eye.y - aim.y;
    const span = Math.hypot(dx, dy);
    if (span < 1e-9) return eye;
    let nearest = Infinity; // metres from the target to the closest wall crossing
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i];
      const b = outline[(i + 1) % outline.length];
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const denom = dx * ey - dy * ex;
      if (Math.abs(denom) < 1e-12) continue;
      const wx = a.x - aim.x;
      const wy = a.y - aim.y;
      const s = (wx * ey - wy * ex) / denom; // along target -> camera
      const u = (wx * dy - wy * dx) / denom; // along the edge
      if (s > 1e-6 && s <= 1 && u >= 0 && u <= 1) {
        nearest = Math.min(nearest, s * span);
      }
    }
    if (nearest === Infinity) return eye;
    const along = Math.max(0, nearest - WALL_MARGIN) / span;
    const moved = { x: aim.x + dx * along, y: aim.y + dy * along };
    // Keep the wall margin (the line may graze a corner); the spot may be a little off the line.
    return clampPointInside(moved, outline, WALL_MARGIN) ?? eye;
  }

  private updateTopY(): void {
    this.topY = presetPose('top', this.shape, this.aspect).position.y;
  }

  private refit(): void {
    if (this.tween) {
      // A preset is on its way: aim at the pose for the new room instead.
      const pose = presetPose(this.tween.preset, this.shape, this.aspect);
      this.tween.toPosition = pose.position;
      this.tween.toTarget = pose.target;
    } else if (this.activePreset) {
      this.applyPose(presetPose(this.activePreset, this.shape, this.aspect), this.activePreset);
    } else {
      this.moved();
    }
    this.onChange();
  }

  private applyPose(pose: CameraPose, preset: ViewPreset): void {
    this.camera.position.copy(pose.position);
    this.controls.target.copy(pose.target);
    this.elevated = preset === 'top';
    this.controls.update();
  }

  private moved(): void {
    this.activePreset = null;
    this.clamp();
    this.controls.update();
    this.onChange();
  }

  private readonly onUserStart = (): void => {
    this.tween = null;
    this.activePreset = null;
    this.onChange();
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    let handled = true;
    switch (event.key) {
      case 'ArrowLeft':
        this.orbit(-KEY_ORBIT_STEP, 0);
        break;
      case 'ArrowRight':
        this.orbit(KEY_ORBIT_STEP, 0);
        break;
      case 'ArrowUp':
        this.orbit(0, -KEY_ORBIT_STEP * 0.7);
        break;
      case 'ArrowDown':
        this.orbit(0, KEY_ORBIT_STEP * 0.7);
        break;
      case '+':
      case '=':
        this.zoom(1);
        break;
      case '-':
      case '_':
        this.zoom(-1);
        break;
      case '0':
        this.setPreset('corner');
        break;
      default:
        handled = false;
    }
    if (handled) {
      event.preventDefault();
    }
  };

  private orbit(deltaTheta: number, deltaPhi: number): void {
    this.tween = null;
    this.offset.subVectors(this.camera.position, this.controls.target);
    this.spherical.setFromVector3(this.offset);
    this.spherical.theta += deltaTheta;
    this.spherical.phi = MathUtils.clamp(
      this.spherical.phi + deltaPhi,
      this.controls.minPolarAngle + 0.001,
      this.controls.maxPolarAngle,
    );
    this.offset.setFromSpherical(this.spherical);
    this.camera.position.copy(this.controls.target).add(this.offset);
    this.moved();
  }
}
