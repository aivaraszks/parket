// CONTRACT FILE (dock-redesign task 4). Frozen for tracks B, C, D.
// The part of the full-screen view covered by UI chrome, in CSS px. The designer shell measures
// it and calls `set`; the Viewport forwards `insets()` to `SceneCommands.setFrame`.

import { computed, Service, signal } from '@angular/core';
import { FrameInsets, NO_INSETS } from '../scene/frame-insets';

export type { FrameInsets };

@Service()
export class ViewFrame {
  private readonly _insets = signal<FrameInsets>(NO_INSETS);

  /** Covered strips: top bar, dock + tray (bottom), rail + column (right). */
  readonly insets = this._insets.asReadonly();
  readonly top = computed(() => this._insets().top);
  readonly right = computed(() => this._insets().right);
  readonly bottom = computed(() => this._insets().bottom);
  readonly left = computed(() => this._insets().left);

  /** Called by the designer shell only. Ignores a change below half a pixel. */
  set(insets: FrameInsets): void {
    const a = this._insets();
    const same =
      Math.abs(a.top - insets.top) < 0.5 &&
      Math.abs(a.right - insets.right) < 0.5 &&
      Math.abs(a.bottom - insets.bottom) < 0.5 &&
      Math.abs(a.left - insets.left) < 0.5;
    if (!same) {
      this._insets.set({ ...insets });
    }
  }

  /** CSS custom properties for the designer host (`--frame-top` ... `--frame-left`). */
  readonly cssVars = computed<Record<string, string>>(() => {
    const i = this._insets();
    return {
      '--frame-top': `${i.top}px`,
      '--frame-right': `${i.right}px`,
      '--frame-bottom': `${i.bottom}px`,
      '--frame-left': `${i.left}px`,
    };
  });
}
