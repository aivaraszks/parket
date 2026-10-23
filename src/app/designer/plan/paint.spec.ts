import { describe, expect, it } from 'vitest';
import { DEFAULT_DESIGN, Design } from '../state/design-defaults';
import {
  applySurfaceColor,
  autoDoorColor,
  hasAccentWalls,
  normalizeHex,
  paintsEqual,
  resolvePaint,
  sameSurface,
  stripPlanColors,
  SurfaceRef,
  surfaceExists,
} from './paint';
import { deleteVertex, insertVertex, rectangleToPlan } from './plan-edit';
import { L_SHAPE, opening, planFromPoints } from './plan-fixtures';
import { Plan } from './plan-model';
import { compactIds, sanitizePlan } from './plan-sanitize';
import { RoomShape, roomShapesEqual, toRoomShape } from './room-shape';

const simpleDesign = (): Design => structuredClone(DEFAULT_DESIGN) as Design;

function customDesign(plan: Plan): Design {
  return { ...simpleDesign(), mode: 'custom', plan };
}

/** L-shape (walls w7..w12) with one door on w8. */
function lPlan(): Plan {
  const plan = planFromPoints(L_SHAPE);
  plan.openings.push(
    opening({ id: 'o99', wallId: 'w8', kind: 'door', width: 0.9, height: 2.1, sill: 0 }),
  );
  return plan;
}

const apply = (d: Design, ref: SurfaceRef, hex: string | null): Design =>
  applySurfaceColor(d, toRoomShape(d), ref, hex);

describe('normalizeHex', () => {
  it.each([
    [123, null],
    [null, null],
    ['#fff', null],
    ['#12345g', null],
    ['112233', null],
    ['#1122334', null],
    ['x'.repeat(1_000_000), null],
    ['#ABCDEF', '#abcdef'],
    ['#00ff7f', '#00ff7f'],
  ])('%s -> %s', (input, out) => {
    expect(normalizeHex(input)).toBe(out);
  });
});

describe('autoDoorColor', () => {
  it('wood on light walls, white on dark', () => {
    expect(autoDoorColor('#efe9df')).toBe('#9a7049');
    expect(autoDoorColor('#2b2a2a')).toBe('#f2eee6');
  });
});

describe('toRoomShape wallIds', () => {
  it('uses s0..s3 in simple mode and plan ids in custom mode, and compares them', () => {
    const simple = toRoomShape(simpleDesign());
    expect(simple.wallIds).toEqual(['s0', 's1', 's2', 's3']);
    const custom = toRoomShape(customDesign(lPlan()));
    expect(custom.wallIds).toEqual(['w7', 'w8', 'w9', 'w10', 'w11', 'w12']);
    const renamed: RoomShape = { ...simple, wallIds: ['a', 's1', 's2', 's3'] };
    expect(roomShapesEqual(simple, renamed)).toBe(false);
    expect(roomShapesEqual(simple, toRoomShape(simpleDesign()))).toBe(true);
  });
});

describe('resolvePaint', () => {
  it('falls back to base colours, skirting matches walls, door is auto per its wall', () => {
    const d = customDesign(lPlan());
    d.plan!.walls[1].color = '#2b2a2a'; // w8 carries the door
    const paint = resolvePaint(d, toRoomShape(d));
    expect(paint.walls['w7']).toBe(d.wallColor);
    expect(paint.walls['w8']).toBe('#2b2a2a');
    expect(paint.skirting['w8']).toBe('#2b2a2a');
    expect(paint.doors['o99']).toBe('#f2eee6');
    expect(paint.ceiling).toBe(d.ceilingColor);
  });

  it('explicit skirting, door group and door colours win', () => {
    const d = customDesign(lPlan());
    d.skirtingColor = '#111111';
    d.doorColor = '#222222';
    expect(resolvePaint(d, toRoomShape(d)).skirting['w9']).toBe('#111111');
    expect(resolvePaint(d, toRoomShape(d)).doors['o99']).toBe('#222222');
    d.plan!.openings[0].color = '#333333';
    expect(resolvePaint(d, toRoomShape(d)).doors['o99']).toBe('#333333');
  });

  it('simple mode reads simpleWallColors by index and has no doors', () => {
    const d = { ...simpleDesign(), simpleWallColors: [null, '#445566', null, null] };
    const paint = resolvePaint(d, toRoomShape(d));
    expect(paint.walls['s1']).toBe('#445566');
    expect(paint.walls['s0']).toBe(d.wallColor);
    expect(paint.doors).toEqual({});
  });

  it('paintsEqual compares structurally', () => {
    const d = customDesign(lPlan());
    const a = resolvePaint(d, toRoomShape(d));
    expect(paintsEqual(a, resolvePaint(d, toRoomShape(d)))).toBe(true);
    d.plan!.walls[0].color = '#010203';
    expect(paintsEqual(a, resolvePaint(d, toRoomShape(d)))).toBe(false);
    expect(paintsEqual(a, { ...a, base: '#010203' })).toBe(false);
  });
});

