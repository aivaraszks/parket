// Pointer and keyboard gestures of the plan canvas. Pure logic over the session and the view, so
// the canvas component only forwards events. Drags work from the plan at the start of the gesture
// (no drift), preview without touching history, and become ONE undo step on release.

import { DEFAULT_SNAP, moveVertex, moveWall, updateOpening } from '../plan/plan-edit';
import { PLAN_LIMITS as L, Plan, Vec2 } from '../plan/plan-model';
import { dot } from '../plan/polygon';
import { ItemKind, ItemRef } from './canvas-model';
import { EditorSession } from './editor-session';
import { EditorView } from './editor-view';
import { PlanInfo, WallInfo } from './plan-info';

const DRAG_START_PX = { touch: 8, mouse: 4 } as const;
const SNAP_TOLERANCE_PX = 8;
const KEY_STEP = 0.1;
const KEY_STEP_FINE = 0.01;
const PAN_FRACTION = 0.1;
const AXIS_THRESHOLD = 0.3;

const ARROWS: Record<string, Vec2> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

/** How far an opening may slide along its wall: [min, max] offset in metres. */
export function openingSlideRange(wall: WallInfo, openingId: string): [number, number] {
  const list = wall.openings;
  const i = list.findIndex((o) => o.id === openingId);
  const o = list[i];
  const prev = list[i - 1];
  const next = list[i + 1];
  const min = prev ? prev.offset + prev.width + L.openingGap : L.openingMargin;
  const max = (next ? next.offset - L.openingGap : wall.length - L.openingMargin) - o.width;
  return [min, Math.max(min, max)];
}

interface Press {
  kind: ItemKind | 'plus' | 'bg';
  id: string;
  startScreen: Vec2;
  last: Vec2;
  touch: boolean;
  moved: boolean;
  base?: Plan;
  info?: PlanInfo;
  startPlan?: Vec2;
  grab?: Vec2;
}

export class PlanGestures {
  private readonly pointers = new Map<number, Vec2>();
  private press: Press | null = null;
  private pinching = false;
  private pinch = { distance: 1, centre: { x: 0, y: 0 } };

  /** The item being dragged (drives labels, angle readout and snap guides). */
  dragging: ItemRef | null = null;
  onDragChange: (item: ItemRef | null) => void = () => undefined;

  constructor(
    private readonly session: EditorSession,
    private readonly view: EditorView,
  ) {}

  // ---- pointer --------------------------------------------------------------------------------

  down(id: number, screen: Vec2, hit: { kind: string; id: string } | null, touch: boolean): void {
    this.pointers.set(id, screen);
    if (this.pointers.size === 2) {
      this.abortPress();
      this.pinching = true;
      this.pinch = this.measurePinch();
      return;
    }
    if (this.pointers.size > 2) {
      return;
    }
    this.press = {
      kind: (hit?.kind as Press['kind']) ?? 'bg',
      id: hit?.id ?? '',
      startScreen: screen,
      last: screen,
      touch,
      moved: false,
    };
  }

  move(id: number, screen: Vec2, altKey: boolean): void {
    if (!this.pointers.has(id)) {
      return;
    }
    this.pointers.set(id, screen);
    if (this.pinching) {
      this.updatePinch();
      return;
    }
    const press = this.press;
    if (!press) {
      return;
    }
    if (!press.moved) {
      const threshold = press.touch ? DRAG_START_PX.touch : DRAG_START_PX.mouse;
      if (Math.hypot(screen.x - press.startScreen.x, screen.y - press.startScreen.y) < threshold) {
        return;
      }
      press.moved = true;
      this.startDrag(press);
    }
    this.drag(press, screen, altKey);
    press.last = screen;
  }

  up(id: number): void {
    const wasPinching = this.pinching;
    this.pointers.delete(id);
    if (wasPinching) {
      if (this.pointers.size < 2) this.pinching = false;
      this.press = null;
      return;
    }
    const press = this.press;
    this.press = null;
    if (!press) {
      return;
    }
    if (press.moved) {
      this.finishDrag(press);
    } else {
      this.tap(press);
    }
  }

