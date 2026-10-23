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
import { ActivatedRoute, Router, RouterOutlet } from '@angular/router';
import { IncomingShare } from './share/incoming-share';
import { ShareLink } from './share/share-link';
import { ColouringState } from './state/colouring-state';
import { DesignState } from './state/design-state';
import { Projects } from './state/projects';
import { ProjectIndex } from './state/project-index';
import { SceneCommands } from './scene/scene-commands';
import { ColourAnnouncer } from './ui/colour-announcer';
import { ColourConfirm } from './ui/colour-confirm';
import { ColourConfirmDialog } from './ui/colour-confirm-dialog';
import { ProjectsDialog } from './ui/projects-dialog';
import { ShareFallbackDialog } from './ui/share-fallback-dialog';
import { describeShared, SharedLinkDialog } from './ui/shared-link-dialog';
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
    ProjectsDialog,
    ShareFallbackDialog,
    SharedLinkDialog,
  ],
  templateUrl: './designer.html',
  styleUrl: './designer.scss',
  host: {
    '[class]': '"stop-" + stop()',
    '(window:hashchange)': 'incoming.read()',
  },
})
export class Designer {
  private readonly scene = inject(SceneCommands);
  private readonly toasts = inject(Toasts);
  protected readonly exporter = inject(ImageExport);
  private readonly colouring = inject(ColouringState);
  private readonly design = inject(DesignState);
  protected readonly confirm = inject(ColourConfirm);
  protected readonly announcer = inject(ColourAnnouncer);
  protected readonly incoming = inject(IncomingShare);
  protected readonly shareLink = inject(ShareLink);
  protected readonly projects = inject(Projects);
  private readonly index = inject(ProjectIndex);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly stop = signal<SheetStop>('peek');
  protected readonly tab = signal<TabId>('room');
  /** The shape editor (child route) is open: the designer underneath is inert. */
  protected readonly editorOpen = signal(false);
  protected readonly projectsOpen = signal(false);
  /** The shared-link prompt waits while the plan editor or any other dialog is open (two dialogs would fight over focus). */
  protected readonly sharedPrompt = computed(() =>
    this.editorOpen() ||
    this.projectsOpen() ||
    this.confirm.pending() !== null ||
    this.shareLink.fallbackUrl() !== null ||
    this.exporter.fallbackUrl() !== null
      ? null
      : this.incoming.pending(),
  );
  protected readonly sharedSummary = computed(() => {
    const prompt = this.sharedPrompt();
    return prompt ? describeShared(prompt.name, prompt.design) : '';
  });
  /** A dialog over the designer (not the editor): everything underneath is inert. */
  protected readonly dialogOpen = computed(
    () =>
      this.confirm.pending() !== null ||
      this.projectsOpen() ||
      this.shareLink.fallbackUrl() !== null ||
      this.sharedPrompt() !== null,
  );
  /** The editor or a dialog is open: everything underneath is inert. */
  protected readonly covered = computed(() => this.editorOpen() || this.dialogOpen());

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
      this.shareLink.closeFallback();
      // Colour mode is off on every visit.
      this.confirm.cancel();
      this.colouring.setActive(false);
      this.colouring.setSurfacesOpen(false);
      this.announcer.say('');
    });

    this.startNewProject();
    void this.incoming.read();

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

  /** "Design your floor" on the landing page opens `?new=1`: start a project and drop the query. */
  private startNewProject(): void {
    if (this.route.snapshot.queryParamMap.get('new') !== '1') {
      return;
    }
    // An untouched "Project N" is reused, so repeated taps do not fill the list with empty projects.
    if (!this.projects.isActiveUntouched()) {
      const result = this.projects.create();
      if (result.ok) {
        const name = this.projectName(result.id);
        this.toasts.show(`Created “${name}”.`);
        this.announcer.say(`Opened ${name}.`);
      } else if (result.reason === 'limit') {
        const text = `Limit reached. Opened “${this.projectName(this.index.activeId())}”. Delete a project to add more.`;
        this.toasts.show(text, { kind: 'error' });
        this.announcer.say(text);
      }
    }
    // So a reload does not create another one.
    void this.router.navigate([], {
      queryParams: { new: null },
      queryParamsHandling: 'merge',
      preserveFragment: true,
      replaceUrl: true,
    });
  }

  private projectName(id: string): string {
    return this.index.projects().find((p) => p.id === id)?.name ?? '';
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
