// Colour section UI state (plan dock-redesign.md, D6). Not persisted: Colour is closed on every
// visit, and the selection only lives while it is open.

import { computed, DestroyRef, inject, Service, signal } from '@angular/core';
import { SurfaceRef } from '../plan/paint';

/** Where a selection came from: a tap in 3D, or the Colour section's chip rows. */
export type SelectionSource = 'tap' | 'list';

/** How long the selection highlight stays after a colour pick (ms). */
export const HIGHLIGHT_FADE_MS = 1500;

@Service()
export class ColouringState {
  private readonly _colourOpen = signal(false);
  private readonly _faded = signal(false);
  private fadeTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly _selected = signal<SurfaceRef | null>(null);
  private readonly _lastTap = signal(0);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stopFade());
  }

  /** The selected surface or group; set from a tap or from the chip rows. */
  readonly selected = this._selected.asReadonly();
  /**
   * Counts selections made by a 3D tap (a tap on empty space does not count).
   */
  readonly lastTap = this._lastTap.asReadonly();

  // ---- dock-redesign D6 API (frozen contract) ----

  /** True while the Colour section is open; set by the designer shell. */
  readonly colourOpen = this._colourOpen.asReadonly();

  /**
   * What the scene highlights: the selection, or null once it faded 1.5 s after a colour pick
   * (markColourPicked). Feed it to FloorSceneApi.setHighlight.
   */
  readonly highlight = computed(() => (this._faded() ? null : this._selected()));

  /**
   * Open or close the Colour section. Opening selects 'All walls' if nothing is selected; closing
   * clears the selection.
   */
  setColourOpen(open: boolean): void {
    this._colourOpen.set(open);
    if (open) {
      if (this._selected() === null) {
        this.select({ kind: 'walls' }, 'list');
      }
    } else {
      this.clear();
    }
  }

  /** Call after a colour was applied: the highlight fades after HIGHLIGHT_FADE_MS. */
  markColourPicked(): void {
    this.stopFade();
    this._faded.set(false);
    this.fadeTimer = setTimeout(() => {
      this.fadeTimer = null;
      this._faded.set(true);
    }, HIGHLIGHT_FADE_MS);
  }

  /** Taps in the 3D view select a surface while the Colour section is open. */
  readonly picking = computed(() => this._colourOpen());

  /** True while a surface is selected. */
  readonly hasSelection = computed(() => this._selected() !== null);

  /** Select a surface. A `'tap'` selection also bumps `lastTap`. */
  select(ref: SurfaceRef, source: SelectionSource): void {
    this.stopFade();
    this._faded.set(false);
    this._selected.set(ref);
    if (source === 'tap') {
      this._lastTap.update((n) => n + 1);
    }
  }

  clear(): void {
    this.stopFade();
    this._faded.set(false);
    this._selected.set(null);
  }

  private stopFade(): void {
    if (this.fadeTimer !== null) {
      clearTimeout(this.fadeTimer);
      this.fadeTimer = null;
    }
  }
}
