// Turns the plan into what the SVG draws (pure). Everything is in screen pixels, so sizes stay
// constant at any zoom. Sizes mirror the --plan-* tokens (docs/design/components/plan-editor.md);
// colours and stroke widths come from the tokens in the stylesheet.

import { PlanOpening, Vec2 } from '../plan/plan-model';
import { PlanInfo, WallInfo, cornerLabel, openingLabel, wallLabel } from './plan-info';
import { Size, toScreen, View } from './view-transform';

export const METRICS = {
  handle: 7,
  handleSelected: 9,
  /** Half of the 44 px hit area. */
  hit: 22,
  ghost: 9,
  jamb: 8,
  windowGap: 3,
  gripW: 28,
  gripH: 10,
  /** Label distance from the wall, toward the room (0.75rem). */
  labelOffset: 12,
  /** Walls shorter than this on screen only show "+" when selected. */
  plusMinLength: 88,
  badgeOffset: 28,
  charWidth: 7,
} as const;

export type ItemKind = 'corner' | 'wall' | 'opening';
export interface ItemRef {
  kind: ItemKind;
  id: string;
}

export interface TextVm {
  cls: string;
  x: number;
  y: number;
  rot: number;
  text: string;
}

export interface BadgeVm {
  x: number;
  y: number;
  w: number;
  text: string;
}

export interface WallVm {
  id: string;
  selected: boolean;
  hover: boolean;
  invalid: boolean;
  /** Wall path with gaps over its openings. */
  d: string;
  line: { x1: number; y1: number; x2: number; y2: number };
  label: TextVm | null;
  emphasised: boolean;
  plus: Vec2 | null;
  grip: { x: number; y: number; rot: number } | null;
  badge: BadgeVm | null;
  ariaLabel: string;
}

export interface OpeningVm {
  id: string;
  wallId: string;
  kind: 'door' | 'window';
  selected: boolean;
  hover: boolean;
  invalid: boolean;
  jambs: string;
  leaf: string;
  arc: string;
  glass: string;
  /** Places the local rect (0, -hit, width, 2 x hit) on the opening. */
  transform: string;
  width: number;
  distance: TextVm | null;
  ariaLabel: string;
}

export interface CornerVm {
  id: string;
  x: number;
  y: number;
  r: number;
  selected: boolean;
  hover: boolean;
  invalid: boolean;
  ariaLabel: string;
  badge: BadgeVm | null;
  angle: TextVm | null;
}

export interface CanvasModel {
  fill: string;
  walls: WallVm[];
  openings: OpeningVm[];
  corners: CornerVm[];
  /** Dimension labels, distances and angle readouts, drawn above the walls. */
  texts: TextVm[];
  /** Selection badges. */
  badges: BadgeVm[];
}

export interface ModelInput {
  info: PlanInfo;
  view: View;
  size: Size;
  selection: ItemRef | null;
  hover: ItemRef | null;
  invalidWalls: ReadonlySet<string>;
  drag: ItemRef | null;
}

const f = (n: number): string => n.toFixed(1);
const pt = (p: Vec2): string => `${f(p.x)} ${f(p.y)}`;
const unit = (a: Vec2, b: Vec2): Vec2 => {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
};
const at = (a: Vec2, u: Vec2, d: number): Vec2 => ({ x: a.x + u.x * d, y: a.y + u.y * d });

/** Text rotation that never reads upside down. */
function upright(u: Vec2): number {
  let deg = (Math.atan2(u.y, u.x) * 180) / Math.PI;
  if (deg > 90 || deg <= -90) deg += 180;
  return deg > 180 ? deg - 360 : deg;
}

const badgeOf = (text: string, at: Vec2): BadgeVm => ({
  x: at.x,
  y: at.y,
  w: text.length * 6.5 + 16,
  text,
});

