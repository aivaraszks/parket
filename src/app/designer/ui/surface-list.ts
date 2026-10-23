import { Component, computed, inject, input } from '@angular/core';
import { SurfaceRef, sameSurface } from '../plan/paint';
import { ColouringState } from '../state/colouring-state';
import { paletteName } from '../state/palettes';
import { SurfaceItem, SurfaceSection } from './surface-model';

interface Group {
  readonly section: SurfaceSection;
  readonly legend: string;
  readonly items: readonly SurfaceItem[];
}

const LEGENDS: Record<SurfaceSection, string> = { walls: 'Walls', doors: 'Doors', other: 'Other' };
let nextId = 0;

/**
 * The surfaces as radio chips: one fieldset per section, one selection across all of them.
 * Every group has its own radio name, so arrows stay inside a group and Tab moves between groups.
 */
@Component({
  selector: 'app-surface-list',
  templateUrl: './surface-list.html',
  styleUrl: './surface-list.scss',
})
export class SurfaceList {
  private readonly colouring = inject(ColouringState);

  readonly items = input.required<readonly SurfaceItem[]>();
  /** Doors cannot exist (simple mode): a muted line takes the place of the section. */
  readonly noDoors = input(false);

  private readonly uid = nextId++;
  protected readonly groups = computed<Group[]>(() =>
    (['walls', 'doors', 'other'] as const)
      .map((section) => ({
        section,
        legend: LEGENDS[section],
        items: this.items().filter((item) => item.section === section),
      }))
      .filter((group) => group.items.length > 0),
  );
  protected readonly selected = this.colouring.selected;

  protected groupName(section: SurfaceSection): string {
    return `surface-${this.uid}-${section}`;
  }

  protected itemId(index: number, section: SurfaceSection): string {
    return `surface-${this.uid}-${section}-${index}`;
  }

  protected isSelected(ref: SurfaceRef): boolean {
    return sameSurface(this.selected(), ref);
  }

  protected colourName(hex: string): string {
    return paletteName(hex) ?? `Custom ${hex}`;
  }

  protected pick(ref: SurfaceRef): void {
    this.colouring.select(ref, 'list');
  }
}
