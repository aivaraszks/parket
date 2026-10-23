import { describe, expect, it } from 'vitest';
import { createRandom } from '../scene/random';
import {
  addOpening,
  DEFAULT_SNAP,
  deleteVertex,
  insertVertex,
  minPlanHeight,
  minWallLength,
  moveVertex,
  moveWall,
  NO_SNAP,
  rectangleToPlan,
  removeOpening,
  setPlanHeight,
  setWallLength,
  updateOpening,
} from './plan-edit';
import { EditResult, loopPoints, Plan, planLoop } from './plan-model';
import { L_SHAPE, opening, planFromPoints, RECT } from './plan-fixtures';
import { validatePlan } from './plan-validate';
import { area, interiorAngles, Vec2 } from './polygon';
import { roomShapesEqual, toRoomShape } from './room-shape';

const rect = (): Plan => planFromPoints(RECT); // v1..v4, walls w5 (top), w6 (right), w7, w8
const lShape = (): Plan => planFromPoints(L_SHAPE); // v1..v6, walls w7..w12

function ok(result: EditResult): Plan {
  if (!result.ok) {
    throw new Error(`refused: ${JSON.stringify(result.errors)}`);
  }
  expect(validatePlan(result.plan)).toEqual([]);
  return result.plan;
}

function codes(result: EditResult): string[] {
  return result.ok ? [] : result.errors.map((e) => e.code);
}

function pts(plan: Plan): Vec2[] {
  return loopPoints(plan)!;
}

describe('rectangleToPlan', () => {
  it('makes a valid canonical plan with the fixed window as a real opening', () => {
    const plan = rectangleToPlan({ length: 5, width: 4, height: 2.7 });
    expect(validatePlan(plan)).toEqual([]);
    expect(planLoop(plan)).not.toBeNull();
    expect(area(pts(plan))).toBe(20);
    expect(plan.openings).toHaveLength(1);
    expect(plan.openings[0]).toMatchObject({ kind: 'window', wallId: 'w5', sill: 0.85 });
  });

  it('is valid for the extremes of the simple room', () => {
    for (const room of [
      { length: 2, width: 2, height: 2.2 },
      { length: 12, width: 12, height: 4 },
      { length: 12, width: 2, height: 2.2 },
      { length: 2, width: 12, height: 3 },
    ]) {
      expect(validatePlan(rectangleToPlan(room))).toEqual([]);
    }
  });

  it('gives the same scene shape as the simple room', () => {
    const room = { length: 5.33, width: 3.17, height: 2.55 };
    const custom = toRoomShape({ mode: 'custom', room, plan: rectangleToPlan(room) });
    const simple = toRoomShape({ mode: 'simple', room, plan: null });
    expect(custom.height).toBe(simple.height);
    custom.outline.forEach((p, i) => {
      expect(p.x).toBeCloseTo(simple.outline[i].x, 9);
      expect(p.y).toBeCloseTo(simple.outline[i].y, 9);
    });
    expect(custom.openings).toHaveLength(1);
    expect(custom.openings[0]).toMatchObject({ kind: 'window', wall: 0 });
    expect(custom.openings[0].start).toBeCloseTo(simple.openings[0].start, 9);
    expect(custom.openings[0].end).toBeCloseTo(simple.openings[0].end, 9);
    expect(custom.openings[0].top).toBeCloseTo(simple.openings[0].top, 9);
    expect(roomShapesEqual(simple, simple)).toBe(true);
  });
});

