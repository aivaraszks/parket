import { Component, DestroyRef, inject, signal } from '@angular/core';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
} from '@angular/router';
import { PLAN_EDITOR_URL } from './plan-editor-launcher';

/** Wait this long before showing the loading text, so a cached chunk does not flash it. */
const SHOW_AFTER_MS = 200;

/** "Preparing the editor..." while the editor chunk loads. The region stays in the DOM. */
@Component({
  selector: 'app-editor-loader',
  template: `
    <div class="region" role="status">
      @if (loading()) {
        <p class="box">Preparing the editor...</p>
      }
    </div>
  `,
  styles: `
    .region {
      position: fixed;
      inset: 0;
      z-index: var(--z-plan);
      display: grid;
      place-items: center;
      pointer-events: none;
    }

    .box {
      margin: 0;
      padding: var(--space-3) var(--space-5);
      background: var(--surface-raised);
      border: 1px solid var(--surface-hairline);
      border-radius: var(--radius-pill);
      box-shadow: var(--shadow-toast);
      color: var(--text-primary);
      font: var(--weight-medium) var(--text-sm) / 1.4 var(--font-ui);
    }
  `,
})
export class EditorLoader {
  protected readonly loading = signal(false);
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    const stop = (): void => {
      clearTimeout(this.timer);
      this.loading.set(false);
    };
    const subscription = inject(Router).events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        stop();
        if (event.url.startsWith(PLAN_EDITOR_URL)) {
          this.timer = setTimeout(() => this.loading.set(true), SHOW_AFTER_MS);
        }
      } else if (
        event instanceof NavigationEnd ||
        event instanceof NavigationCancel ||
        event instanceof NavigationError
      ) {
        stop();
      }
    });
    inject(DestroyRef).onDestroy(() => {
      subscription.unsubscribe();
      clearTimeout(this.timer);
    });
  }
}
