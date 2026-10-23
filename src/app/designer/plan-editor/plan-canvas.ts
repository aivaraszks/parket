import {
  Component,
  computed,
  ElementRef,
  inject,
  OnDestroy,
  signal,
  viewChild,
} from '@angular/core';
import {
  buildCanvasModel,
  CanvasModel,
  CornerVm,
  ItemRef,
  METRICS,
  OpeningVm,
  WallVm,
} from './canvas-model';
import { EditorSession } from './editor-session';
import { EditorView } from './editor-view';
import { PointerHint } from './pointer-hint';
import { PlanGestures } from './pointer-gestures';
import { gridPath, gridVisibility, toScreen } from './view-transform';
import { formatArea } from '../ui/format';

type TabItem =
  | { key: string; kind: 'corner'; vm: CornerVm }
  | { key: string; kind: 'wall'; vm: WallVm }
  | { key: string; kind: 'opening'; vm: OpeningVm };

const EMPTY_MODEL: CanvasModel = {
  fill: '',
  walls: [],
  openings: [],
  corners: [],
  texts: [],
  badges: [],
};
const ZOOM_KEYS = ['+', '=', '-', '_', '0'];
let nextId = 0;

/** The SVG plan: draws the shape and turns pointer and keyboard input into edits. */
@Component({
  selector: 'app-plan-canvas',
  templateUrl: './plan-canvas.html',
  styleUrl: './plan-canvas.scss',
})
export class PlanCanvas implements OnDestroy {
  protected readonly session = inject(EditorSession);
  protected readonly editorView = inject(EditorView);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly svg = viewChild.required<ElementRef<SVGSVGElement>>('svg');

  protected readonly metrics = METRICS;
  protected readonly hintId = `plan-hint-${nextId++}`;
  protected readonly hint = new PointerHint();
  protected readonly size = this.editorView.size;
  private readonly hover = signal<ItemRef | null>(null);
  protected readonly drag = signal<ItemRef | null>(null);
  private readonly gestures = new PlanGestures(this.session, this.editorView);
  private readonly observer: ResizeObserver | undefined;

  protected readonly model = computed(() => {
    const info = this.session.info();
    if (!info) {
      return EMPTY_MODEL;
    }
    return buildCanvasModel({
      info,
      view: this.editorView.view(),
      size: this.size(),
      selection: this.session.selection(),
      hover: this.hover(),
      invalidWalls: new Set(this.session.invalid()?.wallIds ?? []),
      drag: this.drag(),
    });
  });

  /** Tab order: corner 1, wall 1 and its openings, corner 2, ... */
  protected readonly tabItems = computed<TabItem[]>(() => {
    const { corners, walls, openings } = this.model();
    return corners.flatMap((corner, i): TabItem[] => [
      { key: corner.id, kind: 'corner', vm: corner },
      { key: walls[i].id, kind: 'wall', vm: walls[i] },
      ...openings
        .filter((o) => o.wallId === walls[i].id)
        .map((vm): TabItem => ({ key: vm.id, kind: 'opening', vm })),
    ]);
  });

  protected readonly grid = computed(() => {
    const view = this.editorView.view();
    const visible = gridVisibility(view.scale);
    const size = this.size();
    return {
      minor: visible.minor ? gridPath(view, size, 0.1, 10) : '',
      major: visible.major ? gridPath(view, size, 1) : '',
    };
  });

  protected readonly planLabel = computed(() => {
    const info = this.session.info();
    return info
      ? `Room plan, ${info.corners.length} corners, ${info.area.toFixed(2)} square metres`
      : 'Room plan';
  });
  protected readonly status = computed(() => {
    const info = this.session.info();
    return info ? `${formatArea(info.area)} m² · ${info.walls.length} walls` : '';
  });

