import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  linkedSignal,
  untracked,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { minPlanHeight, minWallLength } from '../plan/plan-edit';
import {
  doorMaxHeight,
  PLAN_LIMITS as L,
  PlanOpening,
  windowMaxHeight,
  windowMaxSill,
} from '../plan/plan-model';
import { formatArea } from '../ui/format';
import { EditorSession, Selection } from './editor-session';
import { EditorView } from './editor-view';
import { NumberField } from './number-field';
import { kindName, openingsSummary, WallInfo } from './plan-info';

/** One metre field of the selected item's form. */
interface Field {
  name: string;
  label: string;
  value: number;
  min?: number;
  max?: number;
  hint: string;
  fixed?: boolean;
  commit: (value: number) => void;
}

const m2 = (n: number): string => n.toFixed(2);
const range = (min: number, max: number): string => `Use ${m2(min)} to ${m2(max)} m`;

/**
 * Details and forms for the selection, the Room form and the Walls and Corners lists. Desktop:
 * always the full side panel. Phone: an action bar for the selection and, on request, a short card
 * (details, or a Walls / Corners list from the overflow menu) above it.
 */
@Component({
  selector: 'app-plan-panel',
  imports: [NumberField, NgTemplateOutlet],
  templateUrl: './plan-panel.html',
  styleUrl: './plan-panel.scss',
  host: {
    '[class.card-open]': "card() === 'details'",
    '[class.list-open]': "card() === 'walls' || card() === 'corners'",
  },
})
export class PlanPanel {
  protected readonly session = inject(EditorSession);
  private readonly view = inject(EditorView);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  protected readonly card = this.session.card;
  protected readonly limits = L;
  protected readonly format = formatArea;
  protected readonly summarise = openingsSummary;
  protected readonly kindName = kindName;
  protected readonly info = this.session.info;
  protected readonly selected = this.session.selected;
  /** Which end stays put when a wall length is typed. */
  protected readonly keep = linkedSignal<string | undefined, 'start' | 'end'>({
    source: () => this.wall()?.id,
    computation: () => 'start',
  });

  protected readonly corner = computed(() => {
    const s = this.selected();
    return s?.kind === 'corner' ? s.corner : null;
  });
  protected readonly wall = computed(() => {
    const s = this.selected();
    return s?.kind === 'wall' ? s.wall : null;
  });
  protected readonly opening = computed(() => {
    const s = this.selected();
    return s?.kind === 'opening' ? s : null;
  });

  protected readonly maxOpenings = computed(
    () => this.session.plan().openings.length >= L.maxOpenings,
  );
  protected readonly atMinCorners = computed(
    () => (this.info()?.corners.length ?? 0) <= L.corners.min,
  );

  protected readonly title = computed(() => {
    const s = this.selected();
    switch (s?.kind) {
      case 'corner':
        return s.corner.name;
      case 'wall':
        return `${s.wall.name} · ${s.wall.length.toFixed(2)} m`;
      case 'opening':
        return `${kindName(s.opening)} on ${s.wall.name.toLowerCase()}`;
      default:
        return 'Room shape';
    }
  });

  /** Short name of the selection for the card label: "Wall 2", "Door 1". */
  protected readonly cardName = computed(() => {
    const s = this.selected();
    switch (s?.kind) {
      case 'corner':
        return s.corner.name;
      case 'wall':
        return s.wall.name;
      case 'opening':
        return this.openingName(s.opening);
      default:
        return 'Room';
    }
  });

  /** Text of the chip in the action bar, which also opens the card. */
  protected readonly chipText = computed(() => {
    const s = this.selected();
    switch (s?.kind) {
      case 'corner':
        return `${s.corner.name}: ${s.corner.x.toFixed(2)}, ${s.corner.y.toFixed(2)} m`;
      case 'wall':
        return `${s.wall.name}: ${s.wall.length.toFixed(2)} m`;
      case 'opening':
        return `${this.openingName(s.opening)}: ${s.opening.width.toFixed(2)} m wide`;
      default:
        return `Height ${(this.info()?.height ?? 0).toFixed(2)} m`;
    }
  });

  /** The number fields of whatever is selected (or the Room form). */
  protected readonly fields = computed<Field[]>(() => {
    const s = this.selected();
    const info = this.info();
    if (!info) {
      return [];
    }
    const session = this.session;
    if (s?.kind === 'corner') {
      const c = s.corner;
      const hint = (axis: string): string => `from the ${axis}. ${range(-L.coordMax, L.coordMax)}`;
      const move = (axis: 'x' | 'y', v: number): void => {
        session.setCorner(
          c.id,
          { x: axis === 'x' ? v : c.x, y: axis === 'y' ? v : c.y },
          { field: axis },
        );
      };
      const bounds = { min: -L.coordMax, max: L.coordMax };
      return [
        {
          name: 'x',
          label: 'X',
          value: c.x,
          ...bounds,
          hint: hint('left'),
          commit: (v) => move('x', v),
        },
        {
          name: 'y',
          label: 'Y',
          value: c.y,
          ...bounds,
          hint: hint('top'),
          commit: (v) => move('y', v),
        },
      ];
    }
    if (s?.kind === 'wall') {
      const w = s.wall;
      return [
        {
          name: 'length',
          label: 'Length',
          value: w.length,
          min: minWallLength(session.plan(), w.id),
          hint: '',
          commit: (v) => session.setLength(w.id, v, this.keep(), 'length'),
        },
      ];
    }
    if (s?.kind === 'opening') {
      return this.openingFields(s.opening, s.wall, info.height);
    }
    const lowest = Math.max(L.height.min, minPlanHeight(session.plan()));
    return [
      {
        name: 'height',
        label: 'Ceiling height',
        value: info.height,
        min: lowest,
        max: L.height.max,
        hint:
          lowest > L.height.min + 1e-9
            ? `Lowest possible: ${m2(lowest)} m. Doors and windows set it.`
            : range(L.height.min, L.height.max),
        commit: (v) => session.setHeight(v, 'height'),
      },
    ];
  });

