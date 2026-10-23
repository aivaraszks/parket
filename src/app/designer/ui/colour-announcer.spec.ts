import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { ColourAnnouncer } from './colour-announcer';

describe('ColourAnnouncer', () => {
  it('clears a repeated message first so it is read again', () => {
    vi.useFakeTimers();
    const a = TestBed.inject(ColourAnnouncer);
    a.say('Wall 1 selected.');
    expect(a.message()).toBe('Wall 1 selected.');
    a.say('Wall 1 selected.');
    expect(a.message()).toBe('');
    vi.advanceTimersByTime(100);
    expect(a.message()).toBe('Wall 1 selected.');
    vi.useRealTimers();
  });
});
