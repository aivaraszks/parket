import { effect, Service, signal } from '@angular/core';

export interface ToastAction {
  readonly label: string;
  readonly run: () => void;
}

export interface ToastOptions {
  /** Errors are announced assertively. */
  readonly kind?: 'status' | 'error';
  readonly action?: ToastAction;
  readonly durationMs?: number;
  /** Called when the toast goes away for any reason (timeout, action, replaced, dismissed). */
  readonly onDismiss?: () => void;
  /** The toast is dismissed as soon as this (signal-reading) function returns false. */
  readonly keepWhile?: () => boolean;
}

export interface Toast {
  readonly id: number;
  readonly text: string;
  readonly kind: 'status' | 'error';
  readonly action?: ToastAction;
}

const DEFAULT_DURATION_MS = 4000;
/** Minimum time left after a hover or focus ends, so the action can still be used. */
const MIN_RESUME_MS = 2000;

/** One toast at a time; a new one replaces the current one. */
@Service()
export class Toasts {
  private readonly _current = signal<Toast | null>(null);
  private nextId = 1;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private remainingMs = 0;
  private startedAt = 0;
  private paused = false;
  private onDismiss: (() => void) | undefined;
  private keepWhile: (() => boolean) | undefined;

  readonly current = this._current.asReadonly();

  constructor() {
    // Lives here (root), not in the component that showed the toast, which may be gone.
    effect(() => {
      const current = this._current();
      if (current && this.keepWhile && !this.keepWhile()) {
        this.dismiss(current.id);
      }
    });
  }

  show(text: string, options: ToastOptions = {}): number {
    this.dismiss();
    const id = this.nextId++;
    this.onDismiss = options.onDismiss;
    this.keepWhile = options.keepWhile;
    this._current.set({ id, text, kind: options.kind ?? 'status', action: options.action });
    this.paused = false;
    this.startTimer(id, options.durationMs ?? DEFAULT_DURATION_MS);
    return id;
  }

  /** Stop the countdown while the toast is hovered or focused (WCAG 2.2.1). */
  pause(): void {
    const current = this._current();
    if (!current || this.paused) {
      return;
    }
    this.paused = true;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.remainingMs = Math.max(0, this.remainingMs - (Date.now() - this.startedAt));
  }

  /** Continue the countdown, leaving at least a couple of seconds. */
  resume(): void {
    const current = this._current();
    if (!current || !this.paused) {
      return;
    }
    this.paused = false;
    this.startTimer(current.id, Math.max(this.remainingMs, MIN_RESUME_MS));
  }

  private startTimer(id: number, ms: number): void {
    this.remainingMs = ms;
    this.startedAt = Date.now();
    this.timer = setTimeout(() => this.dismiss(id), ms);
  }

  /** Dismiss the current toast, or only the one with this id. */
  dismiss(id?: number): void {
    const current = this._current();
    if (!current || (id !== undefined && current.id !== id)) {
      return;
    }
    clearTimeout(this.timer);
    this.timer = undefined;
    const onDismiss = this.onDismiss;
    this.onDismiss = undefined;
    this.keepWhile = undefined;
    this._current.set(null);
    onDismiss?.();
  }

  /** Run the toast action, then dismiss. */
  runAction(): void {
    const current = this._current();
    current?.action?.run();
    this.dismiss(current?.id);
  }
}
