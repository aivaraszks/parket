// Pan and zoom maths for the plan canvas (pure). The canvas draws in screen pixels, so lines,
// handles and labels keep their size at any zoom; only geometry follows the view.

import type { Vec2 } from '../plan/plan-model';

/** Which plan point is at the canvas centre, and how many pixels one metre is. */
export interface View {
  cx: number;
  cy: number;
  scale: number;
}

export interface Size {
  w: number;
  h: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Visible width limits in metres. The plan says 0.5 to 20; the maximum is larger here so a
 * 20 m room still fits on a narrow phone with its padding.
 */
export const ZOOM_WIDTH = { min: 0.5, max: 40 } as const;
/** Space kept free around the shape when fitting (keeps handles off the screen edge). */
export const FIT_PADDING = 40;
/** Grid pitch (px) below which the minor / major lines are switched off. */
export const MINOR_GRID_MIN_PX = 8;
export const MAJOR_GRID_MIN_PX = 16;

export function toScreen(view: View, size: Size, p: Vec2): Vec2 {
  return {
    x: size.w / 2 + (p.x - view.cx) * view.scale,
    y: size.h / 2 + (p.y - view.cy) * view.scale,
  };
}

export function toPlan(view: View, size: Size, s: Vec2): Vec2 {
  return {
    x: view.cx + (s.x - size.w / 2) / view.scale,
    y: view.cy + (s.y - size.h / 2) / view.scale,
  };
}

export function clampScale(scale: number, size: Size): number {
  const width = Math.max(size.w, 1);
  return Math.min(width / ZOOM_WIDTH.min, Math.max(width / ZOOM_WIDTH.max, scale));
}

/** Zoom by `factor` keeping the plan point under `screenPoint` where it is. */
export function zoomAt(view: View, size: Size, screenPoint: Vec2, factor: number): View {
  const scale = clampScale(view.scale * factor, size);
  const anchor = toPlan(view, size, screenPoint);
  return {
    scale,
    cx: anchor.x - (screenPoint.x - size.w / 2) / scale,
    cy: anchor.y - (screenPoint.y - size.h / 2) / scale,
  };
}

/** Move the view by a pixel delta (content follows the finger). */
export function panBy(view: View, dx: number, dy: number): View {
  return { ...view, cx: view.cx - dx / view.scale, cy: view.cy - dy / view.scale };
}

/** A view that shows `bounds` completely, centred, with `padding` pixels around it. */
export function fitView(bounds: Bounds, size: Size, padding = FIT_PADDING): View {
  const w = Math.max(bounds.maxX - bounds.minX, 0.01);
  const h = Math.max(bounds.maxY - bounds.minY, 0.01);
  const availW = Math.max(size.w - 2 * padding, 1);
  const availH = Math.max(size.h - 2 * padding, 1);
  return {
    cx: (bounds.minX + bounds.maxX) / 2,
    cy: (bounds.minY + bounds.maxY) / 2,
    scale: clampScale(Math.min(availW / w, availH / h), size),
  };
}

/** Pan as little as needed so `p` is at least `margin` pixels inside the canvas. */
export function ensureVisible(view: View, size: Size, p: Vec2, margin = FIT_PADDING): View {
  const s = toScreen(view, size, p);
  const lo = Math.min(margin, size.w / 2);
  const dx = s.x < lo ? lo - s.x : s.x > size.w - lo ? size.w - lo - s.x : 0;
  const loY = Math.min(margin, size.h / 2);
  const dy = s.y < loY ? loY - s.y : s.y > size.h - loY ? size.h - loY - s.y : 0;
  return dx === 0 && dy === 0 ? view : panBy(view, dx, dy);
}

export function boundsOf(points: readonly Vec2[]): Bounds {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

/** Which grid lines to draw at this zoom (on or off, never faded). */
export function gridVisibility(scale: number): { minor: boolean; major: boolean } {
  return { minor: scale * 0.1 >= MINOR_GRID_MIN_PX, major: scale >= MAJOR_GRID_MIN_PX };
}

/** SVG path data for grid lines every `step` metres, anchored at plan (0, 0). */
export function gridPath(view: View, size: Size, step: number, skipEvery = 0): string {
  const topLeft = toPlan(view, size, { x: 0, y: 0 });
  const bottomRight = toPlan(view, size, { x: size.w, y: size.h });
  const parts: string[] = [];
  const first = (v: number): number => Math.ceil(v / step - 1e-9);
  const last = (v: number): number => Math.floor(v / step + 1e-9);
  for (let i = first(topLeft.x); i <= last(bottomRight.x); i++) {
    if (skipEvery && i % skipEvery === 0) continue;
    const x = Math.round(size.w / 2 + (i * step - view.cx) * view.scale) + 0.5;
    parts.push(`M${x} 0V${size.h}`);
  }
  for (let j = first(topLeft.y); j <= last(bottomRight.y); j++) {
    if (skipEvery && j % skipEvery === 0) continue;
    const y = Math.round(size.h / 2 + (j * step - view.cy) * view.scale) + 0.5;
    parts.push(`M0 ${y}H${size.w}`);
  }
  return parts.join('');
}
