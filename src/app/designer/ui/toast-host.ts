import { Component, computed, effect, ElementRef, inject } from '@angular/core';
import { Toasts } from './toasts';

/** Renders the current toast. Both live regions stay in the DOM so announcements are reliable. */
@Component({
  selector: 'app-toast-host',
  template: `
    <div class="region" role="status">
      @if (status(); as toast) {
        <div class="toast">
          <span>{{ toast.text }}</span>
          @if (toast.action) {
            <button type="button" class="action" (click)="toasts.runAction()">
              {{ toast.action.label }}
            </button>
          }
        </div>
      }
    </div>
    <div class="region" role="alert">
      @if (error(); as toast) {
        <div class="toast error">
          <svg class="icon" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.5" />
            <path
              d="M8 4.5v4.2M8 10.6v1"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
            />
          </svg>
          <span>{{ toast.text }}</span>
          @if (toast.action) {
            <button type="button" class="action" (click)="toasts.runAction()">
              {{ toast.action.label }}
            </button>
          }
        </div>
      }
    </div>
  `,
  styleUrl: './toast-host.scss',
  host: {
    '(pointerenter)': 'setHovered(true)',
    '(pointerleave)': 'setHovered(false)',
    '(focusin)': 'setFocused(true)',
    '(focusout)': 'onFocusOut($event)',
  },
})
export class ToastHost {
  protected readonly toasts = inject(Toasts);
  private hovered = false;
  private focused = false;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    // A new or removed toast starts with a clean slate (focusout may not fire for removed nodes).
    effect(() => {
      this.toasts.current();
      this.hovered = false;
      this.focused = false;
    });
  }

  protected readonly status = computed(() => {
    const toast = this.toasts.current();
    return toast?.kind === 'status' ? toast : null;
  });
  protected readonly error = computed(() => {
    const toast = this.toasts.current();
    return toast?.kind === 'error' ? toast : null;
  });

  protected setHovered(value: boolean): void {
    this.hovered = value;
    this.sync();
  }

  protected setFocused(value: boolean): void {
    this.focused = value;
    this.sync();
  }

  protected onFocusOut(event: FocusEvent): void {
    this.setFocused(
      event.relatedTarget instanceof Node && this.host.nativeElement.contains(event.relatedTarget),
    );
  }

  /** The countdown runs only while the pointer is away and focus is outside the toast. */
  private sync(): void {
    if (this.hovered || this.focused) {
      this.toasts.pause();
    } else {
      this.toasts.resume();
    }
  }
}
