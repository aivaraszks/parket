import { describe, expect, it } from 'vitest';
import { L_SHAPE, RECT } from '../plan/plan-fixtures';
import { bbox, pointInPolygon, Vec2 } from '../plan/polygon';
import { RoomShape, ShapeOpening } from '../plan/room-shape';
import { CameraRig, presetPose } from './camera-rig';

function centred(points: Vec2[], openings: ShapeOpening[] = [], height = 2.7): RoomShape {
  const c = bbox(points).center;
  return {
    outline: points.map((p) => ({ x: p.x - c.x, y: p.y - c.y })),
    wallIds: points.map((_, i) => `w${i}`),
    height,
    openings,
  };
}
const door = (wall: number): ShapeOpening => ({
  id: 'o1',
  kind: 'door',
  wall,
  start: 0.5,
  end: 1.4,
  bottom: 0,
  top: 2.1,
});

const room = centred(RECT);
const lShape = centred(L_SHAPE, [door(0)]);
const angled = centred([
  { x: 0, y: 0 },
  { x: 6, y: 0 },
  { x: 6, y: 2 },
  { x: 4, y: 4 },
  { x: 0, y: 4 },
]);
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

describe('presetPose', () => {
  for (const [name, shape] of [
    ['rectangle', room],
    ['L-shape with a door', lShape],
    ['angled wall', angled],
    ['U-shape', u],
  ] as const) {
    it(`puts corner and doorway cameras inside the ${name} at eye level`, () => {
      for (const preset of ['corner', 'doorway'] as const) {
        const { position, target } = presetPose(preset, shape, 1.5);
        expect(pointInPolygon({ x: position.x, y: position.z }, shape.outline), preset).toBe(true);
        expect(pointInPolygon({ x: target.x, y: target.z }, shape.outline), preset).toBe(true);
        expect(position.y).toBeCloseTo(1.6);
      }
    });
  }

  it('stands in front of the door in the doorway preset', () => {
    const { position } = presetPose('doorway', lShape, 1.5);
    // Door 0 sits on the top wall, 0.95 m from the left corner of a 6 m wall.
    const top = lShape.outline[0];
    expect(position.x).toBeCloseTo(top.x + 0.95);
    expect(position.z).toBeCloseTo(top.y + 0.4);
  });

  it('keeps the eye below the ceiling', () => {
    const { position } = presetPose('corner', { ...room, height: 2.2 }, 1);
    expect(position.y).toBeLessThan(2.2 - 0.25);
  });

  it('looks straight down from above the room in the top preset', () => {
    const { position, target } = presetPose('top', room, 1.5);
    expect(position.y).toBeGreaterThan(room.height);
    expect(target.y).toBe(0);
  });

  it('rises higher for bigger rooms', () => {
    const small = presetPose('top', room, 1.5).position.y;
    const big = presetPose(
      'top',
      centred([
        { x: 0, y: 0 },
        { x: 12, y: 0 },
        { x: 12, y: 12 },
        { x: 0, y: 12 },
      ]),
      1.5,
    ).position.y;
    expect(big).toBeGreaterThan(small);
  });
});

