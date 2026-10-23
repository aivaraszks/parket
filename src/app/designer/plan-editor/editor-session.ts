import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import {
  addOpening,
  deleteVertex,
  insertVertex,
  moveVertex,
  moveWall,
  NO_SNAP,
  removeOpening,
  setPlanHeight,
  setWallLength,
  updateOpening,
} from '../plan/plan-edit';
import {
  EditResult,
  OpeningKind,
  OpeningPatch,
  Plan,
  PlanError,
  PlanOpening,
  Vec2,
} from '../plan/plan-model';
import { DesignState } from '../state/design-state';
import { errorMessage } from './error-copy';
import { hintSeen, markHintSeen } from './hint-seen';
import { CornerInfo, cornerLabel, kindName, openingLabel, planInfo, WallInfo } from './plan-info';

export type Selection = { kind: 'corner' | 'wall' | 'opening'; id: string };

export type Selected =
  | { kind: 'corner'; corner: CornerInfo }
  | { kind: 'wall'; wall: WallInfo }
  | { kind: 'opening'; opening: PlanOpening; wall: WallInfo };

interface Entry {
  plan: Plan;
  label: string;
}

interface CommitOptions {
  /** Edits with the same key in quick succession (arrow key repeats) share one undo step. */
  coalesceKey?: string;
  /** Overrides the live-region text. */
  announce?: string;
  /** Show a failure under this field instead of in the chip. */
  field?: string;
}

const HISTORY_LIMIT = 50;
const CHIP_MS = 4000;
const COALESCE_MS = 1000;

const capitalise = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
const m2 = (n: number): string => n.toFixed(2);

/**
 * The editor's working state: the plan being edited, selection, its own undo/redo history, the
 * reason chip and the live-region text. Provided by the editor component (one per editor).
 *
 * The plan is committed to `DesignState` once per finished gesture (a drag's pointer up, a
 * committed field, a button), never per pointer move.
 */
@Injectable()
export class EditorSession {
  private readonly state = inject(DesignState);
  private chipTimer: ReturnType<typeof setTimeout> | undefined;
  private base: Plan | null = null;
  private lastCoalesce: { key: string; at: number } | null = null;

  readonly plan = signal<Plan>(this.state.plan() ?? this.state.startingPlan());
  readonly info = computed(() => planInfo(this.plan()));
  readonly selection = signal<Selection | null>(null);
  readonly snap = signal(true);
  /** Phone: whether the bottom panel is open to its taller stop. */
  readonly panelExpanded = signal(false);
  /** Persistent live-region text. */
  readonly message = signal('');
  /** The refusal reason shown in the chip (4 s). */
  readonly chip = signal<string | null>(null);
  /** During a refused drag: the walls that broke a rule and where the pointer is. */
  readonly invalid = signal<{ wallIds: string[]; pointer: Vec2 } | null>(null);
  readonly fieldError = signal<{ field: string; text: string } | null>(null);
  /** Set when the editor closes; late callbacks (toast Undo) must not touch the state then. */
  readonly closed = signal(false);
  readonly hintVisible = signal(!hintSeen());
  readonly focusRequest = signal<{ target: 'plan' | 'first-field'; n: number } | null>(null);

  private readonly undoStack = signal<Entry[]>([]);
  private readonly redoStack = signal<Entry[]>([]);
  readonly canUndo = computed(() => this.undoStack().length > 0);
  readonly canRedo = computed(() => this.redoStack().length > 0);
  /** Label of the newest undo step (the toast checks it before offering Undo). */
  readonly lastLabel = computed(() => this.undoStack().at(-1)?.label ?? null);