  /** While a corner is dragged with Snap on: guides to corners it lines up with. */
  protected readonly guides = computed(() => {
    const drag = this.drag();
    const info = this.session.info();
    if (drag?.kind !== 'corner' || !info || !this.session.snap()) {
      return null;
    }
    const me = info.corners.find((c) => c.id === drag.id);
    if (!me) {
      return null;
    }
    const view = this.editorView.view();
    const size = this.size();
    const p = toScreen(view, size, me);
    const others = info.corners.filter((c) => c.id !== me.id);
    return {
      point: p,
      x: others.some((c) => Math.abs(c.x - me.x) < 1e-6) ? p.x : null,
      y: others.some((c) => Math.abs(c.y - me.y) < 1e-6) ? p.y : null,
    };
  });

  protected readonly invalidGhost = computed(() => {
    const invalid = this.session.invalid();
    const drag = this.drag();
    const corner = this.model().corners.find((c) => c.id === drag?.id);
    return invalid && drag?.kind === 'corner' && corner
      ? { pointer: invalid.pointer, corner }
      : invalid
        ? { pointer: invalid.pointer, corner: null }
        : null;
  });

  constructor() {
    this.gestures.onDragChange = (item) => this.drag.set(item);
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(() => this.measure());
      this.observer.observe(this.host.nativeElement);
    }
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  private measure(): void {
    const rect = this.host.nativeElement.getBoundingClientRect();
    this.editorView.setSize({ w: rect.width, h: rect.height });
  }

  private local(event: { clientX: number; clientY: number }): { x: number; y: number } {
    const rect = this.svg().nativeElement.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  private itemOf(target: EventTarget | null): ItemRef | null {
    const el = (target as Element | null)?.closest?.('[data-kind]') as HTMLElement | null;
    const kind = el?.dataset['kind'];
    const id = el?.dataset['id'];
    return kind && id ? { kind: kind as ItemRef['kind'], id } : null;
  }

  protected onPointerDown(event: PointerEvent): void {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }
    try {
      this.svg().nativeElement.setPointerCapture?.(event.pointerId);
    } catch {
      // The pointer is already gone; the gesture just ends.
    }
    this.gestures.down(
      event.pointerId,
      this.local(event),
      this.itemOf(event.target),
      event.pointerType !== 'mouse',
    );
  }

  protected onPointerMove(event: PointerEvent): void {
    this.gestures.move(event.pointerId, this.local(event), event.altKey);
    if (event.pointerType === 'mouse' && !this.drag()) {
      const item = this.itemOf(event.target);
      const current = this.hover();
      if (item?.id !== current?.id || item?.kind !== current?.kind) {
        this.hover.set(item);
      }
    }
  }

  protected onPointerUp(event: PointerEvent): void {
    this.gestures.up(event.pointerId);
    this.drag.set(this.gestures.dragging);
  }

  protected onPointerCancel(event: PointerEvent): void {
    this.gestures.cancel(event.pointerId);
    this.drag.set(this.gestures.dragging);
  }

  protected onWheel(event: WheelEvent): void {
    event.preventDefault();
    this.gestures.wheel(this.local(event), event.deltaY);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    const item = this.itemOf(event.target);
    let handled = item
      ? this.gestures.itemKey(event.key, event.shiftKey, item)
      : event.target === this.svg().nativeElement && this.gestures.planKey(event.key);
    // Zoom and fit work anywhere in the plan, also while a corner, wall or opening has focus.
    if (!handled && item && ZOOM_KEYS.includes(event.key)) {
      handled = this.gestures.planKey(event.key);
    }
    if (handled) {
      event.preventDefault();
    }
  }

  protected onFocusIn(event: FocusEvent): void {
    const item = this.itemOf(event.target);
    const current = this.session.selection();
    if (item && (item.kind !== current?.kind || item.id !== current.id)) {
      this.session.select(item, false);
    }
    if (item) {
      this.editorView.revealSelected();
    }
  }

  protected dismissHint(): void {
    this.session.dismissHint();
    // The Close button is gone now: keep focus in the plan.
    this.svg().nativeElement.focus();
  }

  protected openingKey(item: TabItem): string {
    return item.key;
  }
}
