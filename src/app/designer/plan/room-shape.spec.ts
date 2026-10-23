import { describe, expect, it } from 'vitest';
import { DEFAULT_DESIGN } from '../state/design-defaults';
import { rectangleToPlan } from './plan-edit';
import { L_SHAPE, opening, planFromPoints } from './plan-fixtures';
import { bbox, signedArea } from './polygon';
import {
  roomShapesEqual,
  shapeArea,
  shapeSkirtingLength,
  toRoomShape,
  windowFor,
} from './room-shape';

describe('windowFor', () => {
  it('is centred and sized like the old fixed window', () => {
    const w = windowFor({ length: 5, height: 2.7 });
    expect(w).toEqual({ offset: 1.625, width: 1.75, height: 1.45, sill: 0.85 });
    expect(windowFor({ length: 2, height: 2.7 }).width).toBe(0.8);
    expect(windowFor({ length: 12, height: 2.7 }).width).toBe(1.8);
    expect(windowFor({ length: 5, height: 2.2 }).height).toBeCloseTo(1.05, 9);
  });
});

describe('toRoomShape', () => {
  it('turns the simple room into a centred, positively wound rectangle with its window', () => {
    const shape = toRoomShape(DEFAULT_DESIGN);
    expect(shape.outline).toEqual([
      { x: -2.5, y: -2 },
      { x: 2.5, y: -2 },
      { x: 2.5, y: 2 },
      { x: -2.5, y: 2 },
    ]);
    expect(signedArea(shape.outline)).toBe(20);
    expect(shape.height).toBe(2.7);
    expect(shape.openings).toEqual([
      { id: 'window', kind: 'window', wall: 0, start: 1.625, end: 3.375, bottom: 0.85, top: 2.3 },
    ]);
  });

  it('centres a custom plan on its bbox centre and maps openings to edge indices', () => {
    const plan = planFromPoints(L_SHAPE.map((p) => ({ x: p.x + 10, y: p.y + 20 })));
    plan.openings = [
      opening({ id: 'o40', wallId: 'w8', offset: 0.5, width: 1, height: 1.2, sill: 0.9 }),
      opening({
        id: 'o41',
        wallId: 'w7',
        kind: 'door',
        offset: 1,
        width: 0.9,
        height: 2.1,
        sill: 0,
      }),
    ];
    const shape = toRoomShape({ ...DEFAULT_DESIGN, mode: 'custom', plan });
    expect(bbox(shape.outline).center).toEqual({ x: 0, y: 0 });
    expect(shapeArea(shape)).toBe(24);
    expect(shape.openings).toEqual([
      { id: 'o40', kind: 'window', wall: 1, start: 0.5, end: 1.5, bottom: 0.9, top: 2.1 },
      { id: 'o41', kind: 'door', wall: 0, start: 1, end: 1.9, bottom: 0, top: 2.1 },
    ]);
  });

  it('falls back to the simple room when custom mode has no usable plan', () => {
    const simple = toRoomShape(DEFAULT_DESIGN);
    expect(
      roomShapesEqual(toRoomShape({ ...DEFAULT_DESIGN, mode: 'custom', plan: null }), simple),
    ).toBe(true);
    const broken = rectangleToPlan(DEFAULT_DESIGN.room);
    broken.walls[0].to = 'v3';
    expect(
      roomShapesEqual(toRoomShape({ ...DEFAULT_DESIGN, mode: 'custom', plan: broken }), simple),
    ).toBe(true);
  });

  it('ignores the plan in simple mode', () => {
    const plan = rectangleToPlan({ length: 9, width: 9, height: 3 });
    expect(shapeArea(toRoomShape({ ...DEFAULT_DESIGN, mode: 'simple', plan }))).toBe(20);
  });
});

describe('shape helpers', () => {
  it('compares shapes structurally', () => {
    const a = toRoomShape(DEFAULT_DESIGN);
    expect(roomShapesEqual(a, toRoomShape(DEFAULT_DESIGN))).toBe(true);
    expect(
      roomShapesEqual(
        a,
        toRoomShape({ ...DEFAULT_DESIGN, room: { ...DEFAULT_DESIGN.room, height: 3 } }),
      ),
    ).toBe(false);
    expect(roomShapesEqual(a, { ...a, openings: [] })).toBe(false);
    expect(roomShapesEqual(a, { ...a, openings: [{ ...a.openings[0], end: 3.4 }] })).toBe(false);
  });

  it('skirting is the perimeter minus the doors', () => {
    const shape = toRoomShape({ ...DEFAULT_DESIGN });
    expect(shapeSkirtingLength(shape)).toBe(18);
    const withDoor = {
      ...shape,
      openings: [
        ...shape.openings,
        { id: 'o1', kind: 'door' as const, wall: 1, start: 1, end: 1.9, bottom: 0, top: 2.1 },
      ],
    };
    expect(shapeSkirtingLength(withDoor)).toBeCloseTo(17.1, 9);
  });
});