  cancel(id: number): void {
    this.pointers.delete(id);
    this.pinching = this.pointers.size >= 2;
    this.abortPress();
  }

  wheel(screen: Vec2, deltaY: number): void {
    this.view.zoomBy(Math.exp(-deltaY * 0.0015), screen);
  }

  // ---- taps -----------------------------------------------------------------------------------

  private tap(press: Press): void {
    switch (press.kind) {
      case 'corner':
      case 'wall':
      case 'opening':
        this.session.select({ kind: press.kind, id: press.id });
        break;
      case 'plus':
        this.session.addCorner(press.id);
        break;
      default:
        this.session.select(null);
    }
  }

  // ---- drags ----------------------------------------------------------------------------------

  private startDrag(press: Press): void {
    if (press.kind === 'bg' || press.kind === 'plus') {
      press.kind = 'bg';
      return;
    }
    const base = this.session.plan();
    const info = this.session.info();
    if (!info) {
      press.kind = 'bg';
      return;
    }
    press.base = base;
    press.info = info;
    press.startPlan = this.view.toPlanPoint(press.startScreen);
    this.session.select({ kind: press.kind, id: press.id }, false);
    this.session.beginGesture();
    if (press.kind === 'corner') {
      const c = info.corners.find((x) => x.id === press.id);
      press.grab = c ? { x: c.x - press.startPlan.x, y: c.y - press.startPlan.y } : { x: 0, y: 0 };
    }
    this.dragging = { kind: press.kind, id: press.id };
    this.onDragChange(this.dragging);
  }

  private drag(press: Press, screen: Vec2, altKey: boolean): void {
    if (press.kind === 'bg') {
      this.view.pan(screen.x - press.last.x, screen.y - press.last.y);
      return;
    }
    const { base, info, startPlan } = press;
    if (!base || !info || !startPlan) {
      return;
    }
    const here = this.view.toPlanPoint(screen);
    const on = this.session.snap() !== altKey;
    const snap = {
      ...DEFAULT_SNAP,
      grid: on,
      angle: on,
      tolerance: SNAP_TOLERANCE_PX / this.view.view().scale,
    };

    let result;
    if (press.kind === 'corner') {
      const grab = press.grab ?? { x: 0, y: 0 };
      result = moveVertex(base, press.id, { x: here.x + grab.x, y: here.y + grab.y }, snap);
    } else if (press.kind === 'wall') {
      const wall = info.walls.find((w) => w.id === press.id)!;
      const n = outward(wall);
      result = moveWall(
        base,
        press.id,
        dot({ x: here.x - startPlan.x, y: here.y - startPlan.y }, n),
        snap,
      );
    } else {
      const wall = info.walls.find((w) => w.openings.some((o) => o.id === press.id))!;
      const opening = wall.openings.find((o) => o.id === press.id)!;
      const u = alongWall(wall);
      const delta = dot({ x: here.x - startPlan.x, y: here.y - startPlan.y }, u);
      const [min, max] = openingSlideRange(wall, press.id);
      const offset = Math.round(Math.min(max, Math.max(min, opening.offset + delta)) * 100) / 100;
      result = updateOpening(base, press.id, { offset });
    }
    if (result.ok) {
      this.session.previewGesture(result.plan);
    } else {
      this.session.rejectGesture(result.errors, screen);
    }
  }

  private finishDrag(press: Press): void {
    if (press.kind === 'bg') {
      return;
    }
    const info = press.info;
    const name =
      press.kind === 'corner'
        ? `moved ${info?.corners.find((c) => c.id === press.id)?.name.toLowerCase()}`
        : press.kind === 'wall'
          ? `moved ${info?.walls.find((w) => w.id === press.id)?.name.toLowerCase()}`
          : `changed ${info?.walls.flatMap((w) => w.openings).find((o) => o.id === press.id)?.kind}`;
    this.session.endGesture(name);
    this.dragging = null;
    this.onDragChange(null);
  }

