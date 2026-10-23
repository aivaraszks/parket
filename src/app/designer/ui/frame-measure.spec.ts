import { isMinorReframe, MIN_REFRAME_PX } from './frame-measure';

describe('isMinorReframe', () => {
  const base = { top: 40, right: 0, bottom: 300, left: 0 };

  it('ignores a small height change in the same section', () => {
    expect(isMinorReframe(base, { ...base, bottom: 300 + MIN_REFRAME_PX - 1 }, false)).toBe(true);
  });

  it('re-frames for a bigger change, a section change, or any other edge', () => {
    expect(isMinorReframe(base, { ...base, bottom: 300 + MIN_REFRAME_PX }, false)).toBe(false);
    expect(isMinorReframe(base, { ...base, bottom: 310 }, true)).toBe(false);
    expect(isMinorReframe(base, { ...base, top: 44 }, false)).toBe(false);
    expect(isMinorReframe(base, { ...base, right: 72 }, false)).toBe(false);
  });
});
