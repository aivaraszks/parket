import { Component, inject, output } from '@angular/core';
import { EditorSession } from './editor-session';
import { EditorView } from './editor-view';

/**
 * Top bar (Done, title, Undo, Redo, Snap) and the view tools (Fit, Zoom). On a phone the tools sit
 * in the canvas corner (CSS grid placement); the DOM order is the tab order: the title comes first (it gets the initial focus), then Done.
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
        class="btn tool icon-only"
        data-action="zoom-out"
        aria-label="Zoom out"
        title="Zoom out"
        (click)="view.zoom(-1)"
      >
        <svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10" /></svg>
      </button>
      <button
        type="button"
        class="btn tool icon-only"
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
})
export class PlanToolbar {
  protected readonly session = inject(EditorSession);
  protected readonly view = inject(EditorView);
  readonly done = output<void>();
}
