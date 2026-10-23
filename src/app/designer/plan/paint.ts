// Surface colouring contract (plan wall-colouring.md, W2-W4). Three-free, Angular-free.
//
// CONTRACT FILE. Frozen for parallel tracks: change only through the main session.
//
// Model: `Design.wallColor` / `ceilingColor` are the base colours. A wall, a door, the skirting
// and the doors as a group can override them (see `Design`). Custom-mode overrides live on the
// plan records (`PlanWall.color`, `PlanOpening.color`); simple-mode wall overrides live in
// `Design.simpleWallColors`. Every colour is a lowercase `#rrggbb`; ANY such value is valid,
// not only palette entries (the user can pick a custom colour).

import type { Design } from '../state/design-defaults';
import type { Plan } from './plan-model';
import type { RoomShape } from './room-shape';

/** A colourable thing, or a group of things. `walls` / `doors` mean "all of them". */
export type SurfaceRef =
  | { kind: 'walls' }
  | { kind: 'wall'; id: string }
  | { kind: 'doors' }
  | { kind: 'door'; id: string }
  | { kind: 'ceiling' }
  | { kind: 'skirting' };

/**
 * A single surface the scene can report from a tap (never a group). It is a `SurfaceRef`, so it
 * can be passed straight to `ColouringState.select`. Wall ids are `RoomShape.wallIds`; door ids
 * are `ShapeOpening.id`.
 */
export type SurfaceHit = Extract<SurfaceRef, { kind: 'wall' | 'door' | 'ceiling' | 'skirting' }>;

/** Fixed wall ids of the simple rectangle, index = outline edge (0 = the window wall). */
export const SIMPLE_WALL_IDS: readonly string[] = ['s0', 's1', 's2', 's3'];

/** Resolved colours, as the scene paints them. Keys are `RoomShape.wallIds` / opening ids. */
export interface SurfacePaint {
  /** The base wall colour (`Design.wallColor`); the fallback for a wall id that is not listed. */
  base: string;
  /** wall id -> hex */
  walls: Readonly<Record<string, string>>;
  /** wall id -> hex (already resolved: "match the wall" is filled in) */
  skirting: Readonly<Record<string, string>>;
  /** door opening id -> hex (leaf and casing; "auto" is filled in) */
  doors: Readonly<Record<string, string>>;
  ceiling: string;
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/**
 * Lowercase `#rrggbb`, or null for anything else (non-strings, `#fff`, `#12345g`, huge strings).
 * The length check comes first so hostile input is never run through the regex.
 */
export function normalizeHex(value: unknown): string | null {
  return typeof value === 'string' && value.length === 7 && HEX_COLOR.test(value)
    ? value.toLowerCase()
    : null;
}

function linear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Relative luminance (0 black .. 1 white) of a `#rrggbb`; invalid input counts as light. */
export function luminance(hex: string): number {
  const valid = normalizeHex(hex) ?? '#efe9df';
  const n = parseInt(valid.slice(1), 16);
  return (
    0.2126 * linear((n >> 16) & 255) + 0.7152 * linear((n >> 8) & 255) + 0.0722 * linear(n & 255)
  );
}

/**
 * The door colour on a wall of this colour: a wooden door on light walls, a white painted one on
 * dark walls. Same rule as the old `doorColor()` in `scene/materials.ts` (linear luminance > 0.35).
 */
export function autoDoorColor(wallHex: string): string {
  return luminance(wallHex) > 0.35 ? '#9a7049' : '#f2eee6';
}

/** The explicit colour override per wall id in the ACTIVE mode (absent = uses the base). */
function wallOverrides(
  design: Pick<Design, 'simpleWallColors' | 'plan'>,
  shape: RoomShape,
): Map<string, string> {
  const out = new Map<string, string>();
  shape.wallIds.forEach((id, i) => {
    const hex = SIMPLE_WALL_IDS.includes(id)
      ? design.simpleWallColors[i]
      : design.plan?.walls.find((w) => w.id === id)?.color;
    if (hex) {
      out.set(id, hex);
    }
  });
  return out;
}

/** Fill in every default: wall overrides, "skirting matches its wall", "door auto". */
export function resolvePaint(
  design: Pick<
    Design,
    'wallColor' | 'ceilingColor' | 'skirtingColor' | 'doorColor' | 'simpleWallColors' | 'plan'
  >,
  shape: RoomShape,
): SurfacePaint {
  const overrides = wallOverrides(design, shape);
  const walls: Record<string, string> = {};
  const skirting: Record<string, string> = {};
  for (const id of shape.wallIds) {
    walls[id] = overrides.get(id) ?? design.wallColor;
    skirting[id] = design.skirtingColor ?? walls[id];
  }
  const doors: Record<string, string> = {};
  for (const o of shape.openings) {
    if (o.kind !== 'door') {
      continue;
    }
    const own = design.plan?.openings.find((p) => p.id === o.id)?.color;
    const wallHex = walls[shape.wallIds[o.wall]] ?? design.wallColor;
    doors[o.id] = own ?? design.doorColor ?? autoDoorColor(wallHex);
  }
  return { base: design.wallColor, walls, skirting, doors, ceiling: design.ceilingColor };
}

function sameRecord(
  a: Readonly<Record<string, string>>,
  b: Readonly<Record<string, string>>,
): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
}