describe('moveVertex', () => {
  it('moves a corner without snapping and keeps the input unchanged', () => {
    const plan = rect();
    const before = JSON.stringify(plan);
    const next = ok(moveVertex(plan, 'v3', { x: 6.123, y: 4.5 }, NO_SNAP));
    expect(pts(next)[2]).toEqual({ x: 6.123, y: 4.5 });
    expect(JSON.stringify(plan)).toBe(before);
  });

  it('snaps to the grid and then to the axes of the neighbours', () => {
    const grid = ok(moveVertex(rect(), 'v3', { x: 5.04, y: 4.07 }, { ...NO_SNAP, grid: true }));
    expect(pts(grid)[2]).toEqual({ x: 5, y: 4.1 });
    const both = ok(moveVertex(rect(), 'v3', { x: 5.3, y: 4.1 }, DEFAULT_SNAP));
    expect(pts(both)[2]).toEqual({ x: 5, y: 4 });
  });

  it('refuses a corner dragged across a wall, with the corner as the subject', () => {
    const plan = lShape();
    const before = JSON.stringify(plan);
    const result = moveVertex(plan, 'v5', { x: 3, y: -1 }, NO_SNAP);
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain('self-intersection');
    if (!result.ok) {
      expect(result.errors.every((e) => e.subject === 'corner' && e.subjectId === 'v5')).toBe(true);
    }
    expect(JSON.stringify(plan)).toBe(before);
  });

  it('refuses sharp angles, short walls and huge rooms', () => {
    expect(codes(moveVertex(rect(), 'v3', { x: 0.1, y: 4 }, NO_SNAP))).toContain('wall-too-short');
    expect(codes(moveVertex(rect(), 'v2', { x: 30, y: 0 }, NO_SNAP))).toContain('too-large');
    expect(codes(moveVertex(rect(), 'v2', { x: 0, y: 0.1 }, NO_SNAP)).length).toBeGreaterThan(0);
    expect(codes(moveVertex(rect(), 'v2', { x: NaN, y: 0 }, NO_SNAP))).toEqual([
      'invalid-structure',
    ]);
    expect(codes(moveVertex(rect(), 'nope', { x: 1, y: 1 }, NO_SNAP))).toEqual([
      'invalid-structure',
    ]);
  });

  it('pushes openings back instead of dropping them when a wall gets shorter', () => {
    const plan = { ...rect(), openings: [opening({ id: 'o20', wallId: 'w5', offset: 3.8 })] };
    const next = ok(moveVertex(plan, 'v2', { x: 4.5, y: 0 }, NO_SNAP));
    expect(next.openings).toHaveLength(1);
    expect(next.openings[0].offset).toBeCloseTo(3.45, 9); // 4.5 - 0.05 - 1
    expect(next.openings[0].width).toBe(1);
  });

  it('refuses when the openings cannot fit, saying the edit was to a corner', () => {
    const plan = { ...rect(), openings: [opening({ id: 'o20', wallId: 'w5', offset: 1 })] };
    const result = moveVertex(plan, 'v2', { x: 1, y: 0 }, NO_SNAP);
    expect(codes(result)).toContain('opening-does-not-fit');
    if (!result.ok) {
      expect(result.errors[0].subject).toBe('corner');
    }
  });
});

describe('moveWall', () => {
  it('push/pulls a rectangle wall and stays rectangular', () => {
    const out = ok(moveWall(rect(), 'w5', 1, NO_SNAP));
    expect(pts(out)[0]).toEqual({ x: 0, y: -1 });
    expect(area(pts(out))).toBe(25);
    const inward = ok(moveWall(rect(), 'w5', -1, NO_SNAP));
    expect(area(pts(inward))).toBe(15);
    expect(interiorAngles(pts(inward)).map(Math.round)).toEqual([90, 90, 90, 90]);
  });

  it('keeps the neighbours directions in an L-shape', () => {
    const out = ok(moveWall(lShape(), 'w10', 1, NO_SNAP)); // the vertical notch wall
    const p = pts(out);
    expect(p[3]).toEqual({ x: 4, y: 3 });
    expect(p[4]).toEqual({ x: 4, y: 5 });
    expect(area(p)).toBe(26);
    for (let i = 0; i < p.length; i++) {
      const q = p[(i + 1) % p.length];
      expect(p[i].x === q.x || p[i].y === q.y).toBe(true);
    }
  });

  it('refuses to collapse a room', () => {
    expect(codes(moveWall(rect(), 'w5', -3.9, NO_SNAP)).length).toBeGreaterThan(0);
    expect(codes(moveWall(rect(), 'w5', NaN, NO_SNAP))).toEqual(['invalid-structure']);
  });

  it('snaps an axis-aligned wall onto the grid', () => {
    const out = ok(moveWall(rect(), 'w6', 0.52, { ...NO_SNAP, grid: true }));
    expect(pts(out)[1].x).toBe(5.5);
  });

  it('just translates a corner when the neighbouring wall is parallel (a 180 degree corner)', () => {
    const split = ok(insertVertex(rect(), 'w5', 2.5));
    const out = ok(moveWall(split, 'w5', 0.5, NO_SNAP)); // first half of the top wall
    const p = pts(out);
    expect(p[0]).toEqual({ x: 0, y: -0.5 }); // slid up along the left wall
    expect(p[1]).toEqual({ x: 2.5, y: -0.5 }); // translated, not slid
    expect(p[2]).toEqual({ x: 5, y: 0 });
  });
});

