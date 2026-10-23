import { describe, expect, it } from 'vitest';
import { planFromPoints } from '../plan/plan-fixtures';
import { validatePlan } from '../plan/plan-validate';
import { bbox, signedArea, Vec2 } from '../plan/polygon';
import { toRoomShape } from '../plan/room-shape';
import { herringbone } from './herringbone';

/** An L filling the 20 x 20 m limit: arms 3.97 m wide, area 143.8 m2 (just under the 144 cap). */
const A = 3.97;
const WORST_L: Vec2[] = [
  { x: 0, y: 0 },
  { x: 20, y: 0 },
  { x: 20, y: A },
  { x: A, y: A },
  { x: A, y: 20 },
  { x: 0, y: 20 },
];

describe('worst-case floor (C15 limits)', () => {
  const plan = planFromPoints(WORST_L);
  const shape = toRoomShape({ mode: 'custom', room: { length: 5, width: 4, height: 2.7 }, plan });
  const planks = herringbone.generate(
    { plankLength: 300, plankWidth: 40, planksPerBlock: 1, angle: 45 },
    { outline: shape.outline },
  );

  it('is a legal plan at the size and area limits', () => {
    expect(validatePlan(plan)).toEqual([]);
    expect(bbox(WORST_L).width).toBe(20);
    expect(signedArea(WORST_L)).toBeGreaterThan(143);
    expect(signedArea(WORST_L)).toBeLessThanOrEqual(144);
  });

  it('needs about 12k planks, never more than the 15k budget, and covers the floor', () => {
    const net = signedArea(WORST_L) / (0.3 * 0.04);
    expect(planks.length).toBeGreaterThanOrEqual(Math.floor(net));
    expect(planks.length).toBeLessThanOrEqual(15000);
    expect(planks.every((p) => Number.isFinite(p.x + p.z + p.rotation))).toBe(true);
  });

  it('stays within the budget at other angles', () => {
    for (const angle of [0, 15, 30, 60, 89]) {
      const count = herringbone.generate(
        { plankLength: 300, plankWidth: 40, planksPerBlock: 1, angle },
        { outline: shape.outline },
      ).length;
      expect(count, `angle ${angle}`).toBeLessThanOrEqual(15000);
    }
  });
});