/** Structural equality, used to memoise the `paint` signal. */
export function paintsEqual(a: SurfacePaint, b: SurfacePaint): boolean {
  return (
    a.ceiling === b.ceiling &&
    a.base === b.base &&
    sameRecord(a.walls, b.walls) &&
    sameRecord(a.skirting, b.skirting) &&
    sameRecord(a.doors, b.doors)
  );
}

/** True when both refs point at the same surface or group. */
export function sameSurface(a: SurfaceRef | null, b: SurfaceRef | null): boolean {
  if (!a || !b) {
    return a === b;
  }
  if (a.kind !== b.kind) {
    return false;
  }
  return 'id' in a && 'id' in b ? a.id === b.id : true;
}

/**
 * Whether the ref still exists in this room. Groups need at least one member (`doors` needs a
 * door, so it is false in simple mode). Use it to clear a stale selection.
 */
export function surfaceExists(ref: SurfaceRef, shape: RoomShape): boolean {
  switch (ref.kind) {
    case 'wall':
      return shape.wallIds.includes(ref.id);
    case 'door':
      return shape.openings.some((o) => o.kind === 'door' && o.id === ref.id);
    case 'doors':
      return shape.openings.some((o) => o.kind === 'door');
    default:
      return true;
  }
}

/** True when some wall of the active mode has its own colour ("All walls" then needs a confirm). */
export function hasAccentWalls(
  design: Pick<Design, 'simpleWallColors' | 'plan'>,
  shape: RoomShape,
): boolean {
  return wallOverrides(design, shape).size > 0;
}

function editPlan(plan: Plan, change: (copy: Plan) => void): Plan {
  const copy = structuredClone(plan);
  change(copy);
  return copy;
}

function setOrClear(item: { color?: string }, hex: string | null): void {
  if (hex) {
    item.color = hex;
  } else {
    delete item.color;
  }
}

/**
 * Apply a colour to a surface and return the new design (the same object when nothing changes).
 * `value` is any `#rrggbb` (case-insensitive); `null` means "back to the default" for walls,
 * doors and skirting. Invalid hex, unknown ids and `null` for `walls` / `ceiling` change nothing.
 * `walls` and `doors` also clear the individual overrides of the active mode. Geometry is never
 * touched, so the plan is edited directly with no `validatePlan` run.
 */
export function applySurfaceColor(
  design: Design,
  shape: RoomShape,
  ref: SurfaceRef,
  value: string | null,
): Design {
  const hex = value === null ? null : normalizeHex(value);
  if (value !== null && hex === null) {
    return design;
  }
  const customPlan = design.mode === 'custom' ? design.plan : null;
  switch (ref.kind) {
    case 'ceiling':
      return hex ? { ...design, ceilingColor: hex } : design;
    case 'skirting':
      return { ...design, skirtingColor: hex };
    case 'walls':
      return hex
        ? {
            ...design,
            wallColor: hex,
            ...(customPlan
              ? { plan: editPlan(customPlan, (p) => p.walls.forEach((w) => setOrClear(w, null))) }
              : { simpleWallColors: design.simpleWallColors.map(() => null) }),
          }
        : design;
    case 'doors':
      return {
        ...design,
        doorColor: hex,
        plan: customPlan
          ? editPlan(customPlan, (p) => p.openings.forEach((o) => setOrClear(o, null)))
          : design.plan,
      };
    case 'wall': {
      const simple = SIMPLE_WALL_IDS.indexOf(ref.id);
      if (!shape.wallIds.includes(ref.id)) {
        return design;
      }
      // Picking the base colour stores no override, so `hasAccentWalls` stays correct.
      const own = hex === design.wallColor ? null : hex;
      if (simple >= 0) {
        const simpleWallColors = design.simpleWallColors.slice();
        simpleWallColors[simple] = own;
        return { ...design, simpleWallColors };
      }
      return customPlan?.walls.some((w) => w.id === ref.id)
        ? {
            ...design,
            plan: editPlan(customPlan, (p) =>
              setOrClear(p.walls.find((w) => w.id === ref.id) ?? {}, own),
            ),
          }
        : design;
    }
    case 'door':
      return customPlan?.openings.some((o) => o.id === ref.id && o.kind === 'door')
        ? {
            ...design,
            plan: editPlan(customPlan, (p) =>
              setOrClear(p.openings.find((o) => o.id === ref.id) ?? {}, hex),
            ),
          }
        : design;
  }
}

/** Strip every colour override from a plan (used by `reset()`); the same plan when it has none. */
export function stripPlanColors(plan: Plan): Plan {
  if (!plan.walls.some((w) => w.color) && !plan.openings.some((o) => o.color)) {
    return plan;
  }
  return editPlan(plan, (p) => {
    p.walls.forEach((w) => setOrClear(w, null));
    p.openings.forEach((o) => setOrClear(o, null));
  });
}
