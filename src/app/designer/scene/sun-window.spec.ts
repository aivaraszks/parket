import { describe, expect, it } from 'vitest';
import { toRoomShape } from '../plan/room-shape';
import { DEFAULT_DESIGN } from '../state/design-defaults';
import { sunHitsWindow } from './sun-window';

describe('sunHitsWindow', () => {
  const shape = toRoomShape(DEFAULT_DESIGN);

  it('is true when the sun is on the window side (azimuth 180 is -z)', () => {
    expect(sunHitsWindow(shape, 180)).toBe(true);
    expect(sunHitsWindow(shape, 135)).toBe(true);
  });

  it('is false when the sun is behind the walls', () => {
    expect(sunHitsWindow(shape, 0)).toBe(false);
    expect(sunHitsWindow(shape, 90)).toBe(false);
  });

  it('is false without windows', () => {
    expect(sunHitsWindow({ ...shape, openings: [] }, 180)).toBe(false);
  });
});
