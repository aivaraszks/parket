import { Component, inject } from '@angular/core';
import { SceneCommands } from '../../scene/scene-commands';
import { LIMITS } from '../../state/design-defaults';
import { DesignState } from '../../state/design-state';
import { formatArea, formatCount } from '../format';
import { SliderField } from '../slider-field';
import { Toasts } from '../toasts';

const UNDO_TOAST_MS = 8000;

@Component({
  selector: 'app-estimate-tab',
  imports: [SliderField],
  template: `
    <h2 class="title">Your floor</h2>
    <dl class="results">
      <div class="row">
        <dt>Floor area</dt>
        <dd>{{ area(state.floorArea()) }} m²</dd>
      </div>
      <div class="row">
        <dt>Skirting length <small class="sub">Walls minus doors</small></dt>
        <dd>{{ state.skirtingLength().toFixed(1) }} m</dd>
      </div>
      <div class="row">
        <dt>Planks needed (no waste)</dt>
        <dd>{{ count(state.planksNet()) }}</dd>
      </div>
    </dl>
    <app-slider-field
      label="Waste allowance"
      unit="%"
      [value]="state.wastePercent()"
      [min]="limits.wastePercent.min"
      [max]="limits.wastePercent.max"
      [step]="1"
      note="10-15% is typical for herringbone."
      (changed)="state.setWastePercent($event)"
    />
    <dl class="results">
      <div class="row">
        <dt>Area to buy (incl. waste)</dt>
        <dd>{{ area(state.areaWithWaste()) }} m²</dd>
      </div>
      <div class="row total">
        <dt>Planks to buy (incl. waste)</dt>
        <dd>{{ count(state.planksWithWaste()) }}</dd>
      </div>
    </dl>
    <p class="note">{{ assumptions }}</p>
    <details>
      <summary>How this is calculated</summary>
      <p>{{ assumptions }} Plank size {{ state.plank().length }} x {{ state.plank().width }} mm.</p>
    </details>
    <div class="reset">
      <button type="button" class="btn" (click)="reset()">Reset design</button>
      @if (state.plan()) {
        <p class="kept">Your custom shape is kept.</p>
      }
    </div>
  `,
  styleUrl: './estimate-tab.scss',
})
export class EstimateTab {
  protected readonly state = inject(DesignState);
  private readonly scene = inject(SceneCommands);
  private readonly toasts = inject(Toasts);

  protected readonly limits = LIMITS;
  protected readonly area = formatArea;
  protected readonly count = formatCount;
  protected readonly assumptions =
    'Estimate for the floor area of your room. Fixed fittings (cupboards, stairs) are not deducted. The waste allowance covers cuts at the walls and the ends of the herringbone. Planks are rounded up. Skirting length is all walls minus the doors; windows are not deducted. Check with your supplier before ordering.';

  protected reset(): void {
    this.state.reset();
    this.scene.setPreset('corner');
    this.toasts.show('Design reset.', {
      durationMs: UNDO_TOAST_MS,
      action: { label: 'Undo', run: () => this.state.undo() },
      // A manual edit drops the undo buffer; the toast must not offer a dead Undo.
      keepWhile: () => this.state.canUndo(),
      onDismiss: () => this.state.dismissUndo(),
    });
  }
}