export function buildCanvasModel(input: ModelInput): CanvasModel {
  const { info, view, size, selection, hover, invalidWalls, drag } = input;
  const scale = view.scale;
  const screen = new Map(info.corners.map((c) => [c.id, toScreen(view, size, c)]));
  const isSel = (kind: ItemKind, id: string): boolean =>
    selection?.kind === kind && selection.id === id;
  const isHover = (kind: ItemKind, id: string): boolean => hover?.kind === kind && hover.id === id;

  const touched = new Set<string>();
  if (drag?.kind === 'wall') touched.add(drag.id);
  if (drag?.kind === 'corner') {
    const i = info.corners.findIndex((c) => c.id === drag.id);
    const n = info.walls.length;
    if (i >= 0) {
      touched.add(info.walls[i].id);
      touched.add(info.walls[(i - 1 + n) % n].id);
    }
  }

  const walls: WallVm[] = [];
  const openings: OpeningVm[] = [];

  for (const wall of info.walls) {
    const a = screen.get(wall.from.id)!;
    const b = screen.get(wall.to.id)!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const u = unit(a, b);
    const inward = { x: -u.y, y: u.x };
    const selected = isSel('wall', wall.id);

    let d = '';
    let cursor = 0;
    for (const o of wall.openings) {
      const s0 = o.offset * scale;
      if (s0 > cursor + 0.5) d += `M${pt(at(a, u, cursor))}L${pt(at(a, u, s0))}`;
      cursor = (o.offset + o.width) * scale;
      openings.push(
        openingVm(o, wall, a, u, inward, scale, {
          selected: isSel('opening', o.id),
          hover: isHover('opening', o.id),
          invalid: invalidWalls.has(wall.id),
          dragging: drag?.kind === 'opening' && drag.id === o.id,
        }),
      );
    }
    if (len > cursor + 0.5) d += `M${pt(at(a, u, cursor))}L${pt(b)}`;

    const text = `${wall.length.toFixed(2)} m`;
    const textWidth = text.length * METRICS.charWidth + 8;
    const mid = at(a, u, len / 2);
    const showLabel = selected || touched.has(wall.id) || len >= textWidth;
    const gripFits = len >= METRICS.gripW + 2 * METRICS.handleSelected + 8;
    const plusShift = selected && gripFits ? METRICS.gripW / 2 + METRICS.ghost + 8 : 0;
    const plusVisible = selected ? len >= 2 * plusShift + 8 : len > METRICS.plusMinLength;

    walls.push({
      id: wall.id,
      selected,
      hover: isHover('wall', wall.id),
      invalid: invalidWalls.has(wall.id),
      d,
      line: { x1: a.x, y1: a.y, x2: b.x, y2: b.y },
      label: showLabel
        ? {
            cls: selected || touched.has(wall.id) ? 'dim emphasised' : 'dim',
            ...at(mid, inward, METRICS.labelOffset + (plusVisible ? METRICS.ghost + 6 : 0)),
            rot: upright(u),
            text,
          }
        : null,
      emphasised: selected || touched.has(wall.id),
      plus: plusVisible ? at(mid, u, plusShift) : null,
      grip: selected && gripFits ? { ...mid, rot: (Math.atan2(u.y, u.x) * 180) / Math.PI } : null,
      badge: selected ? badgeOf(wall.name, at(mid, inward, -METRICS.badgeOffset)) : null,
      ariaLabel: wallLabel(wall),
    });
  }

  const corners = info.corners.map((c, i): CornerVm => {
    const p = screen.get(c.id)!;
    const n = info.corners.length;
    const prev = screen.get(info.corners[(i - 1 + n) % n].id)!;
    const next = screen.get(info.corners[(i + 1) % n].id)!;
    const toPrev = unit(p, prev);
    const toNext = unit(p, next);
    let bis = { x: toPrev.x + toNext.x, y: toPrev.y + toNext.y };
    const len = Math.hypot(bis.x, bis.y);
    // Interior side of the corner (flipped at reflex corners, where the sum points outside).
    if (len < 1e-6) {
      bis = { x: -toNext.y, y: toNext.x };
    } else {
      const sign = c.angle < 180 ? 1 : -1;
      bis = { x: (bis.x / len) * sign, y: (bis.y / len) * sign };
    }
    const selected = isSel('corner', c.id);
    return {
      id: c.id,
      x: p.x,
      y: p.y,
      r: selected || drag?.id === c.id ? METRICS.handleSelected : METRICS.handle,
      selected,
      hover: isHover('corner', c.id),
      invalid: false,
      ariaLabel: cornerLabel(c),
      badge: selected ? badgeOf(c.name, at(p, bis, -METRICS.badgeOffset)) : null,
      angle:
        drag?.kind === 'corner' && drag.id === c.id
          ? {
              cls: 'angle',
              ...at(p, bis, METRICS.badgeOffset),
              rot: 0,
              text: `${Math.round(c.angle)}°`,
            }
          : null,
    };
  });

  return {
    fill: info.corners.map((c) => pt(screen.get(c.id)!)).join(' '),
    walls,
    openings,
    corners,
    texts: [
      ...walls.map((w) => w.label),
      ...openings.map((o) => o.distance),
      ...corners.map((c) => c.angle),
    ].filter((t): t is TextVm => t !== null),
    badges: [...walls.map((w) => w.badge), ...corners.map((c) => c.badge)].filter(
      (b): b is BadgeVm => b !== null,
    ),
  };
}

