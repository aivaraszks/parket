import { Component, computed, effect, inject, signal } from '@angular/core';
import { DesignState } from '../state/design-state';
import { formatArea, formatCount } from './format';

export const LIVE_DEBOUNCE_MS = 500;

/** "Estimate, 374 planks to buy, 22.40 square metres": the dock button's accessible name. */
export function estimateName(planks: number, area: number): string {
  return `Estimate, ${formatCount(planks)} planks to buy, ${formatArea(area)} square metres`;
}

/** The dock's Estimate button content: the planks to buy over the word "planks". */
@Component({
  selector: 'app-estimate-summary',
  template: `
    <span class="count" data-testid="summary">{{ planks() }}</span
    >{{ ' ' }}
    <span class="unit">planks</span>
  `,
  styleUrl: './estimate-summary.scss',
})
export class EstimateSummary {
  private readonly state = inject(DesignState);
  protected readonly planks = computed(() => formatCount(this.state.planksWithWaste()));
}

/**
 * Screen readers get one debounced sentence in a polite live region, so dragging a slider is not
 * read out on every step. Lives next to (not inside) the dock button.
 */
@Component({
  selector: 'app-estimate-live',
  template: `<p class="visually-hidden" aria-live="polite" data-testid="live">{{ live() }}</p>`,
})
export class EstimateLive {
  private readonly state = inject(DesignState);

  private readonly sentence = computed(
    () =>
      `${formatArea(this.state.floorArea())} square metres, ${formatCount(this.state.planksWithWaste())} planks including ${this.state.wastePercent()} percent waste`,
  );

  protected readonly live = signal('');

  constructor() {
    effect((onCleanup) => {
      const text = this.sentence();
      const timer = setTimeout(() => this.live.set(text), LIVE_DEBOUNCE_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }
}
