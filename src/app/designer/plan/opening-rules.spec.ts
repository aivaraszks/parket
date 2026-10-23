import { describe, expect, it } from 'vitest';
import {
  deleteVertex,
  insertVertex,
  moveVertex,
  moveWall,
  NO_SNAP,
  setPlanHeight,
  setWallLength,
} from './plan-edit';
import { opening, planFromPoints, RECT } from './plan-fixtures';
import { EditResult, Plan } from './plan-model';
import { validatePlan } from './plan-validate';

// Rectangle 5 x 4: top wall w5 (v1 -> v2), right w6, bottom w7, left w8.
function withOpenings(): Plan {
  const plan = planFromPoints(RECT);
  plan.openings = [
    opening({
      id: 'o20',
      wallId: 'w5',
      kind: 'door',
      offset: 0.5,
      width: 0.9,
      height: 2.1,
      sill: 0,
    }),
    opening({ id: 'o21', wallId: 'w5', kind: 'window', offset: 2.0, width: 1.2 }),
  ];
  plan.nextId = 22;
  return plan;
}

function accepted(r: EditResult): Plan {
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  expect(validatePlan(r.plan)).toEqual([]);
  return r.plan;
}

const byId = (plan: Plan, id: string) => plan.openings.find((o) => o.id === id)!;

describe('openings when walls move', () => {
  it('keeps their offsets while the wall stays long enough', () => {
    const plan = accepted(moveVertex(withOpenings(), 'v2', { x: 4, y: 0 }, NO_SNAP));
    expect(byId(plan, 'o20').offset).toBe(0.5);
    expect(byId(plan, 'o21').offset).toBe(2);
  });

  it('keeps their offsets (from the from-corner) when the wall grows', () => {
    const plan = accepted(moveVertex(withOpenings(), 'v2', { x: 8, y: 0 }, NO_SNAP));
    expect(plan.openings.map((o) => o.offset)).toEqual([0.5, 2]);
  });

  it('pushes the far opening back toward the start, in order, never shrinking or dropping', () => {
    const before = withOpenings();
    const plan = accepted(moveVertex(before, 'v2', { x: 3, y: 0 }, NO_SNAP));
    expect(plan.openings).toHaveLength(2);
    const door = byId(plan, 'o20');
    const win = byId(plan, 'o21');
    expect(door.width).toBe(0.9);
    expect(win.width).toBe(1.2);
    expect(door.offset).toBe(0.5);
    expect(win.offset).toBeGreaterThanOrEqual(door.offset + door.width + 0.05 - 1e-9);
    expect(win.offset + win.width).toBeLessThanOrEqual(3 - 0.05 + 1e-9);
  });

  it('packs exactly at the minimum wall length and refuses 1 mm less', () => {
    // margin 0.05 + door 0.9 + gap 0.05 + window 1.2 + margin 0.05 = 2.25 m
    const tight = accepted(setWallLength(withOpenings(), 'w5', 2.25, 'start'));
    expect(tight.openings).toHaveLength(2);
    const refused = setWallLength(withOpenings(), 'w5', 2.249, 'start');
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.errors.map((e) => e.code)).toContain('opening-does-not-fit');
    }
  });

  it('refuses a drag that would not fit and leaves the plan (and openings) untouched', () => {
    const plan = withOpenings();
    const snapshot = JSON.stringify(plan);
    const r = moveVertex(plan, 'v2', { x: 1.5, y: 0 }, NO_SNAP);
    expect(r.ok).toBe(false);
    expect(JSON.stringify(plan)).toBe(snapshot);
  });

  it('a neighbouring wall pushed sideways changes the length of the walls it touches', () => {
    // Moving the right wall in by 2 m shortens the top wall (and its openings are pushed).
    const plan = accepted(moveWall(withOpenings(), 'w6', -2, NO_SNAP));
    expect(plan.openings).toHaveLength(2);
    for (const o of plan.openings) {
      expect(o.offset + o.width).toBeLessThanOrEqual(3 - 0.05 + 1e-9);
    }
  });

  it('moving the wall that carries the openings leaves their offsets alone', () => {
    const plan = accepted(moveWall(withOpenings(), 'w5', 0.5, NO_SNAP));
    expect(plan.openings.map((o) => [o.wallId, o.offset])).toEqual([
      ['w5', 0.5],
      ['w5', 2],
    ]);
  });

  it('a split moves each opening to the part containing it and rewrites the offset', () => {
    const split = accepted(insertVertex(withOpenings(), 'w5', 1.7));
    const cut = split.vertices.find((v) => v.x === 1.7 && v.y === 0)!;
    const second = split.walls.find((w) => w.from === cut.id)!;
    const door = byId(split, 'o20');
    const win = byId(split, 'o21');
    expect(door.wallId).toBe('w5');
    expect(door.offset).toBe(0.5);
    expect(win.wallId).toBe(second.id);
    expect(win.offset).toBeCloseTo(0.3, 9);
  });

  it('deleting the corner after the door merges walls and shifts the later openings', () => {
    const split = accepted(insertVertex(withOpenings(), 'w5', 1.7));
    const newVertex = split.vertices.find((v) => v.x === 1.7 && v.y === 0)!;
    const merged = accepted(deleteVertex(split, newVertex.id));
    expect(merged.walls).toHaveLength(4);
    expect(byId(merged, 'o21').wallId).toBe('w5');
    expect(byId(merged, 'o21').offset).toBeCloseTo(2, 9);
  });

  it('door width changes in the room height edit keep doors on the floor', () => {
    const plan = accepted(setPlanHeight(withOpenings(), 2.2));
    const door = byId(plan, 'o20');
    expect(door.sill).toBe(0);
    expect(door.height).toBeLessThanOrEqual(2.2 - 0.05 + 1e-9);
  });

  it('never loses an opening over a long sequence of wall shrink and grow', () => {
    let plan = withOpenings();
    for (const x of [4.5, 4, 3.5, 3, 2.6, 3.5, 5, 7]) {
      const r = moveVertex(plan, 'v2', { x, y: 0 }, NO_SNAP);
      if (r.ok) plan = r.plan;
      expect(plan.openings).toHaveLength(2);
      expect(validatePlan(plan)).toEqual([]);
    }
  });
});
