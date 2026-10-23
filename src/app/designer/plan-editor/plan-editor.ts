import {
  afterNextRender,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import { PlanEditorLauncher } from '../ui/plan-editor-launcher';
import { EditorSession } from './editor-session';
import { EditorView } from './editor-view';
import { PlanCanvas } from './plan-canvas';
import { PlanPanel } from './plan-panel';
import { PlanToolbar } from './plan-toolbar';

/**
 * The full-screen shape editor (route `/designer/plan`). It imports only plan, state and UI code,
 * never the 3D scene, so its chunk stays small.
 */
@Component({
  selector: 'app-plan-editor',
  imports: [PlanToolbar, PlanCanvas, PlanPanel],
  providers: [EditorSession, EditorView],
  template: `
    <button type="button" class="skip" (click)="skipToControls()">Skip to controls</button>
    <app-plan-toolbar (done)="close()" />
    <app-plan-canvas />
    <app-plan-panel />
    <div class="visually-hidden" aria-live="polite" aria-atomic="true">
      {{ session.message() }}
    </div>
  `,
  styleUrl: './plan-editor.scss',
  host: {
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': 'plan-editor-title',
    '(keydown)': 'onKeydown($event)',
  },
})
export class PlanEditor {
  protected readonly session = inject(EditorSession);
  private readonly launcher = inject(PlanEditorLauncher);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  constructor() {
    const title = inject(Title);
    const previousTitle = title.getTitle();
    title.setTitle('Room shape - Parket');
    inject(DestroyRef).onDestroy(() => {
      title.setTitle(previousTitle);
      this.launcher.closed();
    });

    // Screen readers hear where they are: focus starts on the title.
    afterNextRender(() => this.query('[data-title]')?.focus());

    // After deleting something, focus returns to the plan.
    effect(() => {
      if (this.session.focusRequest()?.target === 'plan') {
        afterNextRender(() => this.query('[data-plan]')?.focus(), { injector: this.injector });
      }
    });
  }

  protected close(): void {
    this.launcher.close();
  }

  protected skipToControls(): void {
    const chip = this.query('[data-chip]');
    const visible = chip && globalThis.getComputedStyle(chip).display !== 'none';
    (visible ? chip : this.query('.content button, .content input, .content summary'))?.focus();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented) {
      return;
    }
    const target = event.target as HTMLElement;
    const typing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
    // A field in the open card: Escape commits what was typed (blur) and closes the card.
    const cardField = typing && this.session.card() !== null;
    if (event.key === 'Escape' && (!typing || cardField)) {
      event.preventDefault();
      if (cardField) {
        target.blur();
      }
      if (this.session.card()) {
        this.session.card.set(null);
        this.query('[data-chip]')?.focus();
      } else if (this.session.selection()) {
        this.session.select(null);
      } else {
        this.close();
      }
      return;
    }
    const mod = event.ctrlKey || event.metaKey;
    if (!mod || typing) {
      return;
    }
    const key = event.key.toLowerCase();
    if (key === 'z') {
      event.preventDefault();
      if (event.shiftKey) this.session.redo();
      else this.session.undo();
    } else if (key === 'y') {
      event.preventDefault();
      this.session.redo();
    }
  }

  private query(selector: string): HTMLElement | null {
    return this.host.nativeElement.querySelector<HTMLElement>(selector);
  }
}
