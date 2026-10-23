import { inject, Injectable, signal } from '@angular/core';
import { Vec2 } from '../plan/plan-model';
import { EditorSession } from './editor-session';
import {
  boundsOf,
  ensureVisible,
  fitView,
  panBy,
  Size,
  toPlan,
  View,
  zoomAt,
} from './view-transform';

const BUTTON_ZOOM = 1.4;

/** Pan and zoom of the plan canvas, shared by the canvas, toolbar and panel. */
@Injectable()
export class EditorView {
  private readonly session = inject(EditorSession);
  readonly size = signal<Size>({ w: 800, h: 600 });
  readonly view = signal<View>({ cx: 0, cy: 0, scale: 100 });
  private sized = false;

  constructor() {
    this.fit();
  }

  /** The canvas was measured. The first real size fits the shape. */
  setSize(size: Size): void {
    if (size.w < 1 || size.h < 1) {
      return;
    }
    this.size.set(size);
    if (!this.sized) {
      this.sized = true;
      this.fit();
    } else {
      // The canvas changed size (panel opened, window resized): keep the selection in view.
      this.revealSelected();
    }
  }

  /** Pan so the selected corner, wall or opening is on screen. */
  revealSelected(): void {
    const s = this.session.selected();
    if (!s) {
      return;
    }
    const mid = (w: { from: Vec2; to: Vec2 }): Vec2 => ({
      x: (w.from.x + w.to.x) / 2,
      y: (w.from.y + w.to.y) / 2,
    });
    this.reveal(s.kind === 'corner' ? s.corner : mid(s.kind === 'wall' ? s.wall : s.wall));
  }

  fit(): void {
    const points = this.session.info()?.corners;
    if (points?.length) {
      this.view.set(fitView(boundsOf(points), this.size()));
    }
  }

  zoom(direction: 1 | -1, around?: Vec2): void {
    const size = this.size();
    const centre = around ?? { x: size.w / 2, y: size.h / 2 };
    this.view.update((v) => zoomAt(v, size, centre, direction > 0 ? BUTTON_ZOOM : 1 / BUTTON_ZOOM));
  }

  zoomBy(factor: number, around: Vec2): void {
    this.view.update((v) => zoomAt(v, this.size(), around, factor));
  }

  pan(dx: number, dy: number): void {
    this.view.update((v) => panBy(v, dx, dy));
  }

  /** Keep a plan point on screen (used when a list selects something). */
  reveal(p: Vec2): void {
    this.view.update((v) => ensureVisible(v, this.size(), p));
  }

  toPlanPoint(screen: Vec2): Vec2 {
    return toPlan(this.view(), this.size(), screen);
  }
}
