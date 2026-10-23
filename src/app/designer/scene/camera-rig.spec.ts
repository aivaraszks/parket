import { describe, expect, it } from 'vitest';
import { L_SHAPE, RECT } from '../plan/plan-fixtures';
import { bbox, pointInPolygon, Vec2 } from '../plan/polygon';
import { RoomShape, ShapeOpening } from '../plan/room-shape';
import { presetPose } from './camera-rig';

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
