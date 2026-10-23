import { Component, computed, effect, inject, signal } from '@angular/core';
import { DesignState } from '../state/design-state';
import { formatArea, formatCount } from './format';

export const LIVE_DEBOUNCE_MS = 500;

/**
 * The always-visible estimate line (peek bar / pinned footer). Screen readers get one
 * debounced sentence in a polite live region, so dragging a slider is not read out on every step.
 */
@Component({
  selector: 'app-estimate-summary',
  template: `
    <p class="line" data-testid="summary">
      <strong>{{ area() }} m²</strong>
      <span class="sep" aria-hidden="true">·</span>
      <span>
        <strong>Buy {{ planks() }} planks</strong>
        (incl. {{ state.wastePercent() }}% waste)
      </span>
    </p>
    <p class="visually-hidden" aria-live="polite" data-testid="live">{{ live() }}</p>
  `,
  styleUrl: './estimate-summary.scss',
})
export class EstimateSummary {
  protected readonly state = inject(DesignState);

  protected readonly area = computed(() => formatArea(this.state.floorArea()));
  protected readonly planks = computed(() => formatCount(this.state.planksWithWaste()));
  private readonly sentence = computed(
    () =>
      `${this.area()} square metres, ${this.planks()} planks including ${this.state.wastePercent()} percent waste`,
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
