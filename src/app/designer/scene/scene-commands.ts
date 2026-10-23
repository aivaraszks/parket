import { Service, signal } from '@angular/core';

export type ViewPreset = 'corner' | 'doorway' | 'top';
export type SceneStatus = 'loading' | 'ready' | 'no-webgl' | 'context-lost' | 'error';

/** What the live scene offers to the UI (implemented by FloorScene, faked in tests). */
export interface SceneController {
  setPreset(name: ViewPreset): void;
  zoom(direction: 1 | -1): void;
  exportPng(): Promise<Blob>;
}

/**
 * Root service the controls call. The Viewport attaches the live scene and publishes its
 * status; without a scene, commands are ignored and exportPng rejects.
 */
@Service()
export class SceneCommands {
  private readonly _status = signal<SceneStatus>('loading');
  private controller: SceneController | null = null;
  private retryHandler: (() => void) | null = null;

  readonly status = this._status.asReadonly();

  setPreset(name: ViewPreset): void {
    this.controller?.setPreset(name);
  }

  zoom(direction: 1 | -1): void {
    this.controller?.zoom(direction);
  }

  exportPng(): Promise<Blob> {
    if (!this.controller) {
      return Promise.reject(new Error('The 3D view is not available.'));
    }
    return this.controller.exportPng();
  }

  /** Re-create the 3D scene after a failure ("Try again"). Ignored without a viewport. */
  retry(): void {
    this.retryHandler?.();
  }

  /** Called by the Viewport only. */
  setRetryHandler(handler: (() => void) | null): void {
    this.retryHandler = handler;
  }

  /** Called by the Viewport only. */
  attach(controller: SceneController): void {
    this.controller = controller;
  }

  /** Called by the Viewport only; ignores stale detaches. */
  detach(controller: SceneController): void {
    if (this.controller === controller) {
      this.controller = null;
    }
  }

  /** Called by the Viewport only. */
  setStatus(status: SceneStatus): void {
    this._status.set(status);
  }
}
