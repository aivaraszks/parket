import { Location } from '@angular/common';
import { inject, Service } from '@angular/core';
import { Router } from '@angular/router';

export const PLAN_EDITOR_URL = '/designer/plan';

/**
 * Opens and closes the shape editor route. Opening pushes a history entry, so Done can go back
 * (the same as the browser back button); a reloaded editor has nothing to go back to, so Done
 * replaces its entry instead.
 */
@Service()
export class PlanEditorLauncher {
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private pushed = false;

  open(): void {
    this.pushed = true;
    void this.router.navigateByUrl(PLAN_EDITOR_URL);
  }

  close(): void {
    if (this.pushed) {
      this.pushed = false;
      this.location.back();
    } else {
      void this.router.navigateByUrl('/designer', { replaceUrl: true });
    }
  }

  /** Called when the editor goes away by any route (so a later forward navigation starts clean). */
  closed(): void {
    this.pushed = false;
  }
}
