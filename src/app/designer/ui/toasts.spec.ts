import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastHost } from './toast-host';
import { Toasts } from './toasts';

describe('Toasts timing', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('dismisses after its duration', () => {
    const toasts = TestBed.inject(Toasts);
    toasts.show('Hello', { durationMs: 1000 });
    vi.advanceTimersByTime(999);
    expect(toasts.current()).not.toBeNull();
    vi.advanceTimersByTime(2);
    expect(toasts.current()).toBeNull();
  });

  it('does not dismiss while paused and leaves time to react after resuming', () => {
    const toasts = TestBed.inject(Toasts);
    toasts.show('Design reset.', { durationMs: 8000 });
    vi.advanceTimersByTime(7500);
    toasts.pause();
    vi.advanceTimersByTime(60000);
    expect(toasts.current()).not.toBeNull();
    toasts.resume();
    vi.advanceTimersByTime(1900);
    expect(toasts.current()).not.toBeNull();
    vi.advanceTimersByTime(200);
    expect(toasts.current()).toBeNull();
  });

  it('pauses while the toast host is hovered or holds focus', async () => {
    const toasts = TestBed.inject(Toasts);
    const fixture = TestBed.createComponent(ToastHost);
    document.body.appendChild(fixture.nativeElement);
    toasts.show('Design reset.', { durationMs: 1000, action: { label: 'Undo', run: () => {} } });
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    host.dispatchEvent(new Event('pointerenter'));
    vi.advanceTimersByTime(5000);
    expect(toasts.current()).not.toBeNull();
    host.dispatchEvent(new Event('pointerleave'));
    vi.advanceTimersByTime(2100);
    expect(toasts.current()).toBeNull();
    fixture.nativeElement.remove();
  });
});
