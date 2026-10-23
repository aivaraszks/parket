import { Component, computed, inject } from '@angular/core';
import { SceneCommands } from '../../scene/scene-commands';
import { LIMITS, RoomMode } from '../../state/design-defaults';
import { DesignState } from '../../state/design-state';
import { shapeArea } from '../../plan/room-shape';
import { formatArea, plural } from '../format';
import { PlanEditorLauncher } from '../plan-editor-launcher';
import { SliderField } from '../slider-field';

const MODES: readonly { id: RoomMode; label: string }[] = [
  { id: 'simple', label: 'Rectangle' },
  { id: 'custom', label: 'Custom shape' },
];

let nextId = 0;

@Component({
  selector: 'app-room-section',
  imports: [SliderField],
  template: `
    <div class="fields">
      <fieldset class="modes">
        <legend class="visually-hidden">Room type</legend>
        <div class="segments">
          @for (option of modes; track option.id) {
            <label class="segment">
              <input
                type="radio"
                [name]="name"
                [value]="option.id"
                [checked]="state.mode() === option.id"
                [attr.data-mode-custom]="option.id === 'custom' ? '' : null"
                aria-describedby="room-saved-note"
                (change)="pick(option.id)"
              />
              <span class="face">{{ option.label }}</span>
            </label>
          }
        </div>
        <p class="helper" id="room-saved-note">Both rooms are saved.</p>
      </fieldset>

      @if (state.mode() === 'simple') {
        <app-slider-field
          label="Length"
          unit="m"
          [value]="state.simpleRoom().length"
          [min]="limits.roomLength.min"
          [max]="limits.roomLength.max"
          [step]="0.1"
          [numberStep]="0.01"
          [decimals]="2"
          (changed)="state.setRoomLength($event)"
        />
        <app-slider-field
          label="Width"
          unit="m"
          [value]="state.simpleRoom().width"
          [min]="limits.roomWidth.min"
          [max]="limits.roomWidth.max"
          [step]="0.1"
          [numberStep]="0.01"
          [decimals]="2"
          (changed)="state.setRoomWidth($event)"
        />
      } @else {
        <section class="card" aria-labelledby="custom-card-title">
          <h3 class="card-title" id="custom-card-title">Custom shape</h3>
          <p class="meta">{{ corners() }} · {{ area() }} m²</p>
          <p class="meta">{{ openings() }}</p>
          <button type="button" class="btn primary" data-edit-shape (click)="edit()">
            Edit shape
          </button>
        </section>
      }

      <details class="more">
        <summary>Ceiling height and more</summary>
        <div class="fields">
          <app-slider-field
            label="Ceiling height"
            unit="m"
            [value]="state.roomHeight()"
            [min]="lowestHeight()"
            [max]="limits.roomHeight.max"
            [step]="0.05"
            [numberStep]="0.01"
            [decimals]="2"
            (changed)="state.setRoomHeight($event)"
          />
          @if (lowestHeight() > limits.roomHeight.min) {
            <p class="helper">
              Lowest possible: {{ lowestHeight().toFixed(2) }} m. Doors and windows set it.
            </p>
          }
          @if (state.mode() === 'simple') {
            <p class="helper">The window is in one of the long walls.</p>
          } @else {
            <p class="helper">Doors and windows are set in the shape editor.</p>
          }
        </div>
      </details>
    </div>
  `,
  styleUrl: './room-section.scss',
})
export class RoomSection {
  protected readonly state = inject(DesignState);
  protected readonly lowestHeight = computed(() =>
    Math.max(this.limits.roomHeight.min, this.state.minRoomHeight()),
  );
  private readonly scene = inject(SceneCommands);
  private readonly launcher = inject(PlanEditorLauncher);
  protected readonly limits = LIMITS;
  protected readonly modes = MODES;
  protected readonly name = `room-mode-${nextId++}`;

  protected readonly corners = computed(() =>
    plural(this.state.roomShape().outline.length, 'corner'),
  );
  protected readonly area = computed(() => formatArea(shapeArea(this.state.roomShape())));
  protected readonly openings = computed(() => {
    const list = this.state.roomShape().openings;
    const doors = list.filter((o) => o.kind === 'door').length;
    const windows = list.length - doors;
    return `${doors === 0 ? 'No doors' : plural(doors, 'door')} · ${windows === 0 ? 'No windows' : plural(windows, 'window')}`;
  });

  /** Switching refits the camera. The very first switch to Custom opens the editor. */
  protected pick(mode: RoomMode): void {
    if (mode === this.state.mode()) {
      return;
    }
    const first = mode === 'custom' && this.state.plan() === null;
    this.state.setMode(mode);
    this.scene.setPreset('corner');
    if (first) {
      this.launcher.open();
    }
  }

  protected edit(): void {
    this.launcher.open();
  }
}
