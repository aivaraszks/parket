import { computed, DestroyRef, inject, Service, signal } from '@angular/core';
import { estimate } from '../calc/calculator';
import { minPlanHeight, rectangleToPlan, setPlanHeight } from '../plan/plan-edit';
import {
  applySurfaceColor,
  hasAccentWalls,
  paintsEqual,
  resolvePaint,
  stripPlanColors,
  SurfaceRef,
} from '../plan/paint';
import { Plan } from '../plan/plan-model';
import { COMPACT_ID_AT, compactIds } from '../plan/plan-sanitize';
import { validatePlan } from '../plan/plan-validate';
import { roomShapesEqual, shapeArea, shapeSkirtingLength, toRoomShape } from '../plan/room-shape';
import { Toasts } from '../ui/toasts';
import {
  clampToLimit,
  Design,
  Finish,
  FINISHES,
  fitPlank,
  LIMITS,
  maxPlankWidth,
  minPlankLength,
  PatternId,
  PATTERNS,
  PERSIST_DEBOUNCE_MS,
  RoomMode,
  Sun,
} from './design-defaults';
import { cloneDefaults } from './design-sanitize';
import { ProjectIndex } from './project-index';
import { isSpeciesId } from './species';

export { sanitizeDesign } from './design-sanitize';

export const STORAGE_FULL_MESSAGE = 'Storage is full. Delete a project to keep saving.';
export const NOT_SAVED_MESSAGE = "Projects can't be saved in this browser.";

@Service()
export class DesignState {
  private readonly index = inject(ProjectIndex);
  private readonly toasts = inject(Toasts);
  private readonly design = signal<Design>(this.index.initialDesign);
  private readonly undoBuffer = signal<Design | null>(null);
  /** True from an edit until the next successful write. Hiding the tab alone never bumps `updatedAt`. */
  private dirty = false;
  private persistTimer: ReturnType<typeof setTimeout> | undefined;

  /** Active mode. */
  readonly mode = computed<RoomMode>(() => this.design().mode);
  /** The custom plan (null until the first switch to custom); kept while in simple mode. */
  readonly plan = computed(() => this.design().plan);
  /**
   * The active room as the scene sees it (plan C11), structurally memoised.
   * Track B/C should read this instead of `room`.
   */
  readonly roomShape = computed(() => toRoomShape(this.design()), { equal: roomShapesEqual });
  /** Ceiling height of the active mode. */
  readonly roomHeight = computed(() => this.roomShape().height);
  /** The SIMPLE rectangle (length, width, height) regardless of mode. */
  readonly simpleRoom = computed(() => this.design().room);
  /** The simple rectangle (with its window) as a plan: where the editor starts and "Start over" returns to. */
  readonly startingPlan = computed(() =>
    rectangleToPlan(this.design().room, this.design().simpleWallColors),
  );
  /** Lowest ceiling the custom plan allows (keeps every door and window intact); null in simple mode. */
  readonly minRoomHeight = computed(() => {
    const d = this.design();
    return d.mode === 'custom' && d.plan ? minPlanHeight(d.plan) : LIMITS.roomHeight.min;
  });
  /**
   * Resolved colours of every wall, the skirting and the doors, memoised so a colour change never
   * touches `roomShape`. Feed it to `FloorSceneApi.setPaint`.
   */
  readonly paint = computed(() => resolvePaint(this.design(), this.roomShape()), {
    equal: paintsEqual,
  });
  /** True when some wall of the active mode has its own colour: "All walls" then needs a confirm. */
  readonly hasAccentWalls = computed(() => hasAccentWalls(this.design(), this.roomShape()));
  readonly skirtingColor = computed(() => this.design().skirtingColor);
  readonly doorColor = computed(() => this.design().doorColor);
  readonly wallColor = computed(() => this.design().wallColor);
  readonly ceilingColor = computed(() => this.design().ceilingColor);
  readonly species = computed(() => this.design().species);
  readonly plank = computed(() => this.design().plank);
  readonly planksPerBlock = computed(() => this.design().planksPerBlock);
  readonly pattern = computed(() => this.design().pattern);
  readonly angle = computed(() => this.design().angle);
  readonly finish = computed(() => this.design().finish);
  readonly sun = computed(() => this.design().sun);
  readonly wastePercent = computed(() => this.design().wastePercent);

