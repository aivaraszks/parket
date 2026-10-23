import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ColouringState, HIGHLIGHT_FADE_MS } from './colouring-state';

describe('ColouringState (Colour section)', () => {
  let state: ColouringState;
  beforeEach(() => {
    vi.useFakeTimers();
    state = TestBed.inject(ColouringState);
  });
  afterEach(() => vi.useRealTimers());

  it('selects All walls when Colour opens with nothing selected, and clears on close', () => {
    state.setColourOpen(true);
    expect(state.colourOpen()).toBe(true);
    expect(state.picking()).toBe(true);
    expect(state.selected()).toEqual({ kind: 'walls' });
    state.setColourOpen(false);
    expect(state.selected()).toBeNull();
    expect(state.picking()).toBe(false);
  });

  it('keeps an existing selection when Colour opens', () => {
    state.select({ kind: 'ceiling' }, 'list');
    state.setColourOpen(true);
    expect(state.selected()).toEqual({ kind: 'ceiling' });
  });

  it('fades the highlight 1.5 s after a colour pick, and a new selection restores it', () => {
    state.setColourOpen(true);
    expect(state.highlight()).toEqual({ kind: 'walls' });
    state.markColourPicked();
    vi.advanceTimersByTime(HIGHLIGHT_FADE_MS - 1);
    expect(state.highlight()).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(state.highlight()).toBeNull();
    expect(state.selected()).toEqual({ kind: 'walls' });
    state.select({ kind: 'skirting' }, 'tap');
    expect(state.highlight()).toEqual({ kind: 'skirting' });
  });
});