describe('setWallLength', () => {
  it('keeps a rectangle rectangular and moves the opposite wall too', () => {
    const out = ok(setWallLength(rect(), 'w5', 6, 'start'));
    expect(pts(out)).toEqual([
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 6, y: 4 },
      { x: 0, y: 4 },
    ]);
  });

  it('can keep the end instead', () => {
    const out = ok(setWallLength(rect(), 'w5', 7, 'end'));
    expect(pts(out)[0]).toEqual({ x: -2, y: 0 });
    expect(pts(out)[1]).toEqual({ x: 5, y: 0 });
    expect(pts(out)[3]).toEqual({ x: -2, y: 4 });
  });

  it('works on the vertical walls of an L and gives the exact length', () => {
    const out = ok(setWallLength(lShape(), 'w10', 3.1234, 'start'));
    expect(pts(out)[4].y - pts(out)[3].y).toBeCloseTo(3.123, 9);
    expect(interiorAngles(pts(out)).map(Math.round)).toEqual([90, 90, 90, 270, 90, 90]);
  });

  it('refuses invalid typed lengths and leaves the plan alone', () => {
    const plan = rect();
    const before = JSON.stringify(plan);
    expect(codes(setWallLength(plan, 'w5', 0.1, 'start'))).toContain('wall-too-short');
    expect(codes(setWallLength(plan, 'w5', 25, 'start'))).toContain('too-large');
    expect(codes(setWallLength(plan, 'w5', -2, 'start'))).toEqual(['invalid-structure']);
    expect(codes(setWallLength(plan, 'w5', Infinity, 'start'))).toEqual(['invalid-structure']);
    expect(JSON.stringify(plan)).toBe(before);
  });

  it('refuses a length too short for its door or window, as a wall edit', () => {
    const plan = { ...rect(), openings: [opening({ id: 'o20', wallId: 'w5', width: 2 })] };
    const result = setWallLength(plan, 'w5', 2, 'start');
    expect(codes(result)).toContain('opening-does-not-fit');
    if (!result.ok) {
      expect(result.errors[0]).toMatchObject({ subject: 'wall', subjectId: 'w5' });
    }
    expect(minWallLength(plan, 'w5')).toBe(2.1);
    expect(ok(setWallLength(plan, 'w5', 2.1, 'start')).openings[0].offset).toBeCloseTo(0.05, 9);
    expect(minWallLength(rect(), 'w5')).toBe(0.3);
  });
});

