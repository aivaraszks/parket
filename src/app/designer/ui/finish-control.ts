import { Component, computed, input, output } from '@angular/core';
import { Finish } from '../state/design-defaults';

let nextId = 0;

const OPTIONS: readonly { id: Finish; label: string; hint: string }[] = [
  { id: 'matte', label: 'Matte', hint: 'Oiled, no reflections' },
  { id: 'satin', label: 'Satin', hint: 'Soft sheen' },
  { id: 'gloss', label: 'Gloss', hint: 'Lacquered, mirror-like highlights' },
];

/** Segmented control for the floor finish (a radio group). */
@Component({
  selector: 'app-finish-control',
  template: `
    <fieldset>
      <legend>Finish</legend>
      <div class="segments">
        @for (option of options; track option.id) {
          <label class="segment">
            <input
              type="radio"
              [name]="name"
              [value]="option.id"
              [checked]="option.id === value()"
              [attr.aria-describedby]="hintId"
              (change)="picked.emit(option.id)"
            />
            <span class="face">{{ option.label }}</span>
          </label>
        }
      </div>
      <p class="hint" [id]="hintId">{{ hint() }}</p>
    </fieldset>
  `,
  styleUrl: './finish-control.scss',
})
export class FinishControl {
  readonly value = input.required<Finish>();
  readonly picked = output<Finish>();

  private readonly id = nextId++;
  protected readonly name = `finish-${this.id}`;
  protected readonly hintId = `finish-hint-${this.id}`;
  protected readonly options = OPTIONS;
  protected readonly hint = computed(
    () => OPTIONS.find((option) => option.id === this.value())?.hint ?? '',
  );
}
