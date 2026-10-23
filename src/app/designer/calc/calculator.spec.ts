import { describe, expect, it } from 'vitest';
import {
  areaWithWaste,
  estimate,
  floorArea,
  plankArea,
  planksNeeded,
  skirtingLength,
} from './calculator';

describe('calculator', () => {
  it('computes floor and plank area', () => {
    expect(floorArea(5, 4)).toBe(20);
    expect(plankArea(600, 100)).toBeCloseTo(0.06, 10);
  });

  it('adds waste', () => {
    expect(areaWithWaste(20, 12)).toBeCloseTo(22.4, 10);
    expect(areaWithWaste(20, 0)).toBe(20);
  });

  it('matches the UX example for the default room', () => {
    const e = estimate(20, { length: 600, width: 100 }, 12);
    expect(e.planksNet).toBe(334);
    expect(e.planksWithWaste).toBe(374);
    expect(e.areaWithWaste).toBeCloseTo(22.4, 10);
  });

  it('rounds up', () => {
    expect(planksNeeded(1.01, 0.5)).toBe(3);
  });

  it('ignores float noise at exact multiples', () => {
    expect(planksNeeded(50.000000001, 1)).toBe(50);
    expect(planksNeeded(0.3, 0.1)).toBe(3);
  });

  it('handles degenerate input', () => {
    expect(planksNeeded(10, 0)).toBe(0);
    expect(planksNeeded(0, 0.06)).toBe(0);
  });

  it('estimates extremes: smallest room with biggest plank, largest room with smallest plank', () => {
    const small = estimate(4, { length: 2400, width: 200 }, 0);
    expect(small.floorArea).toBe(4);
    expect(small.planksNet).toBe(9);
    expect(small.planksWithWaste).toBe(9);
    const big = estimate(144, { length: 300, width: 50 }, 30);
    expect(big.planksNet).toBe(9600);
    expect(big.planksWithWaste).toBe(12480);
  });

  it('with waste is never below net and grows with waste', () => {
    const room = 4.37 * 3.11;
    const plank = { length: 555, width: 85 };
    let previous = 0;
    for (const waste of [0, 5, 12, 20, 30]) {
      const e = estimate(room, plank, waste);
      expect(e.planksWithWaste).toBeGreaterThanOrEqual(e.planksNet);
      expect(e.planksWithWaste).toBeGreaterThanOrEqual(previous);
      previous = e.planksWithWaste;
    }
  });

  it('counts every strip as a plank, so planks per block does not change the estimate', () => {
    // 4 strips of 600 x 50 mm: the formula only sees the single plank size.
    const e = estimate(20, { length: 600, width: 50 }, 10);
    expect(e.planksNet).toBe(667);
    expect(e.planksWithWaste).toBe(734);
  });

  it('rounds one plank over a whole multiple up', () => {
    // 2 x 3 m with 600 x 100 mm planks is exactly 100 planks.
    expect(estimate(6, { length: 600, width: 100 }, 0).planksNet).toBe(100);
    expect(estimate(2.01 * 3, { length: 600, width: 100 }, 0).planksNet).toBe(101);
  });

  it('never returns negative counts', () => {
    expect(planksNeeded(-5, 0.06)).toBe(0);
  });

  it('takes any area, such as an L-shape, and reports skirting', () => {
    // L: 6 x 4 minus a 2 x 2 corner = 20 m2, perimeter 20 m, one 0.9 m door.
    const e = estimate(20, { length: 600, width: 100 }, 12, skirtingLength(20, [0.9]));
    expect(e.planksNet).toBe(334);
    expect(e.skirtingLength).toBeCloseTo(19.1, 10);
  });

  it('skirting is the perimeter minus doors and never negative', () => {
    expect(skirtingLength(18, [])).toBe(18);
    expect(skirtingLength(18, [0.9, 0.8])).toBeCloseTo(16.3, 10);
    expect(skirtingLength(1, [2])).toBe(0);
    expect(estimate(20, { length: 600, width: 100 }, 0).skirtingLength).toBe(0);
  });
});
