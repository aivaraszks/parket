import {
  afterNextRender,
  Component,
  computed,
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
import { ColouringState } from './state/colouring-state';
import { DesignState } from './state/design-state';
import { SceneCommands } from './scene/scene-commands';
import { ColourAnnouncer } from './ui/colour-announcer';
import { ColourConfirm } from './ui/colour-confirm';
import { ColourConfirmDialog } from './ui/colour-confirm-dialog';
import { ControlsSheet, SheetStop, TabId } from './ui/controls-sheet';
import { consumeFirstVisit } from './ui/first-visit';
import { EditorLoader } from './ui/editor-loader';
import { ImageDialog } from './ui/image-dialog';
import { ImageExport } from './ui/image-export';
import { ToastHost } from './ui/toast-host';
import { findItem, surfaceItems } from './ui/surface-model';
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
    ColourConfirmDialog,
  ],
  templateUrl: './designer.html',
  styleUrl: './designer.scss',
  host: { '[class]': '"stop-" + stop()' },
})
export class Designer {
  private readonly scene = inject(SceneCommands);
  private readonly toasts = inject(Toasts);
  protected readonly exporter = inject(ImageExport);
  private readonly colouring = inject(ColouringState);
  private readonly design = inject(DesignState);
  protected readonly confirm = inject(ColourConfirm);
  protected readonly announcer = inject(ColourAnnouncer);

  protected readonly stop = signal<SheetStop>('peek');
  protected readonly tab = signal<TabId>('room');
  /** The shape editor (child route) is open: the designer underneath is inert. */
  protected readonly editorOpen = signal(false);
  /** The editor or the colour confirm is open: everything underneath is inert. */
  protected readonly covered = computed(() => this.editorOpen() || this.confirm.pending() !== null);

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
      // Colour mode is off on every visit.
      this.confirm.cancel();
      this.colouring.setActive(false);
      this.colouring.setSurfacesOpen(false);
      this.announcer.say('');
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

    // Colour mode on: show the surfaces to pick from.
    effect(() => {
      if (this.colouring.active()) {
        untracked(() => this.showSurfaces());
      }
    });

    // A tap on a surface in 3D opens its palette (focus stays on the canvas).
    let seenTap = untracked(() => this.colouring.lastTap());
    effect(() => {
      const taps = this.colouring.lastTap();
      if (taps !== seenTap) {
        seenTap = taps;
        untracked(() => {
          this.showSurfaces();
          this.announceSelection();
        });
      }
    });

    // The selection only lives while the Surfaces tab is open, and while it is open a tap in 3D
    // selects the tapped wall or door even with Colour mode off.
    effect(() => {
      const open = this.tab() === 'surfaces';
      untracked(() => {
        this.colouring.setSurfacesOpen(open);
        if (!open) {
          this.colouring.clear();
        }
      });
    });

    // A tap on empty space clears the selection.
    let hadSelection = false;
    effect(() => {
      const has = this.colouring.hasSelection();
      if (
        hadSelection &&
        !has &&
        untracked(() => this.colouring.active() && this.tab() === 'surfaces')
      ) {
        this.announcer.say('Selection cleared.');
      }
      hadSelection = has;
    });

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

  /** Opens the sheet on the Surfaces tab, at Half if it was peeking. */
  private showSurfaces(): void {
    this.tab.set('surfaces');
    if (this.stop() === 'peek') {
      this.stop.set('half');
    }
  }

  private announceSelection(): void {
    const shape = this.design.roomShape();
    const items = surfaceItems(shape, this.design.mode() === 'simple', {
      paint: this.design.paint(),
      wallColor: this.design.wallColor(),
      doorColor: this.design.doorColor(),
    });
    const item = findItem(items, this.colouring.selected());
    if (item) {
      this.announcer.say(`${item.label.replace(' (window)', '')} selected.`);
    }
  }

  /** Escape in the stage turns Colour mode off (a popover or dialog took the key first). */
  protected onStageEscape(event: Event): void {
    if (!event.defaultPrevented && this.colouring.active()) {
      this.colouring.setActive(false);
      this.announcer.say('Colour mode off.');
    }
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
