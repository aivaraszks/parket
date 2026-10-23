import {
  boundsOf,
  clampScale,
  ensureVisible,
  fitView,
  gridPath,
  gridVisibility,
  panBy,
  toPlan,
  toScreen,
  View,
  zoomAt,
} from './view-transform';

const size = { w: 800, h: 600 };
const view: View = { cx: 2.5, cy: 2, scale: 100 };

describe('view-transform', () => {
  it('maps plan to screen and back', () => {
    const s = toScreen(view, size, { x: 0, y: 0 });
    expect(s).toEqual({ x: 150, y: 100 });
    expect(toPlan(view, size, s)).toEqual({ x: 0, y: 0 });
  });

  it('zooms about a point, which stays under the pointer', () => {
    const p = { x: 200, y: 150 };
    const before = toPlan(view, size, p);
    const zoomed = zoomAt(view, size, p, 2);
    expect(zoomed.scale).toBe(200);
    const after = toPlan(zoomed, size, p);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('clamps zoom to the visible width range', () => {
    expect(clampScale(1e6, size)).toBe(800 / 0.5);
    expect(clampScale(0.001, size)).toBe(800 / 40);
  });

  it('pans so content follows the pointer', () => {
    const moved = panBy(view, 100, -50);
    expect(toScreen(moved, size, { x: 2.5, y: 2 })).toEqual({ x: 500, y: 250 });
  });

  it('fits bounds with padding and centres them', () => {
    const fitted = fitView({ minX: 0, minY: 0, maxX: 5, maxY: 4 }, size, 40);
    expect(fitted).toEqual({ cx: 2.5, cy: 2, scale: 130 });
    const corner = toScreen(fitted, size, { x: 0, y: 0 });
    expect(corner.x).toBeGreaterThanOrEqual(40);
    expect(corner.y).toBeGreaterThanOrEqual(40);
  });

  it('pans only as far as needed to reveal a point', () => {
    expect(ensureVisible(view, size, { x: 2.5, y: 2 })).toBe(view);
    const moved = ensureVisible(view, size, { x: 20, y: 2 });
    expect(toScreen(moved, size, { x: 20, y: 2 }).x).toBeCloseTo(760);
  });

  it('computes bounds', () => {
    expect(
      boundsOf([
        { x: 1, y: 5 },
        { x: -2, y: 3 },
      ]),
    ).toEqual({
      minX: -2,
      minY: 3,
      maxX: 1,
      maxY: 5,
    });
  });

  it('switches grid lines on and off by pitch', () => {
    expect(gridVisibility(100)).toEqual({ minor: true, major: true });
    expect(gridVisibility(20)).toEqual({ minor: false, major: true });
    expect(gridVisibility(10)).toEqual({ minor: false, major: false });
  });

  it('draws grid lines anchored at the origin, skipping every tenth for the minor grid', () => {
    const lines = (d: string) => (d.match(/M/g) ?? []).length;
    const major = gridPath(view, size, 1);
    const minor = gridPath(view, size, 0.1, 10);
    expect(major).toContain('M');
    expect(lines(minor)).toBeGreaterThan(lines(major));
    // x = 0 is at screen 150: a major line there, none in the minor path
    expect(major).toContain('M150.5 0V600');
    expect(minor).not.toContain('M150.5 0V600');
  });
});
