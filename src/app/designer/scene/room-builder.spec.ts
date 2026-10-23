import { describe, expect, it } from 'vitest';
import { doorColor } from './materials';
import { buildCeilingGeometry, buildPrismGeometry, buildWallGeometry } from './room-builder';
import { SKIRTING_HEIGHT, WallLayout } from './wall-layout';

const wall = (openings: WallLayout['openings']): WallLayout => ({
  index: 0,
  origin: { x: 0, y: 0 },
  dir: { x: 1, y: 0 },
  normal: { x: 0, y: -1 },
  length: 5,
  openings,
  skirting: [[0, 5]],
});
const opening = (
  kind: 'door' | 'window',
  start: number,
  end: number,
  bottom: number,
  top: number,
) => ({
  id: 'o',
  kind,
  wall: 0,
  start,
  end,
  bottom,
  top,
});

describe('buildWallGeometry', () => {
  it('fills the elevation and extrudes behind the inner face', () => {
    const g = buildWallGeometry(wall([]), 2.7);
    g.computeBoundingBox();
    expect(g.boundingBox!.min.x).toBeCloseTo(0);
    expect(g.boundingBox!.max.x).toBeCloseTo(5);
    expect(g.boundingBox!.max.y).toBeCloseTo(2.7);
    expect(g.boundingBox!.min.z).toBeCloseTo(-0.15);
    expect(g.boundingBox!.max.z).toBeCloseTo(0);
  });

  it('cuts windows as holes and doors as notches, adding faces', () => {
    const plain = buildWallGeometry(wall([]), 2.7).getAttribute('position').count;
    const win = buildWallGeometry(wall([opening('window', 1, 2, 0.9, 2.1)]), 2.7);
    const door = buildWallGeometry(wall([opening('door', 3, 3.9, 0, 2.1)]), 2.7);
    expect(win.getAttribute('position').count).toBeGreaterThan(plain);
    expect(door.getAttribute('position').count).toBeGreaterThan(plain);
  });
});

describe('floor and ceiling geometry', () => {
  const square = [
    { x: -1, y: -1 },
    { x: 1, y: -1 },
    { x: 1, y: 1 },
    { x: -1, y: 1 },
  ];

  it('faces the ceiling downward at the given height', () => {
    const g = buildCeilingGeometry(square, 2.7);
    const pos = g.getAttribute('position');
    const index = g.getIndex()!;
    for (let k = 0; k < index.count; k += 3) {
      const [i, j, l] = [index.getX(k), index.getX(k + 1), index.getX(k + 2)];
      const e1 = [pos.getX(j) - pos.getX(i), pos.getZ(j) - pos.getZ(i)];
      const e2 = [pos.getX(l) - pos.getX(i), pos.getZ(l) - pos.getZ(i)];
      expect(pos.getY(i)).toBeCloseTo(2.7);
      expect(e1[1] * e2[0] - e1[0] * e2[1]).toBeLessThan(0);
    }
  });

  it('builds a prism between y0 and y0 + height', () => {
    const g = buildPrismGeometry(square, 0, SKIRTING_HEIGHT);
    g.computeBoundingBox();
    expect(g.boundingBox!.min.y).toBeCloseTo(0);
    expect(g.boundingBox!.max.y).toBeCloseTo(SKIRTING_HEIGHT);
    expect(g.boundingBox!.max.z).toBeCloseTo(1);
  });
});

describe('doorColor', () => {
  it('uses wood on light walls and white paint on dark walls', () => {
    expect(doorColor('#efe9df')).toBe('#9a7049');
    expect(doorColor('#2b2a2a')).toBe('#f2eee6');
  });
});
