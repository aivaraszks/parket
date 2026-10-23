import { Component, computed, ElementRef, inject, input, output } from '@angular/core';
import { ColorPreset } from '../state/species';

let nextId = 0;

/** True when dark content (a check mark) reads better on this colour. */
export function isLightColor(hex: string): boolean {
  const channel = (start: number): number => {
    const v = parseInt(hex.slice(start, start + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5) > 0.4;
}

/**
 * Colour presets as a radio group, plus a custom colour that becomes a selected swatch once used.
 * With `defaultLabel` a first text swatch means "no colour of its own" and emits `null`.
 */
@Component({
  selector: 'app-swatch-group',
  templateUrl: './swatch-group.html',
  styleUrl: './swatch-group.scss',
})
export class SwatchGroup {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly legend = input.required<string>();
  readonly presets = input.required<readonly ColorPreset[]>();
  /** Current colour as #rrggbb, or null when the default swatch is the current one. */
  readonly value = input.required<string | null>();
  /** Accessible name of the custom colour input. */
  readonly customLabel = input.required<string>();
  /** Text of the optional default swatch ("Match walls"). */
  readonly defaultLabel = input<string | null>(null);
  /** Hide the legend visually (a heading outside names the group). */
  readonly legendHidden = input(false);
  /**
   * Apply the custom colour when the picker closes (`change`) instead of on every move (`input`),
   * for choices that ask for a confirmation first.
   */
  readonly deferCustom = input(false);

  readonly picked = output<string | null>();

  protected readonly name = `swatch-${nextId++}`;
  protected readonly isCustom = computed(() => {
    const value = this.value();
    return value !== null && !this.presets().some((preset) => preset.hex === value);
  });
  /** Colour shown by the picker and the custom swatch. */
  protected readonly pickerValue = computed(() => this.value() ?? '#ffffff');
  protected readonly checkColor = (hex: string): string =>
    isLightColor(hex) ? 'var(--text-on-accent)' : 'var(--text-primary)';

  protected onRadio(hex: string | null): void {
    this.picked.emit(hex);
    // The parent may refuse the change (a confirmation is pending): show the real value again.
    // When it accepts, the bindings set the new state on the next render.
    const current = this.value() ?? '';
    this.host.nativeElement
      .querySelectorAll<HTMLInputElement>('input[type=radio]')
      .forEach((radio) => (radio.checked = radio.value === current));
  }

  protected onColorInput(event: Event): void {
    if (!this.deferCustom()) {
      this.picked.emit((event.target as HTMLInputElement).value);
    }
  }

  protected onColorChange(event: Event): void {
    if (this.deferCustom()) {
      const input = event.target as HTMLInputElement;
      this.picked.emit(input.value);
      input.value = this.pickerValue();
    }
  }
}
