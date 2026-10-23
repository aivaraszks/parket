import { afterNextRender, Component, computed, inject, signal } from '@angular/core';
import { SceneCommands } from '../scene/scene-commands';

/** Overlay on the view for the loading, no-WebGL/error and context-lost states. */
@Component({
  selector: 'app-viewport-status',
  template: `
    <!-- The live region exists (empty) before its text is set, so screen readers announce it. -->
    <p class="visually-hidden" role="status">{{ announcement() }}</p>
    @switch (scene.status()) {
      @case ('loading') {
        <div class="screen">
          <p aria-hidden="true">Preparing your room...</p>
          <div class="progress" aria-hidden="true"><span></span></div>
        </div>
      }
      @case ('context-lost') {
        <p class="paused" aria-hidden="true">Display paused. Restoring...</p>
      }
      @case ('no-webgl') {
        <div class="screen">
          <div class="card" role="alert">
            <h2>3D view isn't available</h2>
            <p>
              Your browser or device can't show the 3D view. You can still work out how much
              flooring you need.
            </p>
            <button type="button" class="btn" (click)="retry()">Try again</button>
          </div>
        </div>
      }
      @case ('error') {
        <div class="screen">
          <div class="card" role="alert">
            <h2>3D view isn't available</h2>
            <p>
              Your browser or device can't show the 3D view. You can still work out how much
              flooring you need.
            </p>
            <button type="button" class="btn" (click)="retry()">Try again</button>
          </div>
        </div>
      }
    }
  `,
  styleUrl: './viewport-status.scss',
})
export class ViewportStatus {
  protected readonly scene = inject(SceneCommands);
  private readonly armed = signal(false);

  protected readonly announcement = computed(() => {
    if (!this.armed()) {
      return '';
    }
    switch (this.scene.status()) {
      case 'loading':
        return 'Preparing your room...';
      case 'context-lost':
        return 'Display paused. Restoring...';
      default:
        return '';
    }
  });

  constructor() {
    afterNextRender(() => this.armed.set(true));
  }

  /** Re-creates the scene on a fresh canvas. */
  protected retry(): void {
    this.scene.retry();
  }
}