function openingVm(
  o: PlanOpening,
  wall: WallInfo,
  a: Vec2,
  u: Vec2,
  inward: Vec2,
  scale: number,
  state: { selected: boolean; hover: boolean; invalid: boolean; dragging: boolean },
): OpeningVm {
  const w = o.width * scale;
  const p0 = at(a, u, o.offset * scale);
  const p1 = at(a, u, (o.offset + o.width) * scale);
  const half = METRICS.jamb / 2;
  const tick = (p: Vec2): string => `M${pt(at(p, inward, -half))}L${pt(at(p, inward, half))}`;
  const isDoor = o.kind === 'door';

  let leaf = '';
  let arc = '';
  let glass = '';
  if (isDoor) {
    const tip = at(p0, inward, w);
    leaf = `M${pt(p0)}L${pt(tip)}`;
    const sweep = inward.x * u.y - inward.y * u.x > 0 ? 1 : 0;
    arc = `M${pt(tip)}A${f(w)} ${f(w)} 0 0 ${sweep} ${pt(p1)}`;
  } else {
    for (const side of [-METRICS.windowGap, 0, METRICS.windowGap]) {
      glass += `M${pt(at(p0, inward, side))}L${pt(at(p1, inward, side))}`;
    }
  }

  const near = Math.min(o.offset, wall.length - o.offset - o.width);
  const fromStart = o.offset <= wall.length - o.offset - o.width;
  const edge = fromStart ? at(a, u, 0) : at(a, u, wall.length * scale);
  const gapStart = fromStart ? edge : p1;
  const gapEnd = fromStart ? p0 : edge;
  const mid = { x: (gapStart.x + gapEnd.x) / 2, y: (gapStart.y + gapEnd.y) / 2 };

  return {
    id: o.id,
    wallId: wall.id,
    kind: o.kind,
    selected: state.selected,
    hover: state.hover,
    invalid: state.invalid,
    jambs: tick(p0) + tick(p1),
    leaf,
    arc,
    glass,
    transform: `translate(${pt(p0)}) rotate(${f((Math.atan2(u.y, u.x) * 180) / Math.PI)})`,
    width: w,
    distance: state.dragging
      ? {
          cls: 'dim emphasised',
          ...at(mid, inward, METRICS.labelOffset),
          rot: upright(u),
          text: `${near.toFixed(2)} m`,
        }
      : null,
    ariaLabel: openingLabel(o, wall),
  };
}