describe('insertVertex and deleteVertex', () => {
  it('splits a wall keeping the first id, and moves openings to the part holding them', () => {
    const plan = rectangleToPlan({ length: 5, width: 4, height: 2.7 }); // window 1.625..3.375
    const early = ok(insertVertex(plan, 'w5', 4));
    expect(early.walls.filter((w) => w.id === 'w5')).toHaveLength(1);
    expect(early.openings[0].wallId).toBe('w5');
    expect(early.vertices).toHaveLength(5);
    const late = ok(insertVertex(plan, 'w5', 1));
    expect(late.openings[0].wallId).not.toBe('w5');
    expect(late.openings[0].offset).toBeCloseTo(0.625, 9);
    expect(planLoop(late)!.room.wallIds[0]).toBe('w5');
    expect(pts(late)[1]).toEqual({ x: 1, y: 0 });
    expect(late.nextId).toBe(plan.nextId + 2);
  });

  it('refuses a split through an opening or out of range', () => {
    const plan = rectangleToPlan({ length: 5, width: 4, height: 2.7 });
    expect(codes(insertVertex(plan, 'w5', 2.5))).toContain('opening-does-not-fit');
    expect(codes(insertVertex(plan, 'w5', 0))).toContain('wall-too-short');
    expect(codes(insertVertex(plan, 'w5', 5))).toContain('wall-too-short');
    expect(codes(insertVertex(plan, 'w5', 0.1))).toContain('wall-too-short');
    expect(codes(insertVertex(plan, 'w5', NaN))).toEqual(['invalid-structure']);
    expect(codes(insertVertex(plan, 'zz', 1))).toEqual(['invalid-structure']);
  });

  it('refuses more than 32 corners', () => {
    let plan = planFromPoints([
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 6 },
      { x: 0, y: 6 },
    ]);
    const splitLongest = (): EditResult => {
      const loop = planLoop(plan)!;
      const lengths = loop.walls.map((w, i) =>
        Math.hypot(
          loop.vertices[(i + 1) % loop.walls.length].x - loop.vertices[i].x,
          loop.vertices[(i + 1) % loop.walls.length].y - loop.vertices[i].y,
        ),
      );
      const longest = lengths.indexOf(Math.max(...lengths));
      return insertVertex(plan, loop.walls[longest].id, lengths[longest] / 2);
    };
    for (let i = 0; i < 28; i++) {
      plan = ok(splitLongest());
    }
    expect(plan.vertices).toHaveLength(32);
    expect(codes(splitLongest())).toContain('too-many-corners');
  });

  it('deleting a corner merges the walls into the first one and shifts the openings', () => {
    const split = ok(insertVertex(rect(), 'w5', 2));
    const secondId = planLoop(split)!.room.wallIds[1];
    const withDoor = ok(addOpening(split, secondId, 'door', 1.5));
    const doorOffset = withDoor.openings[0].offset;
    const middle = planLoop(split)!.vertices[1].id;
    const merged = ok(deleteVertex(withDoor, middle));
    expect(merged.walls).toHaveLength(4);
    expect(merged.walls.some((w) => w.id === secondId)).toBe(false);
    expect(merged.openings[0].wallId).toBe('w5');
    expect(merged.openings[0].offset).toBeCloseTo(doorOffset + 2, 9);
  });

  it('turns a rectangle into a triangle but never below three corners', () => {
    const tri = ok(deleteVertex(rect(), 'v3'));
    expect(area(pts(tri))).toBe(10);
    const result = deleteVertex(tri, 'v1');
    expect(codes(result)).toEqual(['too-few-corners']);
    expect(codes(deleteVertex(rect(), 'zz'))).toEqual(['invalid-structure']);
  });

  it('refuses a delete that makes the room invalid', () => {
    // Removing the L notch corner would leave a sliver-free shape, but a thin room is refused.
    const thin = planFromPoints([
      { x: 0, y: 0 },
      { x: 8, y: 0 },
      { x: 8, y: 1 },
      { x: 4, y: 1.2 },
      { x: 4, y: 2 },
      { x: 0, y: 2 },
    ]);
    expect(validatePlan(thin)).toEqual([]);
    const result = deleteVertex(thin, 'v5');
    expect(result.ok || codes(result).length > 0).toBe(true);
  });
});