  /** The selected thing, or null when nothing is selected or it no longer exists. */
  readonly selected = computed<Selected | null>(() => {
    const sel = this.selection();
    const info = this.info();
    if (!sel || !info) {
      return null;
    }
    if (sel.kind === 'corner') {
      const corner = info.corners.find((c) => c.id === sel.id);
      return corner ? { kind: 'corner', corner } : null;
    }
    if (sel.kind === 'wall') {
      const wall = info.walls.find((w) => w.id === sel.id);
      return wall ? { kind: 'wall', wall } : null;
    }
    const wall = info.walls.find((w) => w.openings.some((o) => o.id === sel.id));
    const opening = wall?.openings.find((o) => o.id === sel.id);
    return wall && opening ? { kind: 'opening', opening, wall } : null;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.closed.set(true);
      clearTimeout(this.chipTimer);
    });
  }

  // ---- selection and announcements ----------------------------------------------------------

  select(selection: Selection | null, announce = true): void {
    this.selection.set(selection);
    this.fieldError.set(null);
    const selected = this.selected();
    if (announce && selected) {
      this.say(`${this.describe(selected)} selected`);
    }
  }

  describe(selected: Selected): string {
    switch (selected.kind) {
      case 'corner':
        return cornerLabel(selected.corner);
      case 'wall':
        return `${selected.wall.name}, ${m2(selected.wall.length)} metres`;
      default:
        return openingLabel(selected.opening, selected.wall);
    }
  }

  say(text: string): void {
    // A repeated sentence is not re-announced unless the text changes.
    this.message.set(this.message() === text ? `${text} ` : text);
  }

  requestFocus(target: 'plan' | 'first-field'): void {
    this.focusRequest.set({ target, n: (this.focusRequest()?.n ?? 0) + 1 });
  }

  dismissHint(): void {
    if (this.hintVisible()) {
      this.hintVisible.set(false);
      markHintSeen();
    }
  }

  // ---- chip ---------------------------------------------------------------------------------

  showChip(text: string): void {
    this.chip.set(text);
    clearTimeout(this.chipTimer);
    this.chipTimer = setTimeout(() => this.chip.set(null), CHIP_MS);
  }

  clearChip(): void {
    clearTimeout(this.chipTimer);
    this.chip.set(null);
    this.invalid.set(null);
  }

  // ---- gestures (drags): preview, then one history step ---------------------------------------

  beginGesture(): void {
    this.base = this.plan();
  }

  get gestureActive(): boolean {
    return this.base !== null;
  }

  /** Show a valid in-progress plan (no history, no storage write). */
  previewGesture(plan: Plan): void {
    this.plan.set(plan);
    this.clearChip();
  }

  /** The drag was refused: keep the last valid plan and explain. */
  rejectGesture(errors: PlanError[], pointer: Vec2): void {
    this.showChip(errorMessage(errors[0]));
    this.invalid.set({
      wallIds: errors.map((e) => e.wallId).filter((id): id is string => !!id),
      pointer,
    });
  }

  endGesture(label: string): void {
    const base = this.base;
    this.base = null;
    this.invalid.set(null);
    if (base && this.plan() !== base) {
      this.record(base, this.plan(), label);
    }
  }

  cancelGesture(): void {
    if (this.base) {
      this.plan.set(this.base);
    }
    this.base = null;
    this.clearChip();
  }

  // ---- commits and history --------------------------------------------------------------------

  /** Apply the result of an edit operation. Returns whether it was accepted. */
  apply(label: string, result: EditResult, options: CommitOptions = {}): boolean {
    if (result.ok) {
      this.fieldError.set(null);
      this.clearChip();
      this.record(this.plan(), result.plan, label, options);
      return true;
    }
    const text = errorMessage(result.errors[0]);
    if (options.field) {
      this.fieldError.set({ field: options.field, text });
      this.say(text);
    } else {
      this.showChip(text);
    }
    return false;
  }

  private record(prev: Plan, next: Plan, label: string, options: CommitOptions = {}): void {
    const now = Date.now();
    const key = options.coalesceKey;
    const merge =
      key !== undefined &&
      this.lastCoalesce?.key === key &&
      now - this.lastCoalesce.at < COALESCE_MS &&
      this.undoStack().length > 0;
    if (!merge) {
      this.undoStack.update((stack) => [...stack, { plan: prev, label }].slice(-HISTORY_LIMIT));
    }
    this.lastCoalesce = key === undefined ? null : { key, at: now };
    this.redoStack.set([]);
    this.plan.set(next);
    this.state.setPlan(next);
    this.dismissHint();
    this.say(options.announce ?? this.sentence(label, prev, next));
  }

  private sentence(label: string, prev: Plan, next: Plan): string {
    const text = `${capitalise(label)}.${label === 'started over' ? ' Undo restores the old shape.' : ''}`;
    if (prev.walls.length === next.walls.length && label !== 'started over') {
      return text;
    }
    return `${text} ${this.summary(next)}`;
  }

  summary(plan: Plan = this.plan()): string {
    const info = planInfo(plan);
    return info ? `${info.corners.length} corners, ${m2(info.area)} square metres` : '';
  }

  undo(): void {
    if (this.closed()) return;
    const entry = this.undoStack().at(-1);
    if (!entry) return;
    this.undoStack.update((stack) => stack.slice(0, -1));
    this.redoStack.update((stack) => [...stack, { plan: this.plan(), label: entry.label }]);
    this.restore(entry.plan, `Undone: ${entry.label}.`);
  }

  redo(): void {
    if (this.closed()) return;
    const entry = this.redoStack().at(-1);
    if (!entry) return;
    this.redoStack.update((stack) => stack.slice(0, -1));
    this.undoStack.update((stack) => [...stack, { plan: this.plan(), label: entry.label }]);
    this.restore(entry.plan, `Redone: ${entry.label}.`);
  }

  private restore(plan: Plan, sentence: string): void {
    this.lastCoalesce = null;
    this.clearChip();
    this.fieldError.set(null);
    this.plan.set(plan);
    this.state.setPlan(plan);
    this.say(`${sentence} ${this.summary()}`);
  }

  // ---- edit actions (shared by the canvas and the panel) --------------------------------------

  /** Move a corner by a typed value or key press (never snapped). */
  setCorner(id: string, pos: Vec2, options: CommitOptions = {}): boolean {
    const name =
      this.info()
        ?.corners.find((c) => c.id === id)
        ?.name.toLowerCase() ?? 'corner';
    return this.apply(`moved ${name}`, moveVertex(this.plan(), id, pos, NO_SNAP), options);
  }

  /** Push (+) or pull (-) a wall across itself. */
  shiftWall(id: string, distance: number, options: CommitOptions = {}): boolean {
    const name =
      this.info()
        ?.walls.find((w) => w.id === id)
        ?.name.toLowerCase() ?? 'wall';
    return this.apply(`moved ${name}`, moveWall(this.plan(), id, distance, NO_SNAP), options);
  }

  setLength(id: string, length: number, keep: 'start' | 'end', field?: string): boolean {
    return this.apply('changed wall length', setWallLength(this.plan(), id, length, keep), {
      field,
    });
  }

  addCorner(wallId: string): void {
    const wall = this.info()?.walls.find((w) => w.id === wallId);
    if (!wall) return;
    const id = `v${this.plan().nextId}`;
    if (this.apply('added corner', insertVertex(this.plan(), wallId, this.insertAt(wall)))) {
      this.select({ kind: 'corner', id }, false);
    }
  }

  /** The wall's middle, or the middle of its longest free stretch when a door or window is there. */
  private insertAt(wall: WallInfo): number {
    const mid = wall.length / 2;
    if (!wall.openings.some((o) => o.offset <= mid && mid <= o.offset + o.width)) {
      return mid;
    }
    let best: [number, number] = [0, 0];
    let start = 0;
    for (const o of [...wall.openings, { offset: wall.length, width: 0 }]) {
      if (o.offset - start > best[1] - best[0]) best = [start, o.offset];
      start = o.offset + o.width;
    }
    return (best[0] + best[1]) / 2;
  }

  deleteCorner(id: string): boolean {
    const ok = this.apply('deleted corner', deleteVertex(this.plan(), id));
    if (ok) {
      this.selection.set(null);
      this.requestFocus('plan');
    }
    return ok;
  }

  addOpeningTo(wallId: string, kind: OpeningKind): void {
    const id = `o${this.plan().nextId}`;
    if (this.apply(`added ${kind}`, addOpening(this.plan(), wallId, kind))) {
      this.select({ kind: 'opening', id }, false);
      this.requestFocus('first-field');
    }
  }

  changeOpening(id: string, patch: OpeningPatch, options: CommitOptions = {}): boolean {
    const opening = this.plan().openings.find((o) => o.id === id);
    const label = `changed ${opening ? kindName(opening).toLowerCase() : 'opening'}`;
    return this.apply(label, updateOpening(this.plan(), id, patch), options);
  }

  deleteOpening(id: string): void {
    const opening = this.plan().openings.find((o) => o.id === id);
    if (!opening) return;
    this.record(this.plan(), removeOpening(this.plan(), id), `removed ${opening.kind}`);
    this.selection.set(null);
    this.requestFocus('plan');
  }

  setHeight(height: number, field?: string): boolean {
    return this.apply('changed ceiling height', setPlanHeight(this.plan(), height), { field });
  }

  /** Replace the shape with the simple rectangle. Undoable. */
  startOver(): void {
    this.selection.set(null);
    this.record(this.plan(), this.state.startingPlan(), 'started over');
  }
}
