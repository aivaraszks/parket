import { describe, expect, it } from 'vitest';
import { atlasSize, ATLAS_COLUMNS, ATLAS_ROWS, VARIANT_COUNT, variantUv } from './wood-texture';

describe('wood texture atlas', () => {
  it('has twelve variants and a smaller low-memory atlas', () => {
    expect(VARIANT_COUNT).toBe(12);
    expect(atlasSize(false)).toEqual({ width: 2048, height: 1024 });
    expect(atlasSize(true).width).toBeLessThan(2048);
  });

  it('gives every variant its own UV cell inside 0-1', () => {
    const size = atlasSize(false);
    const seen = new Set<string>();
    for (let v = 0; v < VARIANT_COUNT; v++) {
      const uv = variantUv(v, size, 6);
      expect(uv.u0).toBeGreaterThanOrEqual(0);
      expect(uv.u1).toBeLessThanOrEqual(1);
      expect(uv.v0).toBeGreaterThanOrEqual(0);
      expect(uv.v1).toBeLessThanOrEqual(1);
      expect(uv.u1).toBeGreaterThan(uv.u0);
      expect(uv.v1).toBeGreaterThan(uv.v0);
      seen.add(`${uv.u0.toFixed(3)}|${uv.v0.toFixed(3)}`);
    }
    expect(seen.size).toBe(ATLAS_COLUMNS * ATLAS_ROWS);
  });

  it('uses only part of the cell for short planks', () => {
    const size = atlasSize(false);
    const full = variantUv(0, size, 6);
    const short = variantUv(0, size, 3);
    expect(short.u1 - short.u0).toBeCloseTo((full.u1 - full.u0) / 2);
  });
});