  constructor() {
    // "Add door/window" opens the card and moves focus to the new item's first field.
    // Opening a list from the overflow menu moves focus to the list's heading.
    effect(() => {
      const target = this.session.focusRequest()?.target;
      if (target !== 'first-field' && target !== 'card') {
        return;
      }
      untracked(() => {
        if (target === 'first-field') {
          this.card.set('details');
        }
        afterNextRender(
          () =>
            this.host.nativeElement
              .querySelector<HTMLElement>(
                target === 'first-field' ? '[data-field="width"] input' : '[data-list-title]',
              )
              ?.focus(),
          { injector: this.injector },
        );
      });
    });
    // The card for a selected item closes when the selection clears.
    let hadSelection = false;
    effect(() => {
      const has = this.selected() !== null;
      untracked(() => {
        if (hadSelection && !has && this.card() === 'details') {
          this.card.set(null);
        }
        hadSelection = has;
      });
    });
  }

  private openingFields(o: PlanOpening, wall: WallInfo, height: number): Field[] {
    const session = this.session;
    const door = o.kind === 'door';
    const width = door ? L.door.width : L.window.width;
    const hMin = door ? L.door.heightMin : L.window.heightMin;
    const hMax = door ? doorMaxHeight(height) : windowMaxHeight(height);
    const set =
      (name: string, key: 'width' | 'height' | 'offset' | 'sill' | 'topGap') =>
      (v: number): void => {
        session.changeOpening(o.id, { [key]: v }, { field: name });
      };
    const fields: Field[] = [
      {
        name: 'width',
        label: 'Width',
        value: o.width,
        min: width.min,
        max: width.max,
        hint: range(width.min, width.max),
        commit: set('width', 'width'),
      },
      {
        name: 'oheight',
        label: 'Height',
        value: o.height,
        min: hMin,
        max: hMax,
        hint: range(hMin, hMax),
        commit: set('oheight', 'height'),
      },
      {
        name: 'position',
        label: 'Position',
        value: o.offset,
        hint: `from ${wall.from.name.toLowerCase()} to the ${o.kind}'s near edge`,
        commit: set('position', 'offset'),
      },
    ];
    if (!door) {
      const sillMax = windowMaxSill(height, o.height);
      const gapMax = height - o.height;
      fields.push(
        {
          name: 'sill',
          label: 'Height above floor',
          value: o.sill,
          min: 0,
          max: sillMax,
          fixed: o.anchor === 'floor',
          hint: range(0, sillMax),
          commit: set('sill', 'sill'),
        },
        {
          name: 'gap',
          label: 'Gap to ceiling',
          value: Math.max(0, height - o.sill - o.height),
          min: L.window.topGapMin,
          max: gapMax,
          fixed: o.anchor === 'ceiling',
          hint: range(L.window.topGapMin, gapMax),
          commit: set('gap', 'topGap'),
        },
      );
    }
    return fields;
  }

  protected err(name: string): string {
    const e = this.session.fieldError();
    return e?.field === name ? e.text : '';
  }

  // ---- list selection ---------------------------------------------------------------------

  protected pick(selection: Selection): void {
    this.card.set(null);
    this.session.select(selection);
    const info = this.info();
    const mid = (w: WallInfo | undefined) =>
      w && { x: (w.from.x + w.to.x) / 2, y: (w.from.y + w.to.y) / 2 };
    const point =
      selection.kind === 'corner'
        ? info?.corners.find((c) => c.id === selection.id)
        : selection.kind === 'wall'
          ? mid(info?.walls.find((w) => w.id === selection.id))
          : mid(info?.walls.find((w) => w.openings.some((o) => o.id === selection.id)));
    if (point) this.view.reveal(point);
  }

  protected keepName(wall: WallInfo, end: 'start' | 'end'): string {
    return `${(end === 'start' ? wall.from : wall.to).name} fixed`;
  }

  protected readonly ends = ['start', 'end'] as const;

  protected removeName(): string {
    const s = this.selected();
    return s?.kind === 'opening' ? s.opening.kind : 'corner';
  }

  protected remove(): void {
    const s = this.selected();
    if (s?.kind === 'corner') this.session.deleteCorner(s.corner.id);
    else if (s?.kind === 'opening') this.session.deleteOpening(s.opening.id);
  }

  protected setKeep(end: 'start' | 'end'): void {
    this.keep.set(end);
  }

  /** The action-bar chip: open the card on its first field, or close it and keep focus on the chip. */
  protected toggleCard(): void {
    if (this.card() === 'details') {
      this.card.set(null);
      return;
    }
    this.card.set('details');
    afterNextRender(
      () => {
        const input = this.host.nativeElement.querySelector<HTMLInputElement>(
          '.content app-number-field input',
        );
        input?.focus();
        input?.select();
      },
      { injector: this.injector },
    );
  }

  protected closeList(): void {
    this.card.set(null);
    afterNextRender(
      () => this.host.nativeElement.querySelector<HTMLElement>('[data-chip]')?.focus(),
      { injector: this.injector },
    );
  }

  protected startOver(): void {
    this.session.startOverWithUndo();
  }

  private openingName(o: PlanOpening): string {
    const same = this.session.plan().openings.filter((x) => x.kind === o.kind);
    return `${kindName(o)} ${same.findIndex((x) => x.id === o.id) + 1}`;
  }
}
