import { afterNextRender, Component, ElementRef, inject } from '@angular/core';
import { RELOAD_PAGE } from '../../load-error/designer-load-error';
import { PlanEditorLauncher } from './plan-editor-launcher';

/** Shown instead of the shape editor when its lazy chunk cannot be loaded. */
@Component({
  selector: 'app-plan-editor-load-error',
  host: { '(keydown.escape)': 'launcher.close()' },
  template: `
    <div class="box" role="dialog" aria-modal="true" aria-labelledby="plan-load-error-title">
      <h2 id="plan-load-error-title">Couldn't load the editor</h2>
      <p>Check your connection and try again.</p>
      <div class="actions">
        <button type="button" class="btn" data-retry (click)="reload()">Try again</button>
        <button type="button" class="btn plain" (click)="launcher.close()">Close</button>
      </div>
    </div>
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      z-index: var(--z-plan);
      display: grid;
      place-items: center;
      padding: var(--space-4);
      background: var(--plan-bg);
      color: var(--text-primary);
      font-family: var(--font-ui);
    }

    .box {
      max-width: 24rem;
      padding: var(--space-6);
      background: var(--surface-raised);
      border-radius: var(--radius-lg);
    }

    h2 {
      margin: 0 0 var(--space-3);
      font-size: var(--text-xl);
    }

    p {
      margin: 0 0 var(--space-4);
    }

    .actions {
      display: flex;
      gap: var(--space-3);
    }

    .btn {
      min-height: var(--target-min);
      padding: 0 var(--space-4);
      background: var(--accent);
      border: 0;
      border-radius: var(--radius-pill);
      color: var(--text-on-accent);
      font: var(--weight-semibold) var(--text-sm) / 1 var(--font-ui);
      cursor: pointer;
    }

    .plain {
      background: transparent;
      border: 1px solid var(--control-border);
      color: var(--text-primary);
    }
  `,
})
export class PlanEditorLoadError {
  protected readonly launcher = inject(PlanEditorLauncher);
  private readonly reloadPage = inject(RELOAD_PAGE);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    afterNextRender(() =>
      this.host.nativeElement.querySelector<HTMLElement>('[data-retry]')?.focus(),
    );
  }

  protected reload(): void {
    this.reloadPage();
  }
}