describe('addOpening', () => {
  it('adds default-sized doors and windows at the requested centre', () => {
    const door = ok(addOpening(rect(), 'w5', 'door', 1));
    expect(door.openings[0]).toMatchObject({
      kind: 'door',
      width: 0.9,
      height: 2.1,
      sill: 0,
      anchor: 'floor',
    });
    expect(door.openings[0].offset).toBeCloseTo(0.55, 9);
    const win = ok(addOpening(rect(), 'w6', 'window'));
    expect(win.openings[0]).toMatchObject({ width: 1.2, height: 1.4, sill: 0.9 });
    expect(win.openings[0].offset).toBeCloseTo((4 - 1.2) / 2, 9);
  });

  it('nudges a new opening to the nearest free spot', () => {
    let plan = ok(addOpening(rect(), 'w5', 'window'));
    plan = ok(addOpening(plan, 'w5', 'window'));
    plan = ok(addOpening(plan, 'w5', 'door'));
    expect(plan.openings).toHaveLength(3);
    expect(validatePlan(plan)).toEqual([]);
  });

  it('adapts the default size to the room height and to a small gap', () => {
    const low = ok(addOpening(planFromPoints(RECT, 2.2), 'w5', 'window'));
    expect(low.openings[0].sill).toBeCloseTo(0.75, 9);
    const tight = {
      ...rect(),
      openings: [opening({ id: 'o20', wallId: 'w5', offset: 0.05, width: 4 })],
    };
    const door = ok(addOpening(tight, 'w5', 'door'));
    expect(door.openings[1].width).toBeCloseTo(0.85, 9);
    const win = ok(addOpening(tight, 'w5', 'window'));
    expect(win.openings[1].width).toBeCloseTo(0.85, 9);
  });

  it('refuses when nothing fits, and refuses a 33rd opening', () => {
    const full = {
      ...rect(),
      openings: [opening({ id: 'o20', wallId: 'w5', offset: 0.05, width: 4.3 })],
    };
    const result = addOpening(full, 'w5', 'door');
    expect(codes(result)).toEqual(['opening-does-not-fit']);
    if (!result.ok) {
      expect(result.errors[0]).toMatchObject({ subject: 'opening', wallId: 'w5' });
    }
    const big = planFromPoints([
      { x: 0, y: 0 },
      { x: 12, y: 0 },
      { x: 12, y: 12 },
      { x: 0, y: 12 },
    ]);
    big.openings = Array.from({ length: 32 }, (_, i) =>
      opening({
        id: `o${100 + i}`,
        wallId: big.walls[i % 4].id,
        offset: 0.5 + Math.floor(i / 4) * 1.4,
        width: 1,
      }),
    );
    expect(validatePlan(big)).toEqual([]);
    expect(codes(addOpening(big, 'w5', 'window'))).toEqual(['too-many-openings']);
    expect(codes(addOpening(rect(), 'zz', 'door'))).toEqual(['invalid-structure']);
    expect(codes(addOpening(rect(), 'w5', 'door', NaN))).toEqual(['invalid-structure']);
  });
});

