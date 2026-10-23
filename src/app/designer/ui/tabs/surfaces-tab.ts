import { Component, inject } from '@angular/core';
import { DesignState } from '../../state/design-state';
import { COLOR_PRESETS } from '../../state/species';
import { SwatchGroup } from '../swatch-group';

@Component({
  selector: 'app-surfaces-tab',
  imports: [SwatchGroup],
  template: `
    <h2 class="visually-hidden">Surfaces</h2>
    <div class="fields">
      <app-swatch-group
        legend="Wall colour"
        customLabel="Custom wall colour"
        [presets]="presets"
        [value]="state.wallColor()"
        (picked)="state.setWallColor($event)"
      />
      <app-swatch-group
        legend="Ceiling colour"
        customLabel="Custom ceiling colour"
        [presets]="presets"
        [value]="state.ceilingColor()"
        (picked)="state.setCeilingColor($event)"
      />
    </div>
  `,
  styleUrl: './tab.scss',
})
export class SurfacesTab {
  protected readonly state = inject(DesignState);
  protected readonly presets = COLOR_PRESETS;
}
