import { afterNextRender, Component, ElementRef, inject, input, output } from '@angular/core';
import { Species } from '../state/species';
import { isLightColor } from './swatch-group';

let nextId = 0;

/** Wood species as a one-row strip (scrolls sideways) of radio items: a swatch and a name. */
@Component({
  selector: 'app-wood-picker',
  template: `
    <fieldset>
      <legend>Wood</legend>
      <div class="options">
        @for (item of species(); track item.id) {
          <label class="choice">
            <input
              type="radio"
              [name]="name"
              [value]="item.id"
              [checked]="item.id === value()"
              (change)="picked.emit(item.id)"
            />
            <span
              class="chip"
              [style.--swatch]="item.bases[0]"
              [style.--grain]="item.grain"
              [style.--check]="checkColor(item.bases[0])"
            >
              @if (item.id === value()) {
                <svg class="check" viewBox="0 0 16 16" aria-hidden="true">
                  <path
                    d="M3 8.5l3.2 3.2L13 4.8"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              }
            </span>
            <span class="name">{{ item.name }}</span>
          </label>
        }
      </div>
    </fieldset>
  `,
  styleUrl: './wood-picker.scss',
})
export class WoodPicker {
  readonly species = input.required<readonly Species[]>();
  readonly value = input.required<string>();
  readonly picked = output<string>();

  protected readonly name = `wood-${nextId++}`;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    // The strip scrolls sideways: start with the chosen wood in view.
    afterNextRender(() =>
      this.host.nativeElement
        .querySelector('input:checked')
        ?.parentElement?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' }),
    );
  }

  protected readonly checkColor = (hex: string): string =>
    isLightColor(hex) ? 'var(--text-on-accent)' : 'var(--text-primary)';
}
