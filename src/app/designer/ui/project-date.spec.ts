import { describe, expect, it } from 'vitest';
import { formatEdited } from './project-date';

describe('formatEdited', () => {
  const now = new Date(2026, 9, 23, 15, 0).getTime();

  it('says today and yesterday by calendar day', () => {
    expect(formatEdited(new Date(2026, 9, 23, 0, 5).getTime(), now)).toBe('today');
    expect(formatEdited(new Date(2026, 9, 22, 23, 55).getTime(), now)).toBe('yesterday');
  });

  it('uses day and month this year, adds the year otherwise', () => {
    expect(formatEdited(new Date(2026, 9, 3).getTime(), now)).toBe('3 Oct');
    expect(formatEdited(new Date(2025, 11, 28).getTime(), now)).toBe('28 Dec 2025');
  });

  it('treats a future time as today', () => {
    expect(formatEdited(now + 86_400_000 * 3, now)).toBe('today');
  });
});