  private abortPress(): void {
    const press = this.press;
    this.press = null;
    if (press?.moved && press.kind !== 'bg' && press.base) {
      this.session.cancelGesture();
      this.dragging = null;
      this.onDragChange(null);
    }
  }

  // ---- pinch ----------------------------------------------------------------------------------

  private measurePinch(): { distance: number; centre: Vec2 } {
    const [a, b] = [...this.pointers.values()];
    return {
      distance: Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1),
      centre: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    };
  }

  private updatePinch(): void {
    if (this.pointers.size < 2) {
      return;
    }
    const next = this.measurePinch();
    this.view.pan(next.centre.x - this.pinch.centre.x, next.centre.y - this.pinch.centre.y);
    this.view.zoomBy(next.distance / this.pinch.distance, next.centre);
    this.pinch = next;
  }

  // ---- keyboard -------------------------------------------------------------------------------

  /** A key on a canvas item. Returns true when handled (the caller prevents the default). */
  itemKey(key: string, shift: boolean, item: ItemRef): boolean {
    const info = this.session.info();
    if (!info) {
      return false;
    }
    if (key === 'Enter' || key === ' ') {
      this.session.select(item);
      return true;
    }
    if ((key === 'Delete' || key === 'Backspace') && item.kind !== 'wall') {
      this.session.select(item, false);
      if (item.kind === 'corner') this.session.deleteCorner(item.id);
      else this.session.deleteOpening(item.id);
      return true;
    }
    const arrow = ARROWS[key];
    if (!arrow) {
      return false;
    }
    const step = shift ? KEY_STEP_FINE : KEY_STEP;
    const coalesceKey = `nudge:${item.id}`;
    if (item.kind === 'corner') {
      const c = info.corners.find((x) => x.id === item.id);
      if (c) {
        this.session.setCorner(
          item.id,
          { x: c.x + arrow.x * step, y: c.y + arrow.y * step },
          { coalesceKey },
        );
      }
    } else if (item.kind === 'wall') {
      const wall = info.walls.find((w) => w.id === item.id);
      const along = wall ? dot(arrow, outward(wall)) : 0;
      if (wall && Math.abs(along) > AXIS_THRESHOLD) {
        this.session.shiftWall(item.id, Math.sign(along) * step, { coalesceKey });
      }
    } else {
      const wall = info.walls.find((w) => w.openings.some((o) => o.id === item.id));
      const opening = wall?.openings.find((o) => o.id === item.id);
      const along = wall ? dot(arrow, alongWall(wall)) : 0;
      if (wall && opening && Math.abs(along) > AXIS_THRESHOLD) {
        const [min, max] = openingSlideRange(wall, item.id);
        const offset = Math.round((opening.offset + Math.sign(along) * step) * 1000) / 1000;
        this.session.changeOpening(
          item.id,
          { offset: Math.min(max, Math.max(min, offset)) },
          { coalesceKey },
        );
      }
    }
    return true;
  }

  /** A key on the plan itself: pan with the arrows, zoom with + - and fit with 0. */
  planKey(key: string): boolean {
    const size = this.view.size();
    const arrow = ARROWS[key];
    if (arrow) {
      // Moving the view in the arrow's direction moves the content the other way.
      this.view.pan(-arrow.x * size.w * PAN_FRACTION, -arrow.y * size.h * PAN_FRACTION);
      return true;
    }
    if (key === '+' || key === '=') this.view.zoom(1);
    else if (key === '-' || key === '_') this.view.zoom(-1);
    else if (key === '0') this.view.fit();
    else return false;
    return true;
  }
}

function alongWall(wall: WallInfo): Vec2 {
  const dx = wall.to.x - wall.from.x;
  const dy = wall.to.y - wall.from.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

function outward(wall: WallInfo): Vec2 {
  const u = alongWall(wall);
  return { x: u.y, y: -u.x };
}
