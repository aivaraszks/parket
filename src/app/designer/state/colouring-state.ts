// Colouring mode UI state (plan wall-colouring.md, W8). Not persisted: Colour mode is off on
// every visit, and the selection is cleared when its surface stops existing.
//
// CONTRACT FILE. Owned by track C after task 3; the API below is what tracks B and C rely on.

import { computed, Service, signal } from '@angular/core';
import { SurfaceRef } from '../plan/paint';

/** Where a selection came from: a tap in 3D, or the Surfaces tab list. */
export type SelectionSource = 'tap' | 'list';

@Service()
export class ColouringState {
  private readonly _active = signal(false);
  private readonly _selected = signal<SurfaceRef | null>(null);
  private readonly _lastTap = signal(0);
  private readonly _surfacesOpen = signal(false);

  /** Colour mode: taps in the 3D view select a surface. */
  readonly active = this._active.asReadonly();
  /** The selected surface or group; set from a tap or from the list, even with Colour mode off. */
  readonly selected = this._selected.asReadonly();
  /**
   * Counts selections made by a 3D tap (a tap on empty space does not count). The designer
   * reacts to changes of it by opening the Surfaces tab at Half height.
   */
  readonly lastTap = this._lastTap.asReadonly();

  /** True while the Surfaces tab is open; set by the designer shell. */
  readonly surfacesOpen = this._surfacesOpen.asReadonly();

  /** Taps in the 3D view select a surface: in Colour mode, or while the Surfaces tab is open. */
  readonly picking = computed(() => this._active() || this._surfacesOpen());

  /** True while a surface is selected. */
  readonly hasSelection = computed(() => this._selected() !== null);

  /** Turning Colour mode off also clears the selection. */
  setActive(on: boolean): void {
    this._active.set(on);
    if (!on) {
      this._selected.set(null);
    }
  }

  toggle(): void {
    this.setActive(!this._active());
  }

  setSurfacesOpen(open: boolean): void {
    this._surfacesOpen.set(open);
  }

  /** Select a surface. A `'tap'` selection also bumps `lastTap`. */
  select(ref: SurfaceRef, source: SelectionSource): void {
    this._selected.set(ref);
    if (source === 'tap') {
      this._lastTap.update((n) => n + 1);
    }
  }

  clear(): void {
    this._selected.set(null);
  }
}