  /** Skirting length in metres: perimeter minus doors (plan C14). */
  readonly skirtingLength = computed(() => shapeSkirtingLength(this.roomShape()));
  readonly estimate = computed(() =>
    estimate(shapeArea(this.roomShape()), this.plank(), this.wastePercent(), this.skirtingLength()),
  );
  readonly floorArea = computed(() => this.estimate().floorArea);
  readonly plankArea = computed(() => this.estimate().plankArea);
  readonly planksNet = computed(() => this.estimate().planksNet);
  readonly areaWithWaste = computed(() => this.estimate().areaWithWaste);
  readonly planksWithWaste = computed(() => this.estimate().planksWithWaste);

  /** Changes whenever the floor layout must be rebuilt (room size, plank, pattern, angle). */
  readonly placementsKey = computed(() => {
    const outline = this.roomShape().outline.map((p) => `${p.x},${p.y}`);
    const plank = this.plank();
    return [
      outline.join(';'),
      plank.length,
      plank.width,
      this.planksPerBlock(),
      this.pattern(),
      this.angle(),
    ].join('|');
  });

  readonly canUndo = computed(() => this.undoBuffer() !== null);

  private readonly _activeId = signal(this.index.activeId());
  /** Id of the project being edited. */
  readonly activeId = this._activeId.asReadonly();

  constructor() {
    if (!this.index.persisted()) {
      this.toasts.show(NOT_SAVED_MESSAGE, { kind: 'error' });
    }
    // The debounced write may not have run when the tab is closed or backgrounded.
    const doc = globalThis.document;
    const onHide = (): void => this.flush();
    const onVisibility = (): void => {
      if (doc.visibilityState === 'hidden') {
        this.flush();
      }
    };
    globalThis.addEventListener?.('pagehide', onHide);
    doc?.addEventListener('visibilitychange', onVisibility);
    inject(DestroyRef).onDestroy(() => {
      globalThis.removeEventListener?.('pagehide', onHide);
      doc?.removeEventListener('visibilitychange', onVisibility);
      clearTimeout(this.persistTimer);
    });
  }

  /** Minimum plank length and maximum plank width right now, for dynamic UI ranges. */
  readonly plankLengthMin = computed(() =>
    minPlankLength(this.plank().width, this.planksPerBlock()),
  );
  readonly plankWidthMax = computed(() =>
    maxPlankWidth(this.plank().length, this.planksPerBlock()),
  );

  setRoomLength(value: number): void {
    this.update((d) => ({
      ...d,
      room: { ...d.room, length: clampToLimit(value, LIMITS.roomLength, d.room.length) },
    }));
  }

  setRoomWidth(value: number): void {
    this.update((d) => ({
      ...d,
      room: { ...d.room, width: clampToLimit(value, LIMITS.roomWidth, d.room.width) },
    }));
  }

  /**
   * Ceiling height of the ACTIVE mode, clamped to the limits. In custom mode a ceiling lower than
   * `minRoomHeight()` is refused (nothing changes); windows keep their anchored gap.
   */
  setRoomHeight(value: number): void {
    const d = this.design();
    if (d.mode === 'custom' && d.plan) {
      const current = d.plan.rooms[0].height;
      const result = setPlanHeight(d.plan, clampToLimit(value, LIMITS.roomHeight, current));
      if (result.ok && result.plan.rooms[0].height !== current) {
        this.update((x) => ({ ...x, plan: result.plan }));
      }
      return;
    }
    const height = clampToLimit(value, LIMITS.roomHeight, d.room.height);
    if (height !== d.room.height) {
      this.update((x) => ({ ...x, room: { ...x.room, height } }));
    }
  }