describe('applySurfaceColor', () => {
  it('ceiling and skirting', () => {
    const d = simpleDesign();
    expect(apply(d, { kind: 'ceiling' }, '#ABCDEF').ceilingColor).toBe('#abcdef');
    expect(apply(d, { kind: 'ceiling' }, null)).toBe(d);
    const s = apply(d, { kind: 'skirting' }, '#101010');
    expect(s.skirtingColor).toBe('#101010');
    expect(apply(s, { kind: 'skirting' }, null).skirtingColor).toBeNull();
  });

  it('rejects invalid hex', () => {
    const d = simpleDesign();
    expect(apply(d, { kind: 'walls' }, '#fff')).toBe(d);
    expect(apply(d, { kind: 'skirting' }, 'red')).toBe(d);
  });

  it('simple mode: one wall, then all walls clears the overrides', () => {
    let d = apply(simpleDesign(), { kind: 'wall', id: 's2' }, '#aa0000');
    expect(d.simpleWallColors).toEqual([null, null, '#aa0000', null]);
    expect(hasAccentWalls(d, toRoomShape(d))).toBe(true);
    expect(apply(d, { kind: 'wall', id: 'w7' }, '#aa0000')).toBe(d);
    d = apply(d, { kind: 'walls' }, '#00aa00');
    expect(d.wallColor).toBe('#00aa00');
    expect(d.simpleWallColors).toEqual([null, null, null, null]);
    expect(hasAccentWalls(d, toRoomShape(d))).toBe(false);
  });

  it('picking the base colour for one wall stores no override', () => {
    let d = apply(simpleDesign(), { kind: 'wall', id: 's2' }, '#aa0000');
    d = apply(d, { kind: 'wall', id: 's2' }, d.wallColor.toUpperCase());
    expect(d.simpleWallColors).toEqual([null, null, null, null]);
    expect(hasAccentWalls(d, toRoomShape(d))).toBe(false);
    let c = customDesign(lPlan());
    c = apply(c, { kind: 'wall', id: 'w9' }, '#aa0000');
    c = apply(c, { kind: 'wall', id: 'w9' }, c.wallColor);
    expect(c.plan!.walls.some((w) => w.color)).toBe(false);
  });

  it('custom mode: wall, door, then groups clear only the active mode', () => {
    let d = customDesign(lPlan());
    d.simpleWallColors = ['#123456', null, null, null];
    d = apply(d, { kind: 'wall', id: 'w9' }, '#aa0000');
    d = apply(d, { kind: 'door', id: 'o99' }, '#0000aa');
    expect(d.plan!.walls.find((w) => w.id === 'w9')!.color).toBe('#aa0000');
    expect(d.plan!.openings[0].color).toBe('#0000aa');
    expect(apply(d, { kind: 'door', id: 'nope' }, '#0000aa')).toBe(d);
    expect(apply(d, { kind: 'wall', id: 'w9' }, null).plan!.walls.some((w) => w.color)).toBe(false);

    const doors = apply(d, { kind: 'doors' }, '#0b0b0b');
    expect(doors.doorColor).toBe('#0b0b0b');
    expect(doors.plan!.openings[0].color).toBeUndefined();
    expect(apply(doors, { kind: 'doors' }, null).doorColor).toBeNull();

    const walls = apply(d, { kind: 'walls' }, '#0c0c0c');
    expect(walls.plan!.walls.some((w) => w.color)).toBe(false);
    expect(walls.simpleWallColors[0]).toBe('#123456');
    expect(d.plan!.walls.find((w) => w.id === 'w9')!.color).toBe('#aa0000'); // input untouched
  });

  it('never colours a window as a door', () => {
    const d = customDesign(rectangleToPlan({ length: 5, width: 4, height: 2.7 }));
    expect(apply(d, { kind: 'door', id: 'o9' }, '#aa0000')).toBe(d);
  });

  it('stripPlanColors removes all and keeps the plan when there are none', () => {
    const plan = lPlan();
    expect(stripPlanColors(plan)).toBe(plan);
    plan.walls[0].color = '#aa0000';
    plan.openings[0].color = '#bb0000';
    const stripped = stripPlanColors(plan);
    expect(stripped.walls.some((w) => w.color) || stripped.openings.some((o) => o.color)).toBe(
      false,
    );
  });
});

