import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { ColourConfirm } from './colour-confirm';

describe('ColourConfirm', () => {
  it('confirm runs the action once and closes', () => {
    const c = TestBed.inject(ColourConfirm);
    const onConfirm = vi.fn();
    c.ask({ body: 'b', onConfirm });
    expect(c.pending()?.body).toBe('b');
    c.confirm();
    c.confirm();
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(c.pending()).toBeNull();
  });

  it('cancel closes without running the action', () => {
    const c = TestBed.inject(ColourConfirm);
    const onConfirm = vi.fn();
    c.ask({ body: 'b', onConfirm });
    c.cancel();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(c.pending()).toBeNull();
  });
});
