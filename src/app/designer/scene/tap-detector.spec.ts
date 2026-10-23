import { describe, expect, it } from 'vitest';
import { TAP_MAX_MOVE, TAP_MAX_MS, TapDetector, TapPointerEvent } from './tap-detector';

function ev(over: Partial<TapPointerEvent> = {}): TapPointerEvent {
  return {
    pointerId: 1,
    clientX: 100,
    clientY: 100,
    button: 0,
    pointerType: 'touch',
    timeStamp: 1000,
    ...over,
  };
}

describe('TapDetector', () => {
  it('reports a short, still press as a tap at the release point', () => {
    const d = new TapDetector();
    d.down(ev());
    expect(d.up(ev({ clientX: 103, timeStamp: 1100 }))).toEqual({ clientX: 103, clientY: 100 });
  });

  it('accepts movement up to the threshold and rejects more', () => {
    const edge = new TapDetector();
    edge.down(ev());
    edge.move(ev({ clientX: 100 + TAP_MAX_MOVE }));
    expect(edge.up(ev({ clientX: 100 + TAP_MAX_MOVE }))).not.toBeNull();

    const far = new TapDetector();
    far.down(ev());
    far.move(ev({ clientX: 100 + TAP_MAX_MOVE + 1 }));
    // Coming back to the start does not make it a tap again.
    expect(far.up(ev())).toBeNull();
  });

  it('rejects a release that is too far from the press even without move events', () => {
    const d = new TapDetector();
    d.down(ev());
    expect(d.up(ev({ clientY: 120 }))).toBeNull();
  });

  it('accepts the time limit and rejects a long press', () => {
    const edge = new TapDetector();
    edge.down(ev());
    expect(edge.up(ev({ timeStamp: 1000 + TAP_MAX_MS }))).not.toBeNull();

    const slow = new TapDetector();
    slow.down(ev());
    expect(slow.up(ev({ timeStamp: 1000 + TAP_MAX_MS + 1 }))).toBeNull();
  });

  it('never taps when a second pointer joins, even after it lifts', () => {
    const d = new TapDetector();
    d.down(ev());
    d.down(ev({ pointerId: 2, clientX: 150 }));
    expect(d.up(ev({ pointerId: 2, clientX: 150 }))).toBeNull();
    expect(d.up(ev())).toBeNull();
  });

  it('rejects a non-primary mouse button but not a touch', () => {
    const right = new TapDetector();
    right.down(ev({ pointerType: 'mouse', button: 2 }));
    expect(right.up(ev({ pointerType: 'mouse', button: 2 }))).toBeNull();

    const left = new TapDetector();
    left.down(ev({ pointerType: 'mouse', button: 0 }));
    expect(left.up(ev({ pointerType: 'mouse', button: 0 }))).not.toBeNull();
  });

  it('ignores a pointerup it never saw go down', () => {
    expect(new TapDetector().up(ev())).toBeNull();
  });

  it('drops the gesture on pointercancel and recovers for the next one', () => {
    const d = new TapDetector();
    d.down(ev());
    d.cancel(ev());
    expect(d.up(ev())).toBeNull();
    d.down(ev({ timeStamp: 2000 }));
    expect(d.up(ev({ timeStamp: 2050 }))).not.toBeNull();
  });

  it('recovers after a pinch for the next single tap', () => {
    const d = new TapDetector();
    d.down(ev());
    d.down(ev({ pointerId: 2 }));
    d.up(ev({ pointerId: 2 }));
    d.up(ev());
    d.down(ev({ timeStamp: 3000 }));
    expect(d.up(ev({ timeStamp: 3040 }))).not.toBeNull();
  });

  it('a new primary pointerdown clears a stuck pointer', () => {
    const d = new TapDetector();
    d.down(ev({ pointerId: 7, isPrimary: true })); // its up never arrives
    d.down(ev({ pointerId: 1, isPrimary: true, timeStamp: 5000 }));
    expect(d.up(ev({ pointerId: 1, timeStamp: 5050 }))).not.toBeNull();
  });

  it('a non-primary pointer still spoils the gesture', () => {
    const d = new TapDetector();
    d.down(ev({ isPrimary: true }));
    d.down(ev({ pointerId: 2, isPrimary: false }));
    d.up(ev({ pointerId: 2 }));
    expect(d.up(ev())).toBeNull();
  });
});
