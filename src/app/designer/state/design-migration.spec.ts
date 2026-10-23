import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { estimate, skirtingLength } from '../calc/calculator';
import { rectangleToPlan } from '../plan/plan-edit';
import { L_SHAPE, planFromPoints } from '../plan/plan-fixtures';
import { validatePlan } from '../plan/plan-validate';
import { DEFAULT_DESIGN, STORAGE_KEY, STORAGE_KEY_V1 } from './design-defaults';
import { DesignState } from './design-state';

function create(): DesignState {
  TestBed.resetTestingModule();
  return TestBed.inject(DesignState);
}

/** What the v1 release really wrote (no mode, no plan, no planksPerBlock, azimuth 90-270). */
const V1_BLOB = {
  room: { length: 6.4, width: 3.8, height: 2.5 },
  wallColor: '#EDE6DA',
  ceilingColor: '#ffffff',
  species: 'oak',
  plank: { length: 600, width: 90 },
  pattern: 'herringbone',
  angle: 45,
  finish: 'matte',
  sun: { on: true, azimuth: 235, elevation: 38, intensity: 1.2 },
  wastePercent: 10,
};

describe('v1 to v2 migration with real-looking blobs', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('carries every v1 field over, in simple mode, with the same estimate as before', () => {
    localStorage.setItem(STORAGE_KEY_V1, JSON.stringify(V1_BLOB));
    const s = create();
    expect(s.mode()).toBe('simple');
    expect(s.plan()).toBeNull();
    expect(s.simpleRoom()).toEqual({ length: 6.4, width: 3.8, height: 2.5 });
    expect(s.wallColor()).toBe('#ede6da');
    expect(s.plank()).toEqual({ length: 600, width: 90 });
    expect(s.planksPerBlock()).toBe(1);
    expect(s.angle()).toBe(45);
    expect(s.sun().azimuth).toBe(235);
    expect(s.wastePercent()).toBe(10);
    // The v1 maths: length x width.
    expect(s.floorArea()).toBeCloseTo(6.4 * 3.8, 9);
    expect(s.planksNet()).toBe(estimate(6.4 * 3.8, { length: 600, width: 90 }, 10).planksNet);
    // The scene shape is the old rectangle, centred.
    const shape = s.roomShape();
    expect(shape.outline).toEqual([
      { x: -3.2, y: -1.9 },
      { x: 3.2, y: -1.9 },
      { x: 3.2, y: 1.9 },
      { x: -3.2, y: 1.9 },
    ]);
    expect(shape.height).toBe(2.5);
  });

  it('migrates, then the first switch to custom produces a valid plan of the same area', () => {
    localStorage.setItem(STORAGE_KEY_V1, JSON.stringify(V1_BLOB));
    const s = create();
    const before = s.floorArea();
    s.setMode('custom');
    expect(validatePlan(s.plan()!)).toEqual([]);
    expect(s.floorArea()).toBeCloseTo(before, 9);
    expect(s.roomHeight()).toBe(2.5);
  });

  it('migrates a v1 blob with out-of-range numbers by clamping them', () => {
    localStorage.setItem(
      STORAGE_KEY_V1,
      JSON.stringify({ ...V1_BLOB, room: { length: 99, width: -3, height: 'tall' }, angle: 'x' }),
    );
    const s = create();
    expect(s.simpleRoom().length).toBe(12);
    expect(s.simpleRoom().width).toBe(2);
    expect(s.simpleRoom().height).toBe(DEFAULT_DESIGN.room.height);
    expect(s.angle()).toBe(DEFAULT_DESIGN.angle);
  });

  it('writes only v2 after the first change and leaves the v1 text byte for byte', () => {
    const text = JSON.stringify(V1_BLOB);
    localStorage.setItem(STORAGE_KEY_V1, text);
    const s = create();
    s.setAngle(10);
    s.setMode('custom');
    s.flush();
    expect(localStorage.getItem(STORAGE_KEY_V1)).toBe(text);
    const v2 = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(v2.mode).toBe('custom');
    expect(v2.room.length).toBe(6.4);
    expect(v2.plan.rooms).toHaveLength(1);
  });

  it('survives a second load: v2 is now the source and mode and plan round-trip', () => {
    localStorage.setItem(STORAGE_KEY_V1, JSON.stringify(V1_BLOB));
    const first = create();
    first.setMode('custom');
    first.setPlan(planFromPoints(L_SHAPE));
    first.flush();
    const second = create();
    expect(second.mode()).toBe('custom');
    expect(second.floorArea()).toBeCloseTo(24, 9);
    expect(second.roomShape().outline).toHaveLength(6);
  });

  it('a corrupt v2 blob falls back to v1, and a corrupt v1 to the defaults', () => {
    localStorage.setItem(STORAGE_KEY_V1, JSON.stringify(V1_BLOB));
    localStorage.setItem(STORAGE_KEY, '{"mode": "custom", "plan": {');
    expect(create().simpleRoom().length).toBe(6.4);
    localStorage.setItem(STORAGE_KEY_V1, '%%%');
    expect(create().simpleRoom()).toEqual(DEFAULT_DESIGN.room);
  });
});

