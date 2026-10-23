import { Component, inject, InjectionToken } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Reloads the page; tests provide a fake. */
export const RELOAD_PAGE = new InjectionToken<() => void>('RELOAD_PAGE', {
  providedIn: 'root',
  factory: () => () => globalThis.location.reload(),
});

/**
 * Shown instead of the designer when its lazy chunk cannot be loaded (for example offline).
 * Part of the main bundle on purpose: it must be available when the chunk is not.
 */
@Component({
  selector: 'app-designer-load-error',
  imports: [RouterLink],
  template: `
    <main class="box">
      <h1>Couldn't load the designer</h1>
      <p>Check your connection and try again.</p>
      <div class="actions">
        <button type="button" class="btn" (click)="reload()">Try again</button>
        <a routerLink="/">Back to Parket home</a>
      </div>
    </main>
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      display: grid;
      place-items: center;
      padding: var(--space-4);
      background: var(--color-floor-dark);
      color: var(--text-primary);
      font-family: var(--font-ui);
    }

    .box {
      max-width: 24rem;
      padding: var(--space-6);
      background: var(--surface-raised);
      border-radius: var(--radius-lg);
    }

    h1 {
      margin: 0 0 var(--space-3);
      font-size: var(--text-xl);
      font-weight: var(--weight-semibold);
    }

    p {
      margin: 0 0 var(--space-4);
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-4);
    }

    .btn {
      min-height: var(--target-min);
      padding: 0 var(--space-4);
      background: var(--accent);
      border: 0;
      border-radius: var(--radius-pill);
      color: inherit;
      font: var(--weight-semibold) var(--text-sm) / 1 var(--font-ui);
      cursor: pointer;
    }

    a {
      display: inline-flex;
      align-items: center;
      min-height: var(--target-min);
      color: var(--text-accent);
    }
  `,
})
export class DesignerLoadError {
  private readonly reloadPage = inject(RELOAD_PAGE);

  protected reload(): void {
    this.reloadPage();
  }
}
