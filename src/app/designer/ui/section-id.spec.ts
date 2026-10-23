import { describe, expect, it } from 'vitest';
import { SECTIONS } from './section-id';

describe('SECTIONS', () => {
  it('lists the dock sections in order', () => {
    expect(SECTIONS.map((s) => s.id)).toEqual(['room', 'floor', 'colour', 'light', 'estimate']);
    expect(SECTIONS.map((s) => s.label)).toEqual(['Room', 'Floor', 'Colour', 'Light', 'Estimate']);
  });
});