describe('surfaceExists and sameSurface', () => {
  it('checks members', () => {
    const simple = toRoomShape(simpleDesign());
    const custom = toRoomShape(customDesign(lPlan()));
    expect(surfaceExists({ kind: 'doors' }, simple)).toBe(false);
    expect(surfaceExists({ kind: 'doors' }, custom)).toBe(true);
    expect(surfaceExists({ kind: 'door', id: 'o99' }, custom)).toBe(true);
    expect(surfaceExists({ kind: 'wall', id: 'w7' }, simple)).toBe(false);
    expect(surfaceExists({ kind: 'wall', id: 's3' }, simple)).toBe(true);
    expect(surfaceExists({ kind: 'ceiling' }, simple)).toBe(true);
    expect(sameSurface({ kind: 'wall', id: 'a' }, { kind: 'wall', id: 'a' })).toBe(true);
    expect(sameSurface({ kind: 'wall', id: 'a' }, { kind: 'wall', id: 'b' })).toBe(false);
    expect(sameSurface({ kind: 'walls' }, { kind: 'wall', id: 'a' })).toBe(false);
    expect(sameSurface(null, null)).toBe(true);
  });
});

describe('colours follow plan edits', () => {
  const room = { length: 5, width: 4, height: 2.7 };

  it('split copies the colour to the new part', () => {
    const plan = rectangleToPlan(room, ['#aa0000', null, null, null]);
    expect(plan.walls[0].color).toBe('#aa0000');
    const r = insertVertex(plan, 'w5', 1);
    if (!r.ok) throw new Error('split failed');
    expect(r.plan.walls.filter((w) => w.color === '#aa0000')).toHaveLength(2);
  });

  it('merge keeps the first wall colour', () => {
    const split = insertVertex(rectangleToPlan(room, ['#aa0000', null, null, null]), 'w5', 1);
    if (!split.ok) throw new Error('split failed');
    const plan = split.plan;
    const first = plan.walls.find((w) => w.id === 'w5')!;
    const second = plan.walls.find((w) => w.from === first.to)!;
    second.color = '#00aa00';
    const vertexId = second.from;
    const r = deleteVertex(plan, vertexId);
    if (!r.ok) throw new Error('merge failed');
    expect(r.plan.walls.find((w) => w.id === 'w5')!.color).toBe('#aa0000');
    expect(r.plan.walls).toHaveLength(4);
  });

  it('compactIds keeps colours', () => {
    const plan = lPlan();
    plan.walls[2].color = '#aa0000';
    plan.openings[0].color = '#0000aa';
    const compact = compactIds(plan);
    expect(compact.walls[2].color).toBe('#aa0000');
    expect(compact.openings[0].color).toBe('#0000aa');
  });

  it('rectangleToPlan without colours has none', () => {
    expect(rectangleToPlan(room).walls.some((w) => w.color)).toBe(false);
  });
});

describe('sanitizePlan colours', () => {
  const dirty = (): unknown => {
    const plan = JSON.parse(JSON.stringify(lPlan()));
    plan.walls[0].color = '#AA0000';
    plan.walls[1].color = '#fff';
    plan.walls[2].color = 12;
    plan.walls[3].color = 'x'.repeat(1_000_000);
    plan.openings[0].color = '#0000AA';
    return plan;
  };

  it('keeps valid colours lowercase and drops invalid ones', () => {
    const plan = sanitizePlan(dirty())!;
    expect(plan.walls[0].color).toBe('#aa0000');
    expect(plan.walls.slice(1).every((w) => w.color === undefined)).toBe(true);
    expect(plan.openings[0].color).toBe('#0000aa');
  });

  it('drops a colour on a window', () => {
    const plan = JSON.parse(JSON.stringify(rectangleToPlan({ length: 5, width: 4, height: 2.7 })));
    plan.openings[0].color = '#aa0000';
    expect(sanitizePlan(plan)!.openings[0].color).toBeUndefined();
  });

  it('keeps wall colours when the winding is reversed', () => {
    const plan = JSON.parse(JSON.stringify(planFromPoints([...L_SHAPE].reverse())));
    plan.walls.forEach((w: { color?: string }, i: number) => (w.color = `#00000${i}`));
    const out = sanitizePlan(plan)!;
    expect(out.walls.every((w) => w.color)).toBe(true);
  });
});