  /**
   * Switch between the simple rectangle and the custom shape. The first switch to custom copies
   * the rectangle (with its window) into a plan; later switches only flip the mode.
   */
  setMode(mode: RoomMode): void {
    if (mode !== 'simple' && mode !== 'custom') {
      return;
    }
    this.update((d) => ({
      ...d,
      mode,
      plan: mode === 'custom' && !d.plan ? rectangleToPlan(d.room, d.simpleWallColors) : d.plan,
    }));
  }

  /** Commit an edited plan (once per finished gesture). Invalid plans are ignored. */
  setPlan(plan: Plan): void {
    if (validatePlan(plan).length === 0) {
      const copy = structuredClone(plan);
      this.update((d) => ({ ...d, plan: copy.nextId > COMPACT_ID_AT ? compactIds(copy) : copy }));
    }
  }

  /**
   * The single entry point for colours. `hex` is any `#rrggbb` (palette or custom); `null` means
   * back to the default (walls, doors, skirting; ignored for the ceiling and for `walls`).
   * `walls` also clears every wall override of the active mode, `doors` every door override.
   * Unknown ids and invalid hex change nothing.
   */
  setSurfaceColor(ref: SurfaceRef, hex: string | null): void {
    const next = applySurfaceColor(this.design(), this.roomShape(), ref, hex);
    if (next !== this.design()) {
      this.update(() => next);
    }
  }

  /** Several colour changes in order, as one update (one persist, one undo step for callers). */
  setSurfaceColors(changes: readonly { ref: SurfaceRef; hex: string | null }[]): void {
    const shape = this.roomShape();
    const next = changes.reduce(
      (design, change) => applySurfaceColor(design, shape, change.ref, change.hex),
      this.design(),
    );
    if (next !== this.design()) {
      this.update(() => next);
    }
  }

  setWallColor(value: string): void {
    this.setSurfaceColor({ kind: 'walls' }, value);
  }

  setCeilingColor(value: string): void {
    this.setSurfaceColor({ kind: 'ceiling' }, value);
  }

  setSpecies(id: string): void {
    if (isSpeciesId(id)) {
      this.update((d) => ({ ...d, species: id }));
    }
  }

  /** Clamps to the limits and to length >= 2 x block width. The width is left as is. */
  setPlankLength(value: number): void {
    this.update((d) => {
      const min = minPlankLength(d.plank.width, d.planksPerBlock);
      const length = Math.max(min, clampToLimit(value, LIMITS.plankLength, d.plank.length));
      return { ...d, plank: { ...d.plank, length } };
    });
  }

  /** Clamps to the limits and to block width <= length / 2. The length is left as is. */
  setPlankWidth(value: number): void {
    this.update((d) => {
      const max = maxPlankWidth(d.plank.length, d.planksPerBlock);
      const width = Math.min(max, clampToLimit(value, LIMITS.plankWidth, d.plank.width));
      return { ...d, plank: { ...d.plank, width } };
    });
  }

  /**
   * Clamps to 1-10. If the plank no longer fits the length >= 2 x block width rule, the width
   * shrinks (min 40 mm), then the length grows, then planks per block is reduced.
   */
  setPlanksPerBlock(value: number): void {
    this.update((d) => {
      const n = clampToLimit(value, LIMITS.planksPerBlock, d.planksPerBlock);
      const fitted = fitPlank(d.plank, n);
      return { ...d, plank: fitted.plank, planksPerBlock: fitted.planksPerBlock };
    });
  }

  setPattern(value: PatternId): void {
    if (PATTERNS.includes(value)) {
      this.update((d) => ({ ...d, pattern: value }));
    }
  }

  setAngle(value: number): void {
    this.update((d) => ({ ...d, angle: clampToLimit(value, LIMITS.angle, d.angle) }));
  }

