import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ViewFrame } from './view-frame';

describe('ViewFrame', () => {
  it('starts with no insets and publishes CSS variables', () => {
    const frame = TestBed.inject(ViewFrame);
    expect(frame.insets()).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    frame.set({ top: 50, right: 0, bottom: 300, left: 0 });
    expect(frame.bottom()).toBe(300);
    expect(frame.cssVars()['--frame-bottom']).toBe('300px');
    expect(frame.cssVars()['--frame-top']).toBe('50px');
  });

  it('ignores sub-pixel changes', () => {
    const frame = TestBed.inject(ViewFrame);
    frame.set({ top: 50, right: 0, bottom: 300, left: 0 });
    const before = frame.insets();
    frame.set({ top: 50.2, right: 0, bottom: 299.8, left: 0 });
    expect(frame.insets()).toBe(before);
  });
});