describe('CameraRig frame', () => {
  const W = 400;
  const H = 800;

  function rigAt(preset: 'corner' | 'top' = 'corner'): CameraRig {
    const rig = new CameraRig(document.createElement('canvas'), true, () => undefined);
    rig.setRoom(room);
    rig.setPreset(preset, true);
    rig.setCanvasSize(W, H);
    return rig;
  }

  it('sets the view offset so the frame rect keeps the principal point', () => {
    const rig = rigAt();
    rig.setFrame({ top: 60, right: 0, bottom: 320, left: 10 });
    const { view, aspect } = rig.camera;
    expect(view).toMatchObject({
      enabled: true,
      fullWidth: 390,
      fullHeight: 420,
      offsetX: -10,
      offsetY: -60,
      width: W,
      height: H,
    });
    expect(aspect).toBeCloseTo(390 / 420);
  });

  it('clears the view offset with zero insets and restores the canvas aspect', () => {
    const rig = rigAt();
    rig.setFrame({ top: 0, right: 0, bottom: 320, left: 0 });
    rig.setFrame({ top: 0, right: 0, bottom: 0, left: 0 });
    expect(rig.camera.view?.enabled ?? false).toBe(false);
    expect(rig.camera.aspect).toBeCloseTo(W / H);
  });

  it('fits the top-down preset to the frame aspect', () => {
    const rig = rigAt('top');
    const full = rig.camera.position.y;
    rig.setFrame({ top: 0, right: 0, bottom: 480, left: 0 });
    const framed = presetPose('top', room, 400 / 320);
    expect(rig.camera.position.y).toBeCloseTo(framed.position.y);
    expect(rig.camera.position.y).not.toBeCloseTo(full);
  });

  it('inverts the drag-to-look direction', () => {
    expect(rigAt().controls.rotateSpeed).toBe(-1);
  });

  it('scales the pan speed by canvas height over frame height', () => {
    const rig = rigAt();
    expect(rig.controls.panSpeed).toBe(1);
    rig.setFrame({ top: 0, right: 0, bottom: 400, left: 0 });
    expect(rig.controls.panSpeed).toBeCloseTo(2);
    rig.setFrame({ top: 0, right: 0, bottom: 0, left: 0 });
    expect(rig.controls.panSpeed).toBe(1);
  });

  it('clears the offset for the export projection and restores it after', () => {
    const rig = rigAt();
    rig.setFrame({ top: 0, right: 0, bottom: 320, left: 0 });
    rig.exportProjection(true);
    expect(rig.camera.view?.enabled ?? false).toBe(false);
    expect(rig.camera.aspect).toBeCloseTo(W / H);
    rig.exportProjection(false);
    expect(rig.camera.view?.enabled).toBe(true);
    expect(rig.camera.aspect).toBeCloseTo(400 / 480);
  });
});

describe('CameraRig frame tween', () => {
  it('eases the insets over the tray duration, then settles', () => {
    const rig = new CameraRig(document.createElement('canvas'), false, () => undefined);
    rig.setRoom(room);
    rig.setCanvasSize(400, 800);
    rig.setFrame({ top: 0, right: 0, bottom: 100, left: 0 }); // the first real frame is instant
    const start = performance.now();
    rig.setFrame({ top: 0, right: 0, bottom: 400, left: 0 });
    // Not applied yet: the first update only starts the ease.
    expect(rig.update(start + 140)).toBe(true);
    const mid = rig.camera.view?.fullHeight ?? 800;
    expect(mid).toBeLessThan(700);
    expect(mid).toBeGreaterThan(400);
    rig.update(start + 400);
    expect(rig.camera.view?.fullHeight).toBe(400);
    expect(rig.update(start + 500)).toBe(false);
  });

  it('applies the first frame at once, and any frame when asked', () => {
    const rig = new CameraRig(document.createElement('canvas'), false, () => undefined);
    rig.setCanvasSize(400, 800);
    rig.setFrame({ top: 0, right: 0, bottom: 100, left: 0 });
    expect(rig.camera.view?.fullHeight).toBe(700);
    rig.setFrame({ top: 0, right: 0, bottom: 300, left: 0 }, true);
    expect(rig.camera.view?.fullHeight).toBe(500);
  });

  it('does not ease from zero insets to the first real ones (no ease on load)', () => {
    const rig = new CameraRig(document.createElement('canvas'), false, () => undefined);
    rig.setCanvasSize(400, 800);
    rig.setFrame({ top: 0, right: 0, bottom: 0, left: 0 });
    rig.setFrame({ top: 40, right: 0, bottom: 300, left: 0 });
    expect(rig.camera.view?.fullHeight).toBe(460);
    // The next change does ease.
    const start = performance.now();
    rig.setFrame({ top: 40, right: 0, bottom: 100, left: 0 });
    expect(rig.camera.view?.fullHeight).toBe(460);
    rig.update(start + 140);
    expect(rig.camera.view?.fullHeight).toBeGreaterThan(460);
    expect(rig.camera.view?.fullHeight).toBeLessThan(660);
  });
});