  setFinish(value: Finish): void {
    if (FINISHES.includes(value)) {
      this.update((d) => ({ ...d, finish: value }));
    }
  }

  setSun(patch: Partial<Sun>): void {
    this.update((d) => ({
      ...d,
      sun: {
        on: typeof patch.on === 'boolean' ? patch.on : d.sun.on,
        azimuth: clampToLimit(patch.azimuth ?? d.sun.azimuth, LIMITS.sunAzimuth, d.sun.azimuth),
        elevation: clampToLimit(
          patch.elevation ?? d.sun.elevation,
          LIMITS.sunElevation,
          d.sun.elevation,
        ),
        intensity: clampToLimit(
          patch.intensity ?? d.sun.intensity,
          LIMITS.sunIntensity,
          d.sun.intensity,
        ),
      },
    }));
  }

  setWastePercent(value: number): void {
    this.update((d) => ({
      ...d,
      wastePercent: clampToLimit(value, LIMITS.wastePercent, d.wastePercent),
    }));
  }

  /**
   * Back to defaults, but the custom plan is kept (minus its colour overrides) (the editor has its own "Start over"). The mode
   * returns to simple. The previous design is kept for `undo()` until `dismissUndo()` or the next reset.
   */
  reset(): void {
    this.undoBuffer.set(this.design());
    const plan = this.design().plan;
    this.design.set({ ...cloneDefaults(), plan: plan && stripPlanColors(plan) });
    this.schedulePersist();
  }

  undo(): void {
    const previous = this.undoBuffer();
    if (previous) {
      this.design.set(previous);
      this.undoBuffer.set(null);
      this.schedulePersist();
    }
  }

  /** Drop the undo buffer (toast timed out or was dismissed). */
  dismissUndo(): void {
    this.undoBuffer.set(null);
  }

  /**
   * Switch to another project: flushes the current one, replaces the design, clears the reset
   * undo buffer and sets the active id. Every project switch goes through here (plan P4).
   * The caller passes an already sanitised design. With `flush: false` the pending edits are
   * dropped instead of written (the project they belong to is being deleted).
   */
  open(id: string, design: Design, options: { readonly flush?: boolean } = {}): void {
    if (options.flush ?? true) {
      this.flush();
    } else {
      clearTimeout(this.persistTimer);
      this.persistTimer = undefined;
    }
    this.design.set(design);
    this.undoBuffer.set(null);
    this.dirty = false;
    this._activeId.set(id);
  }

  /** True while edits have not reached storage (a write failed or is still pending). */
  hasUnsaved(): boolean {
    return this.dirty;
  }

  /** A copy of the current design (for duplicating or deleting the active project). */
  snapshot(): Design {
    return structuredClone(this.design());
  }

  /**
   * Write the active project now, cancelling any pending debounced write, and bump its
   * `updatedAt` (once per flush). Does nothing when nothing changed since the last write.
   * A failed write keeps the design in memory and shows one error toast until a write succeeds.
   */
  flush(): void {
    clearTimeout(this.persistTimer);
    this.persistTimer = undefined;
    if (!this.dirty) {
      return;
    }
    const wasFailing = this.index.saveError();
    const result = this.index.writeDesign(this._activeId(), this.design());
    if (result.ok) {
      this.dirty = false;
      this.index.touch(this._activeId(), Date.now());
    } else if (!wasFailing) {
      this.toasts.show(STORAGE_FULL_MESSAGE, { kind: 'error' });
    }
  }

  private update(change: (design: Design) => Design): void {
    const next = change(this.design());
    this.design.set(next);
    // A manual edit makes the pre-reset snapshot stale.
    this.undoBuffer.set(null);
    this.schedulePersist();
  }

  private schedulePersist(): void {
    this.dirty = true;
    clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => this.flush(), PERSIST_DEBOUNCE_MS);
  }
}
