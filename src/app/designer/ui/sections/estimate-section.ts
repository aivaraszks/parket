import { Component, inject } from '@angular/core';
import { LIMITS } from '../../state/design-defaults';
import { DesignState } from '../../state/design-state';
import { formatArea, formatCount } from '../format';
import { SliderField } from '../slider-field';

@Component({
  selector: 'app-estimate-section',
  imports: [SliderField],
  template: `
    <div class="fields">
      <div class="headline">
        <p class="big">{{ count(state.planksWithWaste()) }} planks to buy</p>
        <p class="sub">
          {{ area(state.areaWithWaste()) }} m² incl. {{ state.wastePercent() }}% waste
        </p>
      </div>
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

      <details class="more">
        <summary>Details and how it is calculated</summary>
        <div class="fields">
          <dl class="results">
            <div class="row">
              <dt>Floor area</dt>
              <dd>{{ area(state.floorArea()) }} m²</dd>
            </div>
            <div class="row">
              <dt>Planks needed (no waste)</dt>
              <dd>{{ count(state.planksNet()) }}</dd>
            </div>
            <div class="row">
              <dt>Skirting length <small>Walls minus doors</small></dt>
              <dd>{{ state.skirtingLength().toFixed(1) }} m</dd>
            </div>
          </dl>
          <p class="method">
            {{ assumptions }} Plank size {{ state.plank().length }} x {{ state.plank().width }} mm.
          </p>
        </div>
      </details>
    </div>
  `,
  styleUrl: './estimate-section.scss',
})
export class EstimateSection {
  protected readonly state = inject(DesignState);

  protected readonly limits = LIMITS;
  protected readonly area = formatArea;
  protected readonly count = formatCount;
  protected readonly assumptions =
    'Estimate for the floor area of your room. Fixed fittings (cupboards, stairs) are not deducted. The waste allowance covers cuts at the walls and the ends of the herringbone. Planks are rounded up. Skirting length is all walls minus the doors; windows are not deducted. Check with your supplier before ordering.';
}
