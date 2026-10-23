import { describe, expect, it } from 'vitest';
import { L_SHAPE, opening, planFromPoints, RECT } from './plan-fixtures';
import { Plan, PlanErrorCode } from './plan-model';
import { validatePlan } from './plan-validate';
import { Vec2 } from './polygon';

const p = (x: number, y: number): Vec2 => ({ x, y });

function codes(plan: Plan): PlanErrorCode[] {
  return validatePlan(plan).map((e) => e.code);
}

describe('validatePlan', () => {
  it('accepts a rectangle and an L', () => {
    expect(validatePlan(planFromPoints(RECT))).toEqual([]);
    expect(validatePlan(planFromPoints(L_SHAPE))).toEqual([]);
  });

  it('stamps the edit context on every error', () => {
    const plan = planFromPoints([p(0, 0), p(0.1, 0), p(0.1, 0.1)]);
    const errors = validatePlan(plan, { subject: 'opening', subjectId: 'o3' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.every((e) => e.subject === 'opening' && e.subjectId === 'o3')).toBe(true);
  });

  it('reports a bow-tie', () => {
    expect(codes(planFromPoints([p(0, 0), p(4, 4), p(4, 0), p(0, 4)]))).toContain(
      'self-intersection',
    );
  });

  it('reports short walls with the wall id', () => {
    const errors = validatePlan(planFromPoints([p(0, 0), p(5, 0), p(5, 0.2), p(0, 4)]));
    expect(errors.find((e) => e.code === 'wall-too-short')?.wallId).toBe('w6');
  });

  it('enforces the 30 and 330 degree interior angle limits', () => {
    const t = (deg: number): Vec2[] => [
      p(0, 0),
      p(6, 0),
      p(6 * Math.cos((deg * Math.PI) / 180), 6 * Math.sin((deg * Math.PI) / 180)),
    ];
    // y is down: this triangle is negatively wound, so mirror it for a positive winding.
    const wound = t;
    expect(codes(planFromPoints(wound(31)))).not.toContain('angle-too-sharp');
    expect(codes(planFromPoints(wound(29)))).toContain('angle-too-sharp');
  });

  it('allows a 180 degree corner and flags walls folded back', () => {
    expect(validatePlan(planFromPoints([p(0, 0), p(2, 0), p(5, 0), p(5, 4), p(0, 4)]))).toEqual([]);
    expect(codes(planFromPoints([p(0, 0), p(5, 0), p(3, 0), p(3, 4)]))).toContain(
      'self-intersection',
    );
  });

  it('flags walls closer than 0.3 m but not exactly 0.3 m', () => {
    expect(codes(planFromPoints([p(0, 0), p(5, 0), p(5, 0.25), p(0, 0.25)]))).toContain(
      'walls-too-close',
    );
    const u = (gap: number): Vec2[] => [
      p(0, 0),
      p(6, 0),
      p(6, 4),
      p(3 + gap, 4),
      p(3 + gap, 1),
      p(3, 1),
      p(3, 4),
      p(0, 4),
    ];
    expect(codes(planFromPoints(u(0.2)))).toContain('walls-too-close');
    expect(codes(planFromPoints(u(0.3)))).not.toContain('walls-too-close');
  });

  it('limits corners', () => {
    const many = Array.from({ length: 33 }, (_, i) => {
      const a = (i / 33) * Math.PI * 2;
      return p(Math.cos(a) * 3, Math.sin(a) * 3);
    }).reverse();
    expect(codes(planFromPoints(many))).toContain('too-many-corners');
  });

  it('limits size and area', () => {
    expect(codes(planFromPoints([p(0, 0), p(21, 0), p(21, 3), p(0, 3)]))).toContain('too-large');
    expect(codes(planFromPoints([p(0, 0), p(12.1, 0), p(12.1, 12), p(0, 12)]))).toContain(
      'area-out-of-range',
    );
    expect(validatePlan(planFromPoints([p(0, 0), p(12, 0), p(12, 12), p(0, 12)]))).toEqual([]);
    expect(codes(planFromPoints([p(0, 0), p(1.9, 0), p(1.9, 1), p(0, 1)]))).toContain(
      'area-out-of-range',
    );
  });

  it('limits the room height', () => {
    expect(codes(planFromPoints(RECT, 2.1))).toEqual(['height-out-of-range']);
    expect(codes(planFromPoints(RECT, 4.1))).toEqual(['height-out-of-range']);
    expect(validatePlan(planFromPoints(RECT, 2.2))).toEqual([]);
    expect(validatePlan(planFromPoints(RECT, 4))).toEqual([]);
  });

  describe('openings', () => {
    const withOpenings = (...list: Parameters<typeof opening>[0][]): Plan => ({
      ...planFromPoints(RECT),
      openings: list.map(opening),
    });

    it('accepts well-placed openings', () => {
      expect(
        validatePlan(
          withOpenings(
            { id: 'o20', wallId: 'w5', offset: 0.05, width: 1 },
            { id: 'o21', wallId: 'w5', offset: 1.1, width: 1, kind: 'door', height: 2.1, sill: 0 },
          ),
        ),
      ).toEqual([]);
    });

    it('checks margins to the corners', () => {
      expect(codes(withOpenings({ id: 'o20', wallId: 'w5', offset: 0.04 }))).toEqual([
        'opening-does-not-fit',
      ]);
      expect(codes(withOpenings({ id: 'o20', wallId: 'w5', offset: 4.0 }))).toEqual([
        'opening-does-not-fit',
      ]);
      expect(codes(withOpenings({ id: 'o20', wallId: 'w5', offset: 3.95 }))).toEqual([]);
    });

    it('checks overlaps and the 0.05 m gap, for any mix of kinds', () => {
      const door = { kind: 'door', height: 2.1, sill: 0, width: 0.9 } as const;
      expect(
        codes(
          withOpenings(
            { id: 'o20', wallId: 'w5', offset: 1 },
            { id: 'o21', wallId: 'w5', offset: 2.04, ...door },
          ),
        ),
      ).toEqual(['openings-overlap']);
      expect(
        codes(
          withOpenings(
            { id: 'o20', wallId: 'w5', offset: 1 },
            { id: 'o21', wallId: 'w5', offset: 2.05, ...door },
          ),
        ),
      ).toEqual([]);
      expect(
        codes(
          withOpenings(
            { id: 'o20', wallId: 'w5', offset: 1 },
            { id: 'o21', wallId: 'w6', offset: 1 },
          ),
        ),
      ).toEqual([]);
    });

    it('checks door and window size limits', () => {
      const bad = (o: Partial<Parameters<typeof opening>[0]>): PlanErrorCode[] =>
        codes(withOpenings({ id: 'o20', wallId: 'w5', ...o }));
      expect(bad({ kind: 'door', width: 0.5, height: 2.1, sill: 0 })).toEqual([
        'opening-size-out-of-range',
      ]);
      expect(bad({ kind: 'door', width: 2.5, height: 2.1, sill: 0, offset: 0.5 })).toEqual([
        'opening-size-out-of-range',
      ]);
      expect(bad({ kind: 'door', width: 0.9, height: 1.7, sill: 0 })).toEqual([
        'opening-size-out-of-range',
      ]);
      expect(bad({ kind: 'door', width: 0.9, height: 2.66, sill: 0 })).toEqual([
        'opening-size-out-of-range',
      ]);
      expect(bad({ kind: 'door', width: 0.9, height: 2.65, sill: 0 })).toEqual([]);
      expect(bad({ width: 0.29 })).toEqual(['opening-size-out-of-range']);
      expect(bad({ width: 4.1, offset: 0.1 })).toContain('opening-size-out-of-range');
      expect(bad({ height: 0.29, sill: 0.5 })).toEqual(['opening-size-out-of-range']);
      expect(bad({ height: 2.7 })).toEqual(['opening-size-out-of-range']);
      expect(bad({ height: 1.4, sill: 1.26 })).toEqual(['opening-size-out-of-range']);
      expect(bad({ height: 1.4, sill: 1.25 })).toEqual([]);
      expect(bad({ sill: -0.1 })).toEqual(['opening-size-out-of-range']);
    });

    it('limits the number of openings and rejects dangling references', () => {
      const big = planFromPoints([p(0, 0), p(12, 0), p(12, 12), p(0, 12)]);
      big.openings = Array.from({ length: 33 }, (_, i) =>
        opening({
          id: `o${100 + i}`,
          wallId: big.walls[i % 4].id,
          offset: 0.5 + Math.floor(i / 4) * 1.3,
        }),
      );
      expect(codes(big)).toEqual(['too-many-openings']);
      expect(codes(withOpenings({ id: 'o20', wallId: 'w99' }))).toEqual(['invalid-structure']);
    });
  });

  it('flags a broken structure', () => {
    const plan = planFromPoints(RECT);
    plan.walls[1].from = 'v9';
    expect(codes(plan)).toEqual(['invalid-structure']);
    const nan = planFromPoints(RECT);
    nan.vertices[0].x = NaN;
    expect(codes(nan)).toEqual(['invalid-structure']);
    const reversed = planFromPoints([...RECT].reverse());
    expect(codes(reversed)).toEqual(['invalid-structure']);
  });
});
