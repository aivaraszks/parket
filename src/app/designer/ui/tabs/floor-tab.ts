import { Component, computed, inject, signal } from '@angular/core';
import { LIMITS } from '../../state/design-defaults';
import { DesignState } from '../../state/design-state';
import { SPECIES } from '../../state/species';
import { FinishControl } from '../finish-control';
import { SliderField } from '../slider-field';
import { WoodPicker } from '../wood-picker';

const PLANK_RULE = 'Plank length must be at least twice the width.';
const BLOCK_RULE =
  'Plank length must be at least twice the block width (planks per block x width).';

@Component({
  selector: 'app-floor-tab',
  imports: [SliderField, WoodPicker, FinishControl],
  template: `
    <h2 class="visually-hidden">Floor</h2>
    <div class="fields">
      <app-wood-picker
        [species]="species"
        [value]="state.species()"
        (picked)="state.setSpecies($event)"
      />
      <p class="helper">Pattern: Herringbone</p>
      <app-slider-field
        label="Plank length"
        unit="mm"
        [value]="state.plank().length"
        [min]="limits.plankLength.min"
        [max]="limits.plankLength.max"
        [rangeMin]="state.plankLengthMin()"
        [step]="10"
        [error]="lengthError()"
        (changed)="setLength($event)"
      />
      <app-slider-field
        label="Plank width"
        unit="mm"
        [value]="state.plank().width"
        [min]="limits.plankWidth.min"
        [max]="limits.plankWidth.max"
        [rangeMax]="state.plankWidthMax()"
        [step]="5"
        [error]="widthError()"
        (changed)="setWidth($event)"
      />
      <app-slider-field
        label="Planks per block"
        [value]="state.planksPerBlock()"
        [min]="limits.planksPerBlock.min"
        [max]="limits.planksPerBlock.max"
        [step]="1"
        note="1 = classic herringbone"
        (changed)="setBlock($event)"
      />
      @if (adjusted()) {
        <p class="helper" role="status">{{ adjusted() }}</p>
      }
      <app-slider-field
        label="Angle"
        unit="deg"
        [value]="state.angle()"
        [min]="limits.angle.min"
        [max]="limits.angle.max"
        [step]="1"
        [ticks]="angleTicks"
        note="0 deg = zigzag runs along the room's length. Patterns repeat after 180 deg."
        (changed)="state.setAngle($event)"
      />
      <app-finish-control [value]="state.finish()" (picked)="state.setFinish($event)" />
    </div>
  `,
  styleUrl: './tab.scss',
})
export class FloorTab {
  protected readonly state = inject(DesignState);
  protected readonly limits = LIMITS;
  protected readonly species = SPECIES;
  protected readonly angleTicks = [0, 45, 90, 135];

  protected readonly lengthError = signal('');
  protected readonly widthError = signal('');
  protected readonly adjusted = signal('');
  private readonly rule = computed(() =>
    this.state.planksPerBlock() > 1 ? BLOCK_RULE : PLANK_RULE,
  );

  protected setLength(value: number): void {
    this.state.setPlankLength(value);
    this.clearHints();
    this.lengthError.set(this.state.plank().length === value ? '' : this.rule());
  }

  protected setWidth(value: number): void {
    this.state.setPlankWidth(value);
    this.clearHints();
    this.widthError.set(this.state.plank().width === value ? '' : this.rule());
  }

  protected setBlock(value: number): void {
    const before = this.state.plank();
    this.state.setPlanksPerBlock(value);
    this.clearHints();
    const after = this.state.plank();
    const changes: string[] = [];
    if (after.width !== before.width) changes.push(`width set to ${after.width} mm`);
    if (after.length !== before.length) changes.push(`length set to ${after.length} mm`);
    if (changes.length > 0) {
      this.adjusted.set(`Plank ${changes.join(' and ')} to fit the block.`);
    }
  }

  private clearHints(): void {
    this.lengthError.set('');
    this.widthError.set('');
    this.adjusted.set('');
  }
}