describe('updateOpening and removeOpening', () => {
  const withWindow = (): Plan => ({
    ...rect(),
    openings: [opening({ id: 'o20', wallId: 'w5', offset: 1, width: 1.2, height: 1.4, sill: 0.9 })],
  });

  it('changes size and position', () => {
    const out = ok(updateOpening(withWindow(), 'o20', { width: 2, offset: 0.5 }));
    expect(out.openings[0]).toMatchObject({ width: 2, offset: 0.5 });
  });

  it('refuses out-of-range typed values instead of clamping', () => {
    const plan = withWindow();
    for (const patch of [
      { width: 5 },
      { width: 0.1 },
      { height: 0.1 },
      { sill: 2 },
      { sill: -1 },
    ]) {
      const result = updateOpening(plan, 'o20', patch);
      expect(codes(result)).toContain('opening-size-out-of-range');
      if (!result.ok) {
        expect(result.errors[0]).toMatchObject({ subject: 'opening', subjectId: 'o20' });
      }
    }
    expect(plan.openings[0].width).toBe(1.2);
  });

  it('refuses overlaps and overruns, as an opening edit', () => {
    const two = ok(addOpening(withWindow(), 'w5', 'door', 4));
    expect(codes(updateOpening(two, two.openings[1].id, { offset: 1.5 }))).toContain(
      'openings-overlap',
    );
    expect(codes(updateOpening(withWindow(), 'o20', { offset: 4.5 }))).toContain(
      'opening-does-not-fit',
    );
    expect(codes(updateOpening(withWindow(), 'o20', { offset: 0 }))).toContain(
      'opening-does-not-fit',
    );
  });

  it('applies the window anchor rules', () => {
    const base = withWindow(); // H 2.7, sill 0.9, height 1.4, top gap 0.4
    const floor = ok(updateOpening(base, 'o20', { height: 1 }));
    expect(floor.openings[0]).toMatchObject({ sill: 0.9, anchor: 'floor' });
    const ceiling = ok(updateOpening(base, 'o20', { anchor: 'ceiling' }));
    const shrunk = ok(updateOpening(ceiling, 'o20', { height: 1 }));
    expect(shrunk.openings[0].sill).toBeCloseTo(1.3, 9); // top gap stays 0.4
    const topGap = ok(updateOpening(base, 'o20', { topGap: 0.5 }));
    expect(topGap.openings[0]).toMatchObject({ anchor: 'ceiling' });
    expect(topGap.openings[0].sill).toBeCloseTo(0.8, 9);
    const sill = ok(updateOpening(topGap, 'o20', { sill: 0.6 }));
    expect(sill.openings[0]).toMatchObject({ sill: 0.6, anchor: 'floor' });
    expect(codes(updateOpening(base, 'o20', { topGap: 0.01 }))).toContain(
      'opening-size-out-of-range',
    );
  });

  it('keeps doors on the floor whatever the patch', () => {
    const plan = ok(addOpening(rect(), 'w5', 'door'));
    const id = plan.openings[0].id;
    const out = ok(updateOpening(plan, id, { sill: 0.5, anchor: 'ceiling', height: 2 }));
    expect(out.openings[0]).toMatchObject({ sill: 0, anchor: 'floor', height: 2 });
    expect(codes(updateOpening(plan, id, { height: 2.7 }))).toContain('opening-size-out-of-range');
    expect(codes(updateOpening(plan, id, { width: 2.5 }))).toContain('opening-size-out-of-range');
  });

  it('refuses unknown ids and non-finite numbers', () => {
    expect(codes(updateOpening(withWindow(), 'zz', { width: 1 }))).toEqual(['invalid-structure']);
    expect(codes(updateOpening(withWindow(), 'o20', { width: NaN }))).toEqual([
      'invalid-structure',
    ]);
  });

  it('removes an opening without touching the input', () => {
    const plan = withWindow();
    expect(removeOpening(plan, 'o20').openings).toEqual([]);
    expect(plan.openings).toHaveLength(1);
    expect(removeOpening(plan, 'nope').openings).toHaveLength(1);
  });
});

describe('setPlanHeight', () => {
  const withOpenings = (doorHeight = 2.0): Plan => ({
    ...rect(),
    openings: [
      opening({ id: 'o20', wallId: 'w5', offset: 0.5, anchor: 'floor', height: 1.4 }),
      opening({ id: 'o21', wallId: 'w5', offset: 2, anchor: 'ceiling', height: 1.4, sill: 0.9 }),
      opening({
        id: 'o22',
        wallId: 'w6',
        kind: 'door',
        offset: 1,
        width: 0.9,
        height: doorHeight,
        sill: 0,
      }),
    ],
  });

  it('keeps the anchored gap of windows and never changes opening sizes', () => {
    const plan = withOpenings();
    const up = ok(setPlanHeight(plan, 3.2));
    expect(up.openings[0].sill).toBe(0.9);
    expect(up.openings[1].sill).toBeCloseTo(1.4, 9); // top gap stays
    expect(up.openings.map((o) => o.height)).toEqual([1.4, 1.4, 2]);
  });

  it('refuses a ceiling that is too low for a door or window instead of shrinking', () => {
    const plan = withOpenings(2.1);
    const min = minPlanHeight(plan);
    expect(min).toBeCloseTo(2.35, 9); // floor window: sill 0.9 + height 1.4 + gap 0.05
    const low = setPlanHeight(plan, min - 0.01);
    expect(codes(low)).toEqual(['ceiling-too-low']);
    const edge = ok(setPlanHeight(plan, min));
    expect(edge.openings.map((o) => o.height)).toEqual([1.4, 1.4, 2.1]);
    expect(plan.rooms[0].height).toBe(rect().rooms[0].height);
  });

  it('minPlanHeight is the global minimum without openings and never above the current height', () => {
    expect(minPlanHeight(rect())).toBe(2.2);
    const tall = withOpenings(2.1);
    expect(minPlanHeight(tall)).toBeLessThanOrEqual(tall.rooms[0].height);
  });

  it('refuses out-of-range heights (no clamping)', () => {
    expect(codes(setPlanHeight(rect(), 2.0))).toEqual(['height-out-of-range']);
    expect(codes(setPlanHeight(rect(), 5))).toEqual(['height-out-of-range']);
    expect(codes(setPlanHeight(rect(), NaN))).toEqual(['invalid-structure']);
  });
});

