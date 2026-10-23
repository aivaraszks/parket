import { Component, computed, inject } from '@angular/core';
import { sunHitsWindow } from '../../scene/sun-window';
import { LIMITS } from '../../state/design-defaults';
import { DesignState } from '../../state/design-state';
import { PlanEditorLauncher } from '../plan-editor-launcher';
import { SliderField } from '../slider-field';

@Component({
  selector: 'app-light-section',
  imports: [SliderField],
  template: `
    <div class="fields">
      <label class="switch">
        <input
          type="checkbox"
          role="switch"
          [checked]="state.sun().on"
          (change)="onSwitch($event)"
        />
        <span class="track" aria-hidden="true"><span class="knob"></span></span>
        <span class="switch-label">Sunlight</span>
        <span class="switch-state" aria-hidden="true">{{ state.sun().on ? 'On' : 'Off' }}</span>
      </label>
      @if (off()) {
        <p class="helper">Turn sunlight on to adjust it.</p>
      }
      <app-slider-field
        label="Sun direction"
        unit="deg"
        [value]="state.sun().azimuth"
        [min]="limits.sunAzimuth.min"
        [max]="limits.sunAzimuth.max"
        [step]="1"
        [disabled]="off()"
        (changed)="state.setSun({ azimuth: $event })"
      />
      <div class="hint-region" aria-live="polite" [class.empty]="!noWindows() && !behindWalls()">
        @if (noWindows()) {
          <p class="helper">
            This room has no windows. Add one in the shape editor.
            <button type="button" class="link" data-edit-shape (click)="launcher.open()">
              Edit shape
            </button>
          </p>
        } @else if (behindWalls()) {
          <p class="helper">The sun is behind the walls. Turn it towards a window.</p>
        }
      </div>
      <app-slider-field
        label="Sun height"
        unit="deg"
        [value]="state.sun().elevation"
        [min]="limits.sunElevation.min"
        [max]="limits.sunElevation.max"
        [step]="1"
        [disabled]="off()"
        (changed)="state.setSun({ elevation: $event })"
      />
      <app-slider-field
        label="Sun brightness"
        unit="%"
        [value]="percent(state.sun().intensity)"
        [min]="percent(limits.sunIntensity.min)"
        [max]="percent(limits.sunIntensity.max)"
        [step]="10"
        [disabled]="off()"
        (changed)="state.setSun({ intensity: $event / 100 })"
      />
      <details class="more">
        <summary>More</summary>
        <p class="helper">
          Sun direction is where the sun comes from, as seen from above. The patch of light enters
          through a window.
        </p>
      </details>
    </div>
  `,
  styleUrl: './light-section.scss',
})
export class LightSection {
  protected readonly state = inject(DesignState);
  protected readonly limits = LIMITS;
  protected readonly launcher = inject(PlanEditorLauncher);
  protected readonly off = computed(() => !this.state.sun().on);
  private readonly hasWindows = computed(() =>
    this.state.roomShape().openings.some((o) => o.kind === 'window'),
  );
  /** Hints only while the sun is on. */
  protected readonly noWindows = computed(() => !this.off() && !this.hasWindows());
  protected readonly behindWalls = computed(
    () =>
      !this.off() &&
      this.hasWindows() &&
      !sunHitsWindow(this.state.roomShape(), this.state.sun().azimuth),
  );

  /** Brightness is stored as a factor and shown as a percent. */
  protected percent(factor: number): number {
    return Math.round(factor * 100);
  }

  protected onSwitch(event: Event): void {
    this.state.setSun({ on: (event.target as HTMLInputElement).checked });
  }
}
