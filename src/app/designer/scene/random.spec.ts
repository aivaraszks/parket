import { describe, expect, it } from 'vitest';
import { createRandom, hashSeed } from './random';

describe('random', () => {
  it('is deterministic per seed', () => {
    const a = createRandom(42);
    const b = createRandom(42);
    for (let i = 0; i < 20; i++) {
      expect(a()).toBe(b());
    }
  });

  it('differs between seeds and stays in [0, 1)', () => {
    const a = createRandom(1);
    const b = createRandom(2);
    expect(a()).not.toBe(b());
    const r = createRandom(7);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('hashes stably and distinguishes inputs', () => {
    expect(hashSeed(1, 2, 3)).toBe(hashSeed(1, 2, 3));
    expect(hashSeed(1, 2, 3)).not.toBe(hashSeed(3, 2, 1));
    expect(hashSeed(1, 2, 0)).not.toBe(hashSeed(1, 2, 1));
  });
});
