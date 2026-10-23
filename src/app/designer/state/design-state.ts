import { computed, DestroyRef, inject, Service, signal } from '@angular/core';
import { estimate } from '../calc/calculator';
import { minPlanHeight, rectangleToPlan, setPlanHeight } from '../plan/plan-edit';
import { Plan } from '../plan/plan-model';
import { COMPACT_ID_AT, compactIds, sanitizePlan } from '../plan/plan-sanitize';
import { validatePlan } from '../plan/plan-validate';
import { roomShapesEqual, shapeArea, shapeSkirtingLength, toRoomShape } from '../plan/room-shape';
import {
  clampToLimit,
  DEFAULT_DESIGN,
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
  Plank,
  RoomMode,
  STORAGE_KEY,
  STORAGE_KEY_V1,
  Sun,
} from './design-defaults';
import { isSpeciesId } from './species';

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneDefaults(): Design {
  return structuredClone(DEFAULT_DESIGN) as Design;
}

/** Clamp plank and planks per block to their limits and to the length >= 2 x block width rule. */
function sanitizePlank(
  length: unknown,
  width: unknown,
  planksPerBlock: unknown,
): { plank: Plank; planksPerBlock: number } {
  return fitPlank(
    {
      length: clampToLimit(length, LIMITS.plankLength, DEFAULT_DESIGN.plank.length),
      width: clampToLimit(width, LIMITS.plankWidth, DEFAULT_DESIGN.plank.width),
    },
    clampToLimit(planksPerBlock, LIMITS.planksPerBlock, DEFAULT_DESIGN.planksPerBlock),
  );
}

/** Turn unknown (stored) data into a valid design; every bad field falls back to its default. */
export function sanitizeDesign(raw: unknown): Design {
  const d = cloneDefaults();
  if (!isRecord(raw)) {
    return d;
  }
  const room = isRecord(raw['room']) ? raw['room'] : {};
  const plank = isRecord(raw['plank']) ? raw['plank'] : {};
  const sun = isRecord(raw['sun']) ? raw['sun'] : {};
  // Designs saved before multi-strip herringbone have no planksPerBlock: it defaults to 1.
  const fitted = sanitizePlank(plank['length'], plank['width'], raw['planksPerBlock']);
  // A custom mode needs a plan that survives the sanitiser; otherwise fall back to simple.
  const plan = sanitizePlan(raw['plan']);
  return {
    mode: raw['mode'] === 'custom' && plan ? 'custom' : 'simple',
    plan,
    room: {
      length: clampToLimit(room['length'], LIMITS.roomLength, d.room.length),
      width: clampToLimit(room['width'], LIMITS.roomWidth, d.room.width),
      height: clampToLimit(room['height'], LIMITS.roomHeight, d.room.height),
    },
    wallColor:
      typeof raw['wallColor'] === 'string' && HEX_COLOR.test(raw['wallColor'])
        ? raw['wallColor'].toLowerCase()
        : d.wallColor,
    ceilingColor:
      typeof raw['ceilingColor'] === 'string' && HEX_COLOR.test(raw['ceilingColor'])
        ? raw['ceilingColor'].toLowerCase()
        : d.ceilingColor,
    species: isSpeciesId(raw['species']) ? raw['species'] : d.species,
    plank: fitted.plank,
    planksPerBlock: fitted.planksPerBlock,
    pattern: PATTERNS.includes(raw['pattern'] as PatternId)
      ? (raw['pattern'] as PatternId)
      : d.pattern,
    angle: clampToLimit(raw['angle'], LIMITS.angle, d.angle),
    finish: FINISHES.includes(raw['finish'] as Finish) ? (raw['finish'] as Finish) : d.finish,
    sun: {
      on: typeof sun['on'] === 'boolean' ? sun['on'] : d.sun.on,
      azimuth: clampToLimit(sun['azimuth'], LIMITS.sunAzimuth, d.sun.azimuth),
      elevation: clampToLimit(sun['elevation'], LIMITS.sunElevation, d.sun.elevation),
      intensity: clampToLimit(sun['intensity'], LIMITS.sunIntensity, d.sun.intensity),
    },
    wastePercent: clampToLimit(raw['wastePercent'], LIMITS.wastePercent, d.wastePercent),
  };
}

function getStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function readStored(key: string): Design | null {
  try {
    const text = getStorage()?.getItem(key);
    return text ? sanitizeDesign(JSON.parse(text)) : null;
  } catch {
    return null;
  }
}

/** v2, then v1 (simple mode, no plan), then defaults. */
function loadDesign(): Design {
  const v2 = readStored(STORAGE_KEY);
  if (v2) {
    return v2;
  }
  const v1 = readStored(STORAGE_KEY_V1);
  return v1 ? { ...v1, mode: 'simple', plan: null } : cloneDefaults();
}

@Service()
export class DesignState {
  private readonly design = signal<Design>(loadDesign());
  private readonly undoBuffer = signal<Design | null>(null);
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
  readonly startingPlan = computed(() => rectangleToPlan(this.design().room));
  /** Lowest ceiling the custom plan allows (keeps every door and window intact); null in simple mode. */
  readonly minRoomHeight = computed(() => {
    const d = this.design();
    return d.mode === 'custom' && d.plan ? minPlanHeight(d.plan) : LIMITS.roomHeight.min;
  });
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

  constructor() {
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
      plan: mode === 'custom' && !d.plan ? rectangleToPlan(d.room) : d.plan,
    }));
  }

  /** Commit an edited plan (once per finished gesture). Invalid plans are ignored. */
  setPlan(plan: Plan): void {
    if (validatePlan(plan).length === 0) {
      const copy = structuredClone(plan);
      this.update((d) => ({ ...d, plan: copy.nextId > COMPACT_ID_AT ? compactIds(copy) : copy }));
    }
  }

  setWallColor(value: string): void {
    if (HEX_COLOR.test(value)) {
      this.update((d) => ({ ...d, wallColor: value.toLowerCase() }));
    }
  }

  setCeilingColor(value: string): void {
    if (HEX_COLOR.test(value)) {
      this.update((d) => ({ ...d, ceilingColor: value.toLowerCase() }));
    }
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
   * Back to defaults, but the custom plan is kept (the editor has its own "Start over"). The mode
   * returns to simple. The previous design is kept for `undo()` until `dismissUndo()` or the next reset.
   */
  reset(): void {
    this.undoBuffer.set(this.design());
    this.design.set({ ...cloneDefaults(), plan: this.design().plan });
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

  /** Write to storage now, cancelling any pending debounced write. */
  flush(): void {
    clearTimeout(this.persistTimer);
    this.persistTimer = undefined;
    try {
      getStorage()?.setItem(STORAGE_KEY, JSON.stringify(this.design()));
    } catch {
      // Storage full, blocked or unavailable (private mode): the design simply is not remembered.
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
    clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => this.flush(), PERSIST_DEBOUNCE_MS);
  }
}
