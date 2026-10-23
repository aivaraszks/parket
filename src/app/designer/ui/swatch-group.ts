import { Component, computed, input, output } from '@angular/core';
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

/** Colour presets as a radio group, plus a custom colour that becomes a selected swatch once used. */
@Component({
  selector: 'app-swatch-group',
  templateUrl: './swatch-group.html',
  styleUrl: './swatch-group.scss',
})
export class SwatchGroup {
  readonly legend = input.required<string>();
  readonly presets = input.required<readonly ColorPreset[]>();
  /** Current colour as #rrggbb. */
  readonly value = input.required<string>();
  /** Accessible name of the custom colour input. */
  readonly customLabel = input.required<string>();

  readonly picked = output<string>();

  protected readonly name = `swatch-${nextId++}`;
  protected readonly isCustom = computed(
    () => !this.presets().some((preset) => preset.hex === this.value()),
  );
  protected readonly checkColor = (hex: string): string =>
    isLightColor(hex) ? 'var(--text-on-accent)' : 'var(--text-primary)';

  protected onColor(event: Event): void {
    this.picked.emit((event.target as HTMLInputElement).value);
  }
}
