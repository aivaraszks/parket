import { describe, expect, it } from 'vitest';
import { createRandom } from '../scene/random';
import { rectangleToPlan } from './plan-edit';
import { L_SHAPE, opening, planFromPoints } from './plan-fixtures';
import { Plan, planLoop } from './plan-model';
import { sanitizePlan } from './plan-sanitize';
import { validatePlan } from './plan-validate';
import { signedArea } from './polygon';

const rect = (): Plan => rectangleToPlan({ length: 5, width: 4, height: 2.7 });
const json = (plan: unknown): unknown => JSON.parse(JSON.stringify(plan));

describe('sanitizePlan', () => {
  it('passes a valid plan through unchanged', () => {
    const plan = rect();
    expect(sanitizePlan(json(plan))).toEqual(plan);
    const l = {
      ...planFromPoints(L_SHAPE),
      nextId: 41,
      openings: [opening({ id: 'o40', wallId: 'w7' })],
    };
    expect(sanitizePlan(json(l))).toEqual(l);
  });

  it('rejects non-objects and wrong shapes', () => {
    for (const bad of [undefined, null, 5, 'x', [], {}, { rooms: [] }, { rooms: 'x' }]) {
      expect(sanitizePlan(bad)).toBeNull();
    }
    const noRoom = json(rect()) as Record<string, unknown>;
    noRoom['rooms'] = [];
    expect(sanitizePlan(noRoom)).toBeNull();
    const twoRooms = json(rect()) as { rooms: unknown[] };
    twoRooms.rooms.push(twoRooms.rooms[0]);
    expect(sanitizePlan(twoRooms)).toBeNull();
  });

  it('rejects non-finite numbers in coordinates, but clamps and rounds finite ones', () => {
    for (const value of [NaN, Infinity, '3', null, undefined]) {
      const raw = json(rect()) as Plan;
      (raw.vertices[1] as unknown as Record<string, unknown>)['x'] = value;
      expect(sanitizePlan(raw)).toBeNull();
    }
    const huge = json(rect()) as Plan;
    huge.vertices[1].x = 1e9; // clamped to 50 m: then too large
    expect(sanitizePlan(huge)).toBeNull();
    const round = json(rect()) as Plan;
    round.vertices[1].x = 5.0004;
    expect(sanitizePlan(round)!.vertices[1].x).toBe(5);
  });

  it('rejects bad, duplicate and dangling ids', () => {
    const mutate = (change: (raw: Plan) => void): Plan | null => {
      const raw = json(rect()) as Plan;
      change(raw);
      return sanitizePlan(raw);
    };
    expect(mutate((r) => (r.vertices[0].id = 'x1'))).toBeNull();
    expect(mutate((r) => (r.vertices[0].id = 'v1234567'))).toBeNull();
    expect(mutate((r) => (r.vertices[0].id = '__proto__'))).toBeNull();
    expect(mutate((r) => (r.vertices[1].id = r.vertices[0].id))).toBeNull();
    expect(mutate((r) => (r.walls[1].id = r.walls[0].id))).toBeNull();
    expect(mutate((r) => (r.walls[0].to = 'v99'))).toBeNull();
    expect(mutate((r) => (r.walls[0].to = r.walls[0].from))).toBeNull();
    expect(mutate((r) => (r.rooms[0].wallIds[0] = 'w99'))).toBeNull();
    expect(mutate((r) => r.rooms[0].wallIds.pop())).toBeNull();
    expect(mutate((r) => (r.rooms[0].wallIds[1] = r.rooms[0].wallIds[0]))).toBeNull();
    expect(mutate((r) => (r.rooms[0].id = 'room'))).toBeNull();
  });

  it('rejects walls that do not form one closed loop', () => {
    const open = json(rect()) as Plan;
    open.walls[3].to = 'v2';
    expect(sanitizePlan(open)).toBeNull();
    const split = json(planFromPoints([...L_SHAPE])) as Plan;
    split.walls[2].from = 'v1';
    expect(sanitizePlan(split)).toBeNull();
  });

  it('rejects a self-intersecting loop and invalid geometry', () => {
    const bow = json(
      planFromPoints([
        { x: 0, y: 0 },
        { x: 4, y: 4 },
        { x: 4, y: 0 },
        { x: 0, y: 4 },
      ]),
    ) as Plan;
    expect(sanitizePlan(bow)).toBeNull();
    const tiny = json(
      planFromPoints([
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ]),
    ) as Plan;
    expect(sanitizePlan(tiny)).toBeNull();
  });

  it('fixes a reversed winding, mirroring the openings along their walls', () => {
    const base = {
      ...rect(),
      openings: [opening({ id: 'o20', wallId: 'w6', offset: 0.5, width: 1 })],
    };
    // Reverse the loop the way a hostile blob could: reversed wall order and directions.
    const reversed: Plan = {
      vertices: [...base.vertices].reverse(),
      walls: [...base.walls].reverse().map((w) => ({ id: w.id, from: w.to, to: w.from })),
      rooms: [{ ...base.rooms[0], wallIds: [...base.rooms[0].wallIds].reverse() }],
      openings: [{ ...base.openings[0], offset: 4 - 0.5 - 1 }],
      nextId: base.nextId,
    };
    expect(signedArea(reversed.vertices)).toBeLessThan(0);
    const fixed = sanitizePlan(json(reversed))!;
    expect(fixed).not.toBeNull();
    expect(validatePlan(fixed)).toEqual([]);
    expect(signedArea(planLoopPoints(fixed))).toBe(20);
    // The window is at the same place in the room: 0.5 m from the corner at (5, 0) on wall w6.
    const wall = fixed.walls.find((w) => w.id === 'w6')!;
    const from = fixed.vertices.find((v) => v.id === wall.from)!;
    const o = fixed.openings[0];
    expect(Math.abs(o.offset - (from.y === 0 ? 0.5 : 2.5))).toBeLessThan(1e-9);
  });

  it('re-orients individual walls and accepts any array order', () => {
    const base = rect();
    const shuffled: Plan = json({
      ...base,
      vertices: [...base.vertices].reverse(),
      walls: base.walls.map((w, i) => (i % 2 ? { id: w.id, from: w.to, to: w.from } : w)),
      openings: [],
    }) as Plan;
    const fixed = sanitizePlan(shuffled)!;
    expect(fixed).not.toBeNull();
    expect(planLoop(fixed)).not.toBeNull();
    expect(validatePlan(fixed)).toEqual([]);
    expect(signedArea(planLoopPoints(fixed))).toBe(20);
  });

  it('drops bad openings one by one and keeps the good ones', () => {
    const raw = json({
      ...rect(),
      openings: [
        opening({ id: 'o20', wallId: 'w6', offset: 0.5 }),
        opening({ id: 'o21', wallId: 'w6', offset: 0.6 }), // overlaps o20
        opening({ id: 'o22', wallId: 'w99' }), // dangling
        opening({ id: 'o23', wallId: 'w7', width: 9 }), // too big
        { id: 'o24', wallId: 'w7', kind: 'portal', offset: 1, width: 1, height: 1, sill: 0 },
        { id: 'o25', wallId: 'w7', kind: 'window', offset: NaN, width: 1, height: 1, sill: 0 },
        opening({ id: 'o20', wallId: 'w7' }), // duplicate id
        null,
        'x',
      ],
    }) as Plan;
    const out = sanitizePlan(raw)!;
    expect(out.openings.map((o) => o.id).sort()).toEqual(['o20']);
    expect(validatePlan(out)).toEqual([]);
  });

  it('forces doors onto the floor and unknown anchors to floor', () => {
    const raw = json({
      ...rect(),
      openings: [
        opening({
          id: 'o20',
          wallId: 'w6',
          kind: 'door',
          height: 2.1,
          sill: 0.5,
          anchor: 'ceiling',
        }),
        { ...opening({ id: 'o21', wallId: 'w7' }), anchor: 'sideways' },
      ],
    }) as Plan;
    const out = sanitizePlan(raw)!;
    expect(out.openings.find((o) => o.id === 'o20')).toMatchObject({ sill: 0, anchor: 'floor' });
    expect(out.openings.find((o) => o.id === 'o21')?.anchor).toBe('floor');
  });

  it('caps array sizes before iterating', () => {
    const huge = Array.from({ length: 1_000_000 }, (_, i) => ({ id: `v${i % 1000}`, x: 0, y: 0 }));
    const raw = json(rect()) as Plan;
    raw.vertices = huge as Plan['vertices'];
    const started = Date.now();
    expect(sanitizePlan(raw)).toBeNull();
    expect(Date.now() - started).toBeLessThan(500);
    const many = json(rect()) as Plan;
    many.openings = Array.from({ length: 1_000_000 }, () => opening({ id: 'o1', wallId: 'w5' }));
    expect(sanitizePlan(many)).toBeNull();
    const walls = json(rect()) as Plan;
    walls.rooms[0].wallIds = new Array(1_000_000).fill('w5');
    expect(sanitizePlan(walls)).toBeNull();
  });

  it('repairs nextId so new ids never collide', () => {
    const raw = json(rect()) as Plan;
    raw.nextId = -4;
    expect(sanitizePlan(raw)!.nextId).toBe(10);
    raw.nextId = 1e12;
    expect(sanitizePlan(raw)!.nextId).toBe(11);
    raw.nextId = 3.5;
    expect(sanitizePlan(raw)!.nextId).toBe(10);
  });

  it('renumbers ids compactly when they are near the id limit', () => {
    const raw = json(rect()) as Plan;
    raw.vertices[0].id = 'v999999';
    raw.walls[0].from = 'v999999';
    raw.walls[3].to = 'v999999';
    raw.nextId = 1_000_000;
    const plan = sanitizePlan(raw)!;
    expect(plan).not.toBeNull();
    expect(plan.nextId).toBeLessThan(100);
    const ids = [...plan.vertices, ...plan.walls, ...plan.rooms, ...plan.openings].map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^[vwor]\d{1,6}$/.test(id))).toBe(true);
    expect(validatePlan(plan)).toEqual([]);
    expect(plan.openings).toHaveLength(1);
  });

  it('ignores prototype pollution payloads', () => {
    const raw = JSON.parse(
      '{"__proto__":{"polluted":1},"rooms":[],"vertices":[],"walls":[],"openings":[]}',
    ) as unknown;
    expect(sanitizePlan(raw)).toBeNull();
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it('survives a fuzz of mutated plans: the result is null or fully valid', () => {
    const rnd = createRandom(99);
    const junk = [
      NaN,
      Infinity,
      -1,
      0,
      1e9,
      -1e9,
      'v1',
      'w5',
      null,
      undefined,
      {},
      [],
      true,
      'x'.repeat(50),
    ];
    const mutate = (value: unknown, depth: number): unknown => {
      if (Array.isArray(value)) {
        const copy = value.map((item) =>
          rnd() < 0.01 ? junk[Math.floor(rnd() * junk.length)] : mutate(item, depth + 1),
        );
        if (rnd() < 0.01) copy.pop();
        if (rnd() < 0.02) copy.reverse();
        if (rnd() < 0.01) copy.push(copy[0]);
        return copy;
      }
      if (typeof value === 'object' && value !== null) {
        const copy: Record<string, unknown> = {};
        for (const [key, v] of Object.entries(value)) {
          if (rnd() < 0.005) continue;
          copy[key] = rnd() < 0.01 ? junk[Math.floor(rnd() * junk.length)] : mutate(v, depth + 1);
        }
        return copy;
      }
      return value;
    };
    const seeds = [
      { ...rect(), openings: [opening({ id: 'o20', wallId: 'w6', offset: 0.5 })] },
      { ...planFromPoints(L_SHAPE), openings: [opening({ id: 'o40', wallId: 'w7' })] },
    ];
    let valid = 0;
    let rejected = 0;
    for (let i = 0; i < 1500; i++) {
      const result = sanitizePlan(mutate(json(seeds[i % 2]), 0));
      if (result === null) {
        rejected++;
        continue;
      }
      valid++;
      expect(validatePlan(result)).toEqual([]);
      expect(planLoop(result)).not.toBeNull();
      expect(signedArea(planLoopPoints(result))).toBeGreaterThan(0);
      expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    }
    expect(valid).toBeGreaterThan(50);
    expect(rejected).toBeGreaterThan(50);
  });
});

function planLoopPoints(plan: Plan): { x: number; y: number }[] {
  return planLoop(plan)!.vertices.map((v) => ({ x: v.x, y: v.y }));
}
