import { describe, expect, it } from 'vitest';
import { buildMaskGeometry, buildPlankGeometry } from './floor-builder';

const uv = { u0: 0, u1: 1, v0: 0, v1: 1 };

describe('buildPlankGeometry', () => {
  it('builds sides, chamfers and top (18 triangles, no bottom)', () => {
    const geometry = buildPlankGeometry(0.6, 0.1, uv, true);
    expect(geometry.getAttribute('position').count).toBe(18 * 3);
  });

  it('drops the chamfers when flat (10 triangles)', () => {
    const geometry = buildPlankGeometry(0.6, 0.1, uv, false);
    expect(geometry.getAttribute('position').count).toBe(10 * 3);
  });

  it('is centred, leaves a seam gap and keeps UVs inside the cell', () => {
    const geometry = buildPlankGeometry(0.6, 0.1, uv, true);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    expect(box.max.x).toBeLessThan(0.3);
    expect(box.min.x).toBeCloseTo(-box.max.x);
    expect(box.min.y).toBe(0);
    const uvs = geometry.getAttribute('uv');
    for (let i = 0; i < uvs.count; i++) {
      expect(uvs.getX(i)).toBeGreaterThanOrEqual(0);
      expect(uvs.getX(i)).toBeLessThanOrEqual(1);
    }
  });

  it('winds every triangle in the direction of its normal', () => {
    const geometry = buildPlankGeometry(0.6, 0.1, uv, true);
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    for (let i = 0; i < position.count; i += 3) {
      const a = [position.getX(i), position.getY(i), position.getZ(i)];
      const b = [position.getX(i + 1), position.getY(i + 1), position.getZ(i + 1)];
      const c = [position.getX(i + 2), position.getY(i + 2), position.getZ(i + 2)];
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const face = [
        e1[1] * e2[2] - e1[2] * e2[1],
        e1[2] * e2[0] - e1[0] * e2[2],
        e1[0] * e2[1] - e1[1] * e2[0],
      ];
      const dot = face[0] * normal.getX(i) + face[1] * normal.getY(i) + face[2] * normal.getZ(i);
      expect(dot).toBeGreaterThan(0);
    }
  });
});

describe('buildMaskGeometry', () => {
  it('lays the outline flat on the floor plane, x/z matching the outline', () => {
    const g = buildMaskGeometry([
      { x: -2, y: -1 },
      { x: 2, y: -1 },
      { x: 2, y: 3 },
      { x: -2, y: 3 },
    ]);
    g.computeBoundingBox();
    const box = g.boundingBox!;
    expect(box.min.y).toBeCloseTo(0);
    expect(box.max.y).toBeCloseTo(0);
    expect(box.min.z).toBeCloseTo(-1);
    expect(box.max.z).toBeCloseTo(3);
    expect(box.min.x).toBeCloseTo(-2);
  });
});
