/** A tap moves at most this far (CSS px) and lasts at most this long (ms). */
export const TAP_MAX_MOVE = 8;
export const TAP_MAX_MS = 500;

/** The parts of a PointerEvent the detector needs. */
export interface TapPointerEvent {
  pointerId: number;
  clientX: number;
  clientY: number;
  button: number;
  pointerType: string;
  timeStamp: number;
  /** Absent counts as not primary. */
  isPrimary?: boolean;
}

export interface TapPoint {
  clientX: number;
  clientY: number;
}

/**
 * Pure tap-vs-gesture decision. Feed it pointerdown / pointermove / pointerup / pointercancel;
 * `up` returns the tap position, or null when the gesture was a drag, a pinch, a long press or
 * not the primary button. A second pointer spoils the whole gesture, even after it lifts.
 */
export class TapDetector {
  private readonly active = new Set<number>();
  private valid = false;
  private startX = 0;
  private startY = 0;
  private startTime = 0;
  private startId = -1;

  down(e: TapPointerEvent): void {
    // A new primary pointer starts a fresh gesture: drop any pointer whose up never arrived.
    if (e.isPrimary) {
      this.active.clear();
    }
    this.active.add(e.pointerId);
    if (this.active.size > 1) {
      this.valid = false;
      return;
    }
    this.valid = !(e.pointerType === 'mouse' && e.button !== 0);
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.startTime = e.timeStamp;
    this.startId = e.pointerId;
  }

  move(e: TapPointerEvent): void {
    if (!this.valid || e.pointerId !== this.startId) {
      return;
    }
    if (Math.hypot(e.clientX - this.startX, e.clientY - this.startY) > TAP_MAX_MOVE) {
      this.valid = false;
    }
  }

  up(e: TapPointerEvent): TapPoint | null {
    if (!this.active.delete(e.pointerId)) {
      return null;
    }
    const tap =
      this.valid &&
      this.active.size === 0 &&
      e.pointerId === this.startId &&
      e.timeStamp - this.startTime <= TAP_MAX_MS &&
      Math.hypot(e.clientX - this.startX, e.clientY - this.startY) <= TAP_MAX_MOVE;
    if (this.active.size === 0) {
      this.valid = false;
    }
    return tap ? { clientX: e.clientX, clientY: e.clientY } : null;
  }

  cancel(e: TapPointerEvent): void {
    this.active.delete(e.pointerId);
    this.valid = false;
  }
}
