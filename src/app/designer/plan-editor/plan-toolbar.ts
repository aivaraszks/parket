import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  Component,
  ElementRef,
  inject,
  Injector,
  output,
  signal,
} from '@angular/core';
import { EditorSession } from './editor-session';
import { EditorView } from './editor-view';

/**
 * Top bar (Done, title, Undo, Redo, Snap) and the view tools (Fit, Zoom). On a phone the tools sit
 * in the canvas corner (CSS grid placement), Zoom is hidden on touch, and Snap, the Walls and
 * Corners lists and Start over move into the "More tools" menu. The DOM order is the tab order:
 * the title comes first (it gets the initial focus), then Done.
 */
@Component({
  selector: 'app-plan-toolbar',
  template: `
    <div class="bar">
      <h2 class="title" id="plan-editor-title" tabindex="-1" data-title>Room shape</h2>
      <button type="button" class="btn primary" data-action="done" (click)="done.emit()">
        Done
      </button>
      <button
        type="button"
        class="btn tool"
        data-action="undo"
        title="Undo"
        aria-label="Undo"
        [disabled]="!session.canUndo()"
        (click)="session.undo()"
      >
        <svg class="icon" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M6 3L2.5 6.5 6 10M3 6.5h6a4 4 0 010 8H6" />
        </svg>
        <span class="text">Undo</span>
      </button>
      <button
        type="button"
        class="btn tool"
        data-action="redo"
        title="Redo"
        aria-label="Redo"
        [disabled]="!session.canRedo()"
        (click)="session.redo()"
      >
        <svg class="icon" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M10 3l3.5 3.5L10 10M13 6.5H7a4 4 0 000 8h3" />
        </svg>
        <span class="text">Redo</span>
      </button>
      <label class="switch">
        <input
          type="checkbox"
          role="switch"
          aria-describedby="plan-snap-help"
          [checked]="session.snap()"
          (change)="session.snap.set($any($event.target).checked)"
        />
        <span class="track" aria-hidden="true"><span class="knob"></span></span>
        <span class="switch-label">Snap</span>
      </label>
      <span id="plan-snap-help" class="visually-hidden"
        >Snaps to a 10 cm grid and 90° corners.</span
      >
      <button
        type="button"
        class="btn tool icon-only more"
        data-action="more"
        aria-label="More tools"
        title="More tools"
        aria-haspopup="menu"
        aria-controls="plan-menu"
        [attr.aria-expanded]="menuOpen()"
        (click)="toggleMenu()"
      >
        <svg class="icon" viewBox="0 0 16 16" aria-hidden="true">
          <circle class="dot" cx="3" cy="8" r="1.1" />
          <circle class="dot" cx="8" cy="8" r="1.1" />
          <circle class="dot" cx="13" cy="8" r="1.1" />
        </svg>
      </button>
      @if (menuOpen()) {
        <div
          id="plan-menu"
          class="menu menu-surface"
          role="menu"
          aria-label="More tools"
          (keydown)="onMenuKey($event)"
        >
          <button
            type="button"
            class="menu-item item"
            role="menuitemcheckbox"
            data-item="snap"
            [attr.aria-checked]="session.snap()"
            (click)="toggleSnap()"
          >
            <span>Snap</span>
            <small>{{ session.snap() ? 'On' : 'Off' }}</small>
          </button>
          <button
            type="button"
            class="menu-item item"
            role="menuitem"
            data-item="walls"
            (click)="openList('walls')"
          >
            Walls…
          </button>
          <button
            type="button"
            class="menu-item item"
            role="menuitem"
            data-item="corners"
            (click)="openList('corners')"
          >
            Corners…
          </button>
          <button
            type="button"
            class="menu-item item"
            role="menuitem"
            data-item="start-over"
            (click)="startOver()"
          >
            <span>Start over</span>
            <small>Replaces this shape with your simple rectangle.</small>
          </button>
        </div>
      }
    </div>
    <div class="tools" role="group" aria-label="View tools">
      <button
        type="button"
        class="btn tool"
        data-action="fit"
        title="Fit"
        aria-label="Fit"
        (click)="view.fit()"
      >
        <svg class="icon" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" />
        </svg>
        <span class="text">Fit</span>
      </button>
      <button
        type="button"
        class="btn tool icon-only zoom"
        data-action="zoom-out"
        aria-label="Zoom out"
        title="Zoom out"
        (click)="view.zoom(-1)"
      >
        <svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10" /></svg>
      </button>
      <button
        type="button"
        class="btn tool icon-only zoom"
        data-action="zoom-in"
        aria-label="Zoom in"
        title="Zoom in"
        (click)="view.zoom(1)"
      >
        <svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10M8 3v10" /></svg>
      </button>
    </div>
  `,
  styleUrl: './plan-toolbar.scss',
  host: {
    '(document:pointerdown)': 'onOutsidePointer($event)',
  },
})
export class PlanToolbar {
  protected readonly session = inject(EditorSession);
  protected readonly view = inject(EditorView);
  readonly done = output<void>();

  private readonly document = inject(DOCUMENT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  protected readonly menuOpen = signal(false);

  protected toggleMenu(): void {
    if (this.menuOpen()) {
      this.closeMenu(true);
      return;
    }
    this.menuOpen.set(true);
    afterNextRender(() => this.items()[0]?.focus(), { injector: this.injector });
  }

  protected closeMenu(restoreFocus: boolean): void {
    this.menuOpen.set(false);
    if (restoreFocus) {
      this.query('[data-action=more]')?.focus();
    }
  }

  protected toggleSnap(): void {
    const on = !this.session.snap();
    this.session.snap.set(on);
    this.session.say(on ? 'Snap on' : 'Snap off');
    this.closeMenu(true);
  }

  protected openList(list: 'walls' | 'corners'): void {
    this.closeMenu(false);
    this.session.card.set(list);
    this.session.requestFocus('card');
  }

  protected startOver(): void {
    this.closeMenu(true);
    this.session.startOverWithUndo();
  }

  /** Escape closes the menu before anything else; arrows, Home and End move through the items. */
  protected onMenuKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeMenu(true);
      return;
    }
    if (event.key === 'Tab') {
      // Tab leaves the menu and moves on from its button.
      this.closeMenu(true);
      return;
    }
    const items = this.items();
    const at = items.indexOf(this.document.activeElement as HTMLElement);
    const next =
      event.key === 'ArrowDown'
        ? (at + 1) % items.length
        : event.key === 'ArrowUp'
          ? (at - 1 + items.length) % items.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? items.length - 1
              : -1;
    if (next >= 0) {
      event.preventDefault();
      items[next]?.focus();
    }
  }

  protected onOutsidePointer(event: Event): void {
    if (this.menuOpen() && !(event.target as Element).closest('#plan-menu, [data-action=more]')) {
      this.closeMenu(false);
    }
  }

  private items(): HTMLElement[] {
    return Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('#plan-menu .item'));
  }

  private query(selector: string): HTMLElement | null {
    return this.host.nativeElement.querySelector<HTMLElement>(selector);
  }
}
