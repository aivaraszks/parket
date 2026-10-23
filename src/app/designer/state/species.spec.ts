import { describe, expect, it } from 'vitest';
import { DEFAULT_SPECIES } from './design-defaults';
import { COLOR_PRESETS, getSpecies, isSpeciesId, SPECIES, SPECIES_IDS } from './species';

describe('species', () => {
  it('lists the six designed species with four hex bases each', () => {
    expect(SPECIES_IDS).toEqual([
      'golden-oak',
      'natural-oak',
      'smoked-oak',
      'walnut',
      'ash',
      'whitewashed-oak',
    ]);
    for (const species of SPECIES) {
      expect(species.bases.length).toBe(4);
      for (const hex of [...species.bases, species.grain]) {
        expect(hex).toMatch(/^#[0-9a-f]{6}$/);
      }
      expect(species.grainStrength).toBeGreaterThan(0);
      expect(species.grainStrength).toBeLessThanOrEqual(1);
    }
  });

  it('knows the default species', () => {
    expect(isSpeciesId(DEFAULT_SPECIES)).toBe(true);
  });

  it('validates ids and falls back to the first species', () => {
    expect(isSpeciesId('walnut')).toBe(true);
    expect(isSpeciesId('plywood')).toBe(false);
    expect(isSpeciesId(3)).toBe(false);
    expect(getSpecies('ash').name).toBe('Ash');
    expect(getSpecies('nope').id).toBe('golden-oak');
  });

  it('has eight wall and ceiling presets with unique ids', () => {
    expect(COLOR_PRESETS.length).toBe(8);
    expect(new Set(COLOR_PRESETS.map((p) => p.id)).size).toBe(8);
    expect(COLOR_PRESETS.find((p) => p.id === 'warm-white')?.hex).toBe('#efe9df');
  });
});
