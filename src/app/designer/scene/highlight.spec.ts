import { describe, expect, it } from 'vitest';
import {
  HIGHLIGHT_COLOR,
  HIGHLIGHT_DARK_SHARE,
  HIGHLIGHT_INTENSITY,
  HIGHLIGHT_INTENSITY_SINGLE,
  highlightIntensity,
} from './highlight';

describe('highlightIntensity', () => {
  it('uses the lower intensity for groups and the higher one for single surfaces', () => {
    expect(highlightIntensity({ kind: 'walls' })).toBe(HIGHLIGHT_INTENSITY);
    expect(highlightIntensity({ kind: 'doors' })).toBe(HIGHLIGHT_INTENSITY);
    for (const ref of [
      { kind: 'wall', id: 'a' },
      { kind: 'door', id: 'd' },
      { kind: 'ceiling' },
      { kind: 'skirting' },
    ] as const) {
      expect(highlightIntensity(ref)).toBe(HIGHLIGHT_INTENSITY_SINGLE);
    }
    expect(HIGHLIGHT_INTENSITY).toBeLessThan(HIGHLIGHT_INTENSITY_SINGLE);
  });

  it('scales the tint down on dark colours and keeps it on light ones', () => {
    const ref = { kind: 'wall', id: 'a' } as const;
    const white = highlightIntensity(ref, '#ffffff');
    const charcoal = highlightIntensity(ref, '#3d3a38');
    const black = highlightIntensity(ref, '#000000');
    expect(white).toBe(HIGHLIGHT_INTENSITY_SINGLE);
    expect(black).toBeCloseTo(HIGHLIGHT_INTENSITY_SINGLE * HIGHLIGHT_DARK_SHARE, 5);
    expect(black).toBeGreaterThan(0.08);
    expect(black).toBeLessThan(0.13);
    expect(charcoal).toBeGreaterThan(black);
    expect(charcoal).toBeLessThan(white);
    expect(highlightIntensity({ kind: 'walls' }, '#000000')).toBeGreaterThan(0.07);
    expect(highlightIntensity({ kind: 'walls' }, '#000000')).toBeLessThan(0.1);
  });

  it('has a valid hex tint', () => {
    expect(HIGHLIGHT_COLOR).toMatch(/^#[0-9a-f]{6}$/);
  });
});