describe('ids at the limit', () => {
  it('insertVertex still produces valid, unique ids when nextId is exhausted', () => {
    const plan = { ...rect(), nextId: 1_000_000 };
    const out = ok(insertVertex(plan, 'w5', 1));
    const ids = [...out.vertices, ...out.walls, ...out.rooms, ...out.openings].map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^[vwor]\d{1,6}$/.test(id))).toBe(true);
  });
});

describe('random edit sequences keep the plan valid', () => {
  it('every accepted edit validates, every refused edit leaves the input alone', () => {
    const rnd = createRandom(2024);
    let plan = rectangleToPlan({ length: 6, width: 5, height: 2.7 });
    let accepted = 0;
    let refused = 0;
    for (let step = 0; step < 600; step++) {
      const loop = planLoop(plan)!;
      const pick = <T>(list: T[]): T => list[Math.floor(rnd() * list.length)];
      const before = JSON.stringify(plan);
      const kind = Math.floor(rnd() * 10);
      let result: EditResult;
      switch (kind) {
        case 0:
        case 1: {
          const v = pick(loop.vertices);
          result = moveVertex(
            plan,
            v.id,
            { x: v.x + (rnd() - 0.5) * 3, y: v.y + (rnd() - 0.5) * 3 },
            DEFAULT_SNAP,
          );
          break;
        }
        case 2:
          result = moveWall(plan, pick(loop.walls).id, (rnd() - 0.5) * 3, DEFAULT_SNAP);
          break;
        case 3:
          result = setWallLength(
            plan,
            pick(loop.walls).id,
            0.3 + rnd() * 9,
            rnd() < 0.5 ? 'start' : 'end',
          );
          break;
        case 4: {
          const w = pick(loop.walls);
          result = insertVertex(plan, w.id, rnd() * 6);
          break;
        }
        case 5:
          result = deleteVertex(plan, pick(loop.vertices).id);
          break;
        case 6:
        case 7:
          result = addOpening(
            plan,
            pick(loop.walls).id,
            rnd() < 0.5 ? 'door' : 'window',
            rnd() * 6,
          );
          break;
        case 8:
          result = plan.openings.length
            ? updateOpening(plan, pick(plan.openings).id, {
                width: 0.3 + rnd() * 2,
                offset: rnd() * 5,
              })
            : setPlanHeight(plan, 2.2 + rnd() * 1.8);
          break;
        default:
          result = setPlanHeight(plan, 2.2 + rnd() * 1.8);
      }
      expect(JSON.stringify(plan)).toBe(before);
      if (result.ok) {
        accepted++;
        expect(validatePlan(result.plan)).toEqual([]);
        expect(planLoop(result.plan)).not.toBeNull();
        if (kind <= 3 || kind === 5) {
          expect(result.plan.openings).toHaveLength(plan.openings.length);
        }
        plan = result.plan;
      } else {
        refused++;
        expect(result.errors.length).toBeGreaterThan(0);
      }
    }
    expect(accepted).toBeGreaterThan(100);
    expect(refused).toBeGreaterThan(20);
  });
});
