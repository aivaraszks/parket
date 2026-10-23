import {
  afterNextRender,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  signal,
  untracked,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterOutlet } from '@angular/router';
import { SceneCommands } from './scene/scene-commands';
import { ControlsSheet, SheetStop, TabId } from './ui/controls-sheet';
import { consumeFirstVisit } from './ui/first-visit';
import { EditorLoader } from './ui/editor-loader';
import { ImageDialog } from './ui/image-dialog';
import { ImageExport } from './ui/image-export';
import { ToastHost } from './ui/toast-host';
import { Toasts } from './ui/toasts';
import { ViewToolbar } from './ui/view-toolbar';
import { ViewportStatus } from './ui/viewport-status';
import { Viewport } from './viewport/viewport';

const HINT_MS = 6000;
const TOUCH_HINT = 'Drag to look around. Pinch to zoom. Two fingers to move.';
const MOUSE_HINT = 'Drag to look around. Scroll to zoom. Right-drag to move.';

@Component({
  selector: 'app-designer',
  imports: [
    Viewport,
    ViewportStatus,
    ViewToolbar,
    ToastHost,
    ControlsSheet,
    ImageDialog,
    RouterOutlet,
    EditorLoader,
  ],
  templateUrl: './designer.html',
  styleUrl: './designer.scss',
  host: { '[class]': '"stop-" + stop()' },
})
export class Designer {
  private readonly scene = inject(SceneCommands);
  private readonly toasts = inject(Toasts);
  protected readonly exporter = inject(ImageExport);

  protected readonly stop = signal<SheetStop>('peek');
  protected readonly tab = signal<TabId>('room');
  /** The shape editor (child route) is open: the designer underneath is inert. */
  protected readonly editorOpen = signal(false);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  private hintToast: number | null = null;

  constructor() {
    const title = inject(Title);
    const previousTitle = title.getTitle();
    title.setTitle('Floor designer - Parket');
    inject(DestroyRef).onDestroy(() => {
      title.setTitle(previousTitle || 'Parket');
      this.toasts.dismiss();
      this.exporter.closeFallback();
    });

    if (consumeFirstVisit()) {
      this.stop.set('half');
      this.tab.set('floor');
      const touch = globalThis.matchMedia?.('(pointer: coarse)').matches ?? false;
      this.hintToast = this.toasts.show(touch ? TOUCH_HINT : MOUSE_HINT, {
        durationMs: HINT_MS,
        onDismiss: () => (this.hintToast = null),
      });
    }

    // Without a 3D view the calculator is the useful part: open the Estimate tab.
    effect(() => {
      const status = this.scene.status();
      if (status === 'no-webgl' || status === 'error') {
        untracked(() => {
          this.tab.set('estimate');
          if (this.stop() === 'peek') {
            this.stop.set('half');
          }
        });
      }
    });
  }

  /** Focus goes back to Edit shape (or the Custom option) once the designer is live again. */
  protected onEditorClosed(): void {
    this.editorOpen.set(false);
    afterNextRender(
      () => {
        const root = this.host.nativeElement;
        (
          root.querySelector<HTMLElement>('[data-edit-shape]') ??
          root.querySelector<HTMLElement>('[data-mode-custom]')
        )?.focus();
      },
      { injector: this.injector },
    );
  }

  protected onStagePointer(): void {
    if (this.hintToast !== null) {
      this.toasts.dismiss(this.hintToast);
    }
  }
}
