import { describe, expect, it } from 'vitest';
import { Vec2 } from '../plan/polygon';
import { herringbone } from './herringbone';

const A = 3.97;
const toPoints = (pts: number[][]): Vec2[] => pts.map(([x, y]) => ({ x, y }));
const WORST_L = toPoints([
  [0, 0],
  [20, 0],
  [20, A],
  [A, A],
  [A, 20],
  [0, 20],
]);
const U_SHAPE = toPoints([
  [0, 0],
  [12, 0],
  [12, 12],
  [8, 12],
  [8, 4],
  [4, 4],
  [4, 12],
  [0, 12],
]);
const SQUARE = toPoints([
  [0, 0],
  [12, 0],
  [12, 12],
  [0, 12],
]);

function medianMs(outline: Vec2[]): number {
  const params = { plankLength: 300, plankWidth: 40, planksPerBlock: 1, angle: 45 };
  herringbone.generate(params, { outline }); // warm up
  const times: number[] = [];
  for (let i = 0; i < 7; i++) {
    const start = performance.now();
    herringbone.generate(params, { outline });
    times.push(performance.now() - start);
  }
  return times.sort((a, b) => a - b)[3];
}

// Generous ceilings (measured: ~8 ms L, ~5 ms U, ~3 ms square) so slow CI does not flake, yet the
// pre-optimisation ~100 ms for the L would still fail.
describe('herringbone generation speed (C15)', () => {
  it('worst-case L stays well under 40 ms', () => {
    expect(medianMs(WORST_L)).toBeLessThan(40);
  });

  it('concave U and plain 12 x 12 rooms stay fast', () => {
    expect(medianMs(U_SHAPE)).toBeLessThan(25);
    expect(medianMs(SQUARE)).toBeLessThan(25);
  });
});
