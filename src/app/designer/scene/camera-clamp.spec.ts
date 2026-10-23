import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { L_SHAPE } from '../plan/plan-fixtures';
import { bbox, distanceToBoundary, pointInPolygon, Vec2 } from '../plan/polygon';
import { RoomShape } from '../plan/room-shape';
import { createRandom } from './random';
import { CameraRig } from './camera-rig';

function centred(points: Vec2[], height = 2.7): RoomShape {
  const c = bbox(points).center;
  return { outline: points.map((p) => ({ x: p.x - c.x, y: p.y - c.y })), height, openings: [] };
}

const l = centred(L_SHAPE);
// U opening to the top, notch 2 m wide, 3 m deep.
const u = centred([
  { x: 0, y: 0 },
  { x: 2, y: 0 },
  { x: 2, y: 3 },
  { x: 4, y: 3 },
  { x: 4, y: 0 },
  { x: 6, y: 0 },
  { x: 6, y: 5 },
  { x: 0, y: 5 },
]);
// A room with a 0.4 m wide, 2 m deep slot: too narrow to stand in with a 0.25 m margin.
const slot = centred([
  { x: 0, y: 0 },
  { x: 2.8, y: 0 },
  { x: 2.8, y: 2 },
  { x: 3.2, y: 2 },
  { x: 3.2, y: 0 },
  { x: 6, y: 0 },
  { x: 6, y: 4 },
  { x: 0, y: 4 },
]);

