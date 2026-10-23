import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  linkedSignal,
  untracked,
} from '@angular/core';
import { minPlanHeight, minWallLength } from '../plan/plan-edit';
import {
  doorMaxHeight,
  PLAN_LIMITS as L,
  PlanOpening,
  windowMaxHeight,
  windowMaxSill,
} from '../plan/plan-model';
import { formatArea } from '../ui/format';
import { Toasts } from '../ui/toasts';
import { EditorSession, Selection } from './editor-session';
import { EditorView } from './editor-view';
import { NumberField } from './number-field';
import { kindName, openingsSummary, WallInfo } from './plan-info';

const UNDO_TOAST_MS = 8000;

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

/** Details and forms for the selection, the Room form and the Walls and Corners lists. */
@Component({
  selector: 'app-plan-panel',
  imports: [NumberField],
  templateUrl: './plan-panel.html',
  styleUrl: './plan-panel.scss',
  host: { '[class.expanded]': 'expanded()' },
})
export class PlanPanel {
  protected readonly session = inject(EditorSession);
  private readonly view = inject(EditorView);
  private readonly toasts = inject(Toasts);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  protected readonly expanded = this.session.panelExpanded;
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

  private toastId: number | null = null;

  constructor() {
    // The Start over toast belongs to this editor: it goes when the editor closes.
    inject(DestroyRef).onDestroy(() => {
      if (this.toastId !== null) this.toasts.dismiss(this.toastId);
    });
    // "Add door/window" moves focus to the new item's first field, even from the collapsed panel.
    effect(() => {
      if (this.session.focusRequest()?.target !== 'first-field') {
        return;
      }
      untracked(() => {
        this.expanded.set(true);
        afterNextRender(
          () =>
            this.host.nativeElement
              .querySelector<HTMLElement>('[data-field="width"] input')
              ?.focus(),
          { injector: this.injector },
        );
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

  /** Open the form and keep focus on its title (the button that was pressed is hidden now). */
  protected openDetails(): void {
    this.expanded.set(true);
    this.session.say('Details open');
    afterNextRender(
      () => this.host.nativeElement.querySelector<HTMLElement>('#plan-form-title')?.focus(),
      { injector: this.injector },
    );
  }

  protected startOver(): void {
    this.session.startOver();
    const session = this.session;
    this.toastId = this.toasts.show('Started over.', {
      durationMs: UNDO_TOAST_MS,
      action: { label: 'Undo', run: () => session.undo() },
      // Another edit, or closing the editor, makes this Undo unsafe: drop the offer.
      keepWhile: () => !session.closed() && session.lastLabel() === 'started over',
    });
  }
}
