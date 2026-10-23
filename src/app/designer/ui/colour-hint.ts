import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { ColouringState } from '../state/colouring-state';
import { DesignState } from '../state/design-state';
import { ColourAnnouncer } from './colour-announcer';
import { doorIds } from './surface-model';

const KEY = 'parket.colourHint.v1';

export const HINT_WITH_DOORS = 'Tap a wall, door, skirting or the ceiling.';
export const HINT_NO_DOORS = 'Tap a wall, skirting or the ceiling.';

function seenBefore(): boolean {
  try {
    return globalThis.localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

function remember(): void {
  try {
    globalThis.localStorage.setItem(KEY, '1');
  } catch {
    // Not remembered: the hint shows again next visit.
  }
}

/**
 * First-use hint over the 3D view while Colour is open (docs/ux/dock-redesign.md): no timer, gone
 * after the first successful 3D tap, never again after that. It never takes pointer events, and is
 * announced once through the colour announcer. Place it in the stage; `available` is false when
 * there is no 3D view (nothing to tap).
 */
@Component({
  selector: 'app-colour-hint',
  template: `
    @if (visible()) {
      <p class="hint">{{ text() }}</p>
    }
  `,
  styleUrl: './colour-hint.scss',
})
export class ColourHint {
  private readonly colouring = inject(ColouringState);
  private readonly design = inject(DesignState);
  private readonly announcer = inject(ColourAnnouncer);

  readonly available = input(true);

  private readonly seen = signal(seenBefore());
  protected readonly visible = computed(
    () => this.available() && this.colouring.colourOpen() && !this.seen(),
  );
  protected readonly text = computed(() =>
    doorIds(this.design.roomShape()).length > 0 ? HINT_WITH_DOORS : HINT_NO_DOORS,
  );

  constructor() {
    // The first successful 3D tap retires the hint for good.
    let taps = untracked(() => this.colouring.lastTap());
    effect(() => {
      const now = this.colouring.lastTap();
      if (now !== taps) {
        taps = now;
        if (untracked(() => this.visible())) {
          untracked(() => this.dismiss());
        }
      }
    });
    // Announced once, the first time it appears.
    let announced = false;
    effect(() => {
      if (this.visible() && !announced) {
        announced = true;
        // Later, so the tray heading is read first.
        untracked(() => this.announcer.sayLater(this.text()));
      }
    });
  }

  private dismiss(): void {
    remember();
    this.seen.set(true);
  }
}