describe('CameraRig clamp in concave rooms', () => {
  let element: HTMLElement;
  let rig: CameraRig;

  beforeEach(() => {
    element = document.createElement('div');
    document.body.appendChild(element);
    rig = new CameraRig(element, true, () => undefined);
  });
  afterEach(() => {
    rig.dispose();
    element.remove();
  });

  const eye = (): Vec2 => ({ x: rig.camera.position.x, y: rig.camera.position.z });
  const aim = (): Vec2 => ({ x: rig.controls.target.x, y: rig.controls.target.z });
  const place = (pos: Vec2, target: Vec2, y = 1.6): void => {
    rig.camera.position.set(pos.x, y, pos.y);
    rig.controls.target.set(target.x, 1.2, target.y);
  };

  it('starts inside a concave room for every preset', () => {
    for (const shape of [l, u, slot]) {
      rig.setRoom(shape);
      for (const preset of ['corner', 'doorway'] as const) {
        rig.setPreset(preset, true);
        expect(pointInPolygon(eye(), shape.outline), preset).toBe(true);
      }
    }
  });

  it('pushes a camera dragged into the L notch back into the room, off the walls', () => {
    rig.setRoom(l);
    rig.setPreset('corner', true);
    // The notch is the lower right of the 6 x 5 L: centred coordinates (3 - 3, 4 - 2.5).
    place({ x: 1.5, y: 1.8 }, { x: 0, y: 0 });
    expect(pointInPolygon(eye(), l.outline)).toBe(false); // really in the notch
    expect(rig.clamp()).toBe(true);
    expect(pointInPolygon(eye(), l.outline)).toBe(true);
    expect(distanceToBoundary(eye(), l.outline)).toBeGreaterThanOrEqual(0.25 - 1e-6);
  });

  it('keeps the camera out of the U notch and a drag through the notch ends inside', () => {
    rig.setRoom(u);
    rig.setPreset('corner', true);
    const middleOfNotch = { x: 0, y: -1 }; // centre of the notch, centred coordinates
    place(middleOfNotch, { x: 0, y: 1 });
    rig.clamp();
    expect(pointInPolygon(eye(), u.outline)).toBe(true);
    expect(distanceToBoundary(eye(), u.outline)).toBeGreaterThanOrEqual(0.25 - 1e-6);
  });

  it('clamps the target to the outline too (no margin), also in the notch', () => {
    rig.setRoom(u);
    rig.setPreset('corner', true);
    place({ x: -2, y: 2 }, { x: 0, y: -1.5 });
    rig.clamp();
    expect(pointInPolygon(aim(), u.outline)).toBe(true);
  });

  it('survives random drags far outside, always leaving camera and target inside', () => {
    const rnd = createRandom(11);
    for (const shape of [l, u]) {
      rig.setRoom(shape);
      rig.setPreset('corner', true);
      for (let i = 0; i < 200; i++) {
        place(
          { x: (rnd() - 0.5) * 30, y: (rnd() - 0.5) * 30 },
          { x: (rnd() - 0.5) * 30, y: (rnd() - 0.5) * 30 },
          rnd() * 6 - 1,
        );
        rig.clamp();
        expect(pointInPolygon(eye(), shape.outline)).toBe(true);
        expect(pointInPolygon(aim(), shape.outline)).toBe(true);
        expect(rig.camera.position.y).toBeLessThanOrEqual(shape.height);
        expect(rig.camera.position.y).toBeGreaterThan(0);
        expect(Number.isFinite(rig.camera.position.x + rig.camera.position.z)).toBe(true);
      }
    }
  });

  it('is stable: clamping twice changes nothing the second time', () => {
    rig.setRoom(u);
    rig.setPreset('corner', true);
    place({ x: 0, y: -1 }, { x: 0, y: 1 });
    rig.clamp();
    expect(rig.clamp()).toBe(false);
  });

  it('leaves a camera that is already well inside alone', () => {
    rig.setRoom(l);
    rig.setPreset('corner', true);
    place({ x: -1.5, y: -1 }, { x: -1, y: 0 });
    expect(rig.clamp()).toBe(false);
    expect(eye()).toEqual({ x: -1.5, y: -1 });
  });

  it('a slot too narrow to stand in does not throw and never leaves the room', () => {
    rig.setRoom(slot);
    rig.setPreset('corner', true);
    const slotMiddle = { x: 0, y: -1.2 }; // inside the 0.4 m slot
    place(slotMiddle, { x: 0, y: 1 });
    expect(() => rig.clamp()).not.toThrow();
    expect(pointInPolygon(eye(), slot.outline)).toBe(true);
    expect(distanceToBoundary(eye(), slot.outline)).toBeGreaterThanOrEqual(0.25 - 1e-6);
  });

  it('a room change re-seats the camera inside the new, concave outline', () => {
    rig.setRoom(l);
    rig.setPreset('corner', true);
    rig.setRoom(u);
    rig.clamp();
    expect(pointInPolygon(eye(), u.outline)).toBe(true);
    rig.setRoom(slot);
    rig.clamp();
    expect(pointInPolygon(eye(), slot.outline)).toBe(true);
  });

  it('the top-down view may sit above the room, over the notch of a U', () => {
    rig.setRoom(u);
    rig.setPreset('top', true);
    rig.update(1e6);
    expect(rig.camera.position.y).toBeGreaterThan(u.height);
    const box = bbox(u.outline);
    expect(rig.camera.position.x).toBeGreaterThanOrEqual(box.minX - 1e-6);
    expect(rig.camera.position.x).toBeLessThanOrEqual(box.maxX + 1e-6);
    // Dragged back down below the ceiling, the walking rule applies again.
    place({ x: 0, y: -1 }, { x: 0, y: 1 }, 1.6);
    rig.clamp();
    expect(pointInPolygon(eye(), u.outline)).toBe(true);
  });

  it('moves a camera that faces its target through a wall to where it can see it', () => {
    rig.setRoom(l);
    rig.setPreset('corner', true);
    // Camera in the upper arm, target in the lower-left arm: the straight line cuts the notch.
    place({ x: 2.5, y: 0.1 }, { x: -0.5, y: 2.2 });
    expect(rig.clamp()).toBe(true);
    expect(pointInPolygon(eye(), l.outline)).toBe(true);
    for (let i = 0; i <= 20; i++) {
      const k = i / 20;
      const point = {
        x: eye().x + (aim().x - eye().x) * k,
        y: eye().y + (aim().y - eye().y) * k,
      };
      expect(pointInPolygon(point, l.outline), `sample ${i}`).toBe(true);
    }
  });
});