describe('hostile stored plans', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  const store = (blob: unknown): DesignState => {
    localStorage.setItem(STORAGE_KEY, typeof blob === 'string' ? blob : JSON.stringify(blob));
    return create();
  };
  const goodPlan = () => structuredClone(rectangleToPlan({ length: 5, width: 4, height: 2.7 }));

  it('loads a good custom plan, so the next tests prove falling back is not a default', () => {
    const s = store({ mode: 'custom', plan: goodPlan() });
    expect(s.mode()).toBe('custom');
  });

  it('falls back to simple for each hostile mutation and still shows a valid room', () => {
    const mutations: Array<[string, (p: Record<string, any>) => void]> = [
      ['NaN-ish coordinate as string', (p) => (p['vertices'][0].x = 'NaN')],
      ['null coordinate', (p) => (p['vertices'][1].y = null)],
      ['dangling wall reference', (p) => (p['walls'][0].to = 'v999')],
      ['duplicate vertex id', (p) => (p['vertices'][1].id = p['vertices'][0].id)],
      ['bad id characters', (p) => (p['vertices'][0].id = '__proto__')],
      ['id too long', (p) => (p['vertices'][0].id = 'v1234567')],
      ['room references a missing wall', (p) => (p['rooms'][0].wallIds[0] = 'w999')],
      ['room skips a wall', (p) => p['rooms'][0].wallIds.pop()],
      ['no rooms', (p) => (p['rooms'] = [])],
      ['two rooms', (p) => p['rooms'].push(structuredClone(p['rooms'][0]))],
      ['bow-tie', (p) => ([p['vertices'][2].x, p['vertices'][2].y] = [-3, 4])],
      ['absurd size', (p) => (p['vertices'][1].x = 1e9)],
      ['zero area', (p) => (p['vertices'][2].y = 0)],
      ['vertices not an array', (p) => (p['vertices'] = { length: 4 })],
      ['walls huge', (p) => (p['walls'] = Array.from({ length: 3000 }, () => p['walls'][0]))],
      ['height NaN', (p) => (p['rooms'][0].height = 'tall')],
      ['no vertices', (p) => (p['vertices'] = [])],
    ];
    for (const [name, mutate] of mutations) {
      const plan = goodPlan() as unknown as Record<string, any>;
      mutate(plan);
      const s = store({ mode: 'custom', plan });
      expect(s.mode(), name).toBe('simple');
      expect(s.plan(), name).toBeNull();
      expect(s.roomShape().outline, name).toHaveLength(4);
      expect(s.floorArea(), name).toBeGreaterThan(0);
    }
  });

  it('survives plain garbage as the stored text or as the plan', () => {
    for (const text of ['null', '[]', '42', '"plan"', '{"mode":"custom","plan":"x"}', '{']) {
      const s = store(text);
      expect(s.mode()).toBe('simple');
      expect(s.roomShape().outline).toHaveLength(4);
    }
  });

  it('drops only the bad openings and keeps the room', () => {
    const plan = goodPlan();
    plan.openings.push(
      {
        id: 'o50',
        wallId: 'w999',
        kind: 'door',
        offset: 1,
        width: 1,
        height: 2,
        sill: 0,
        anchor: 'floor',
      },
      {
        id: 'o51',
        wallId: plan.walls[1].id,
        kind: 'window',
        offset: 1,
        width: 1,
        height: 1,
        sill: 1,
        anchor: 'floor',
      },
    );
    const s = store({ mode: 'custom', plan });
    expect(s.mode()).toBe('custom');
    const ids = s.plan()!.openings.map((o) => o.id);
    expect(ids).not.toContain('o50');
    expect(ids).toContain('o51');
  });

  it('does not pollute prototypes through a stored plan', () => {
    const s = store(
      '{"mode":"custom","__proto__":{"polluted":1},"plan":{"__proto__":{"polluted":1},"constructor":{"prototype":{"polluted":1}}}}',
    );
    expect(s.mode()).toBe('simple');
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it('a mode flag alone, without any plan, never produces a custom mode', () => {
    expect(store({ mode: 'custom' }).mode()).toBe('simple');
    expect(store({ mode: 'weird', plan: goodPlan() }).mode()).toBe('simple');
    expect(store({ mode: 'weird', plan: goodPlan() }).plan()).not.toBeNull();
  });
});

describe('calculator with polygon area and skirting (through the state)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('uses the L-shape area, not the bounding box', () => {
    const s = create();
    s.setMode('custom');
    s.setPlan(planFromPoints(L_SHAPE)); // bbox 6 x 5 = 30, area 24
    expect(s.floorArea()).toBeCloseTo(24, 9);
    const net = estimate(24, s.plank(), s.wastePercent());
    expect(s.planksNet()).toBe(net.planksNet);
    expect(s.planksWithWaste()).toBe(net.planksWithWaste);
    expect(s.skirtingLength()).toBeCloseTo(22, 9); // perimeter 6+3+3+2+3+5
  });

  it('subtracts door widths only, never window widths', () => {
    const s = create();
    s.setMode('custom');
    const plan = planFromPoints(L_SHAPE);
    plan.openings = [
      {
        id: 'o30',
        wallId: 'w7',
        kind: 'door',
        offset: 0.5,
        width: 0.9,
        height: 2.1,
        sill: 0,
        anchor: 'floor',
      },
      {
        id: 'o31',
        wallId: 'w7',
        kind: 'window',
        offset: 2,
        width: 1.5,
        height: 1.2,
        sill: 0.9,
        anchor: 'floor',
      },
      {
        id: 'o32',
        wallId: 'w8',
        kind: 'door',
        offset: 0.5,
        width: 0.8,
        height: 2.1,
        sill: 0,
        anchor: 'floor',
      },
    ];
    s.setPlan(plan);
    expect(s.skirtingLength()).toBeCloseTo(22 - 0.9 - 0.8, 9);
    expect(s.estimate().skirtingLength).toBeCloseTo(20.3, 9);
  });

  it('follows the active mode: simple again gives the rectangle area and skirting', () => {
    const s = create();
    s.setMode('custom');
    s.setPlan(planFromPoints(L_SHAPE));
    s.setMode('simple');
    expect(s.floorArea()).toBeCloseTo(5 * 4, 9);
    expect(s.skirtingLength()).toBeCloseTo(18, 9);
    s.setMode('custom');
    expect(s.floorArea()).toBeCloseTo(24, 9);
  });

  it('a smallest legal room and the 144 m2 cap give sane counts', () => {
    expect(estimate(2, { length: 600, width: 100 }, 0, skirtingLength(6, [])).planksNet).toBe(34);
    const big = estimate(144, { length: 300, width: 40 }, 0);
    expect(big.planksNet).toBe(Math.ceil(144 / (0.3 * 0.04) - 1e-9));
    expect(big.planksNet).toBe(12000);
  });
});
