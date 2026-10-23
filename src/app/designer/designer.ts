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
  viewChild,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterOutlet } from '@angular/router';
import { IncomingShare } from './share/incoming-share';
import { ShareLink } from './share/share-link';
import { ColouringState } from './state/colouring-state';
import { Projects } from './state/projects';
import { ProjectIndex } from './state/project-index';
import { SceneCommands } from './scene/scene-commands';
import { ColourAnnouncer } from './ui/colour-announcer';
import { ColourConfirm } from './ui/colour-confirm';
import { ColourConfirmDialog } from './ui/colour-confirm-dialog';
import { ProjectsDialog } from './ui/projects-dialog';
import { ShareFallbackDialog } from './ui/share-fallback-dialog';
import { describeShared, SharedLinkDialog } from './ui/shared-link-dialog';
import { Dock } from './ui/dock';
import { isMinorReframe, measureFrame } from './ui/frame-measure';
import { NO_INSETS } from './scene/frame-insets';
import { SectionId } from './ui/section-id';
import { Tray } from './ui/tray';
import { ViewFrame } from './ui/view-frame';
import { consumeFirstVisit } from './ui/first-visit';
import { EditorLoader } from './ui/editor-loader';
import { ImageDialog } from './ui/image-dialog';
import { ImageExport } from './ui/image-export';
import { ToastHost } from './ui/toast-host';
import { ColourHint } from './ui/colour-hint';
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
    ColourHint,
    ViewToolbar,
    ToastHost,
    Dock,
    Tray,
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
    '[style]': 'frame.cssVars()',
    '(window:hashchange)': 'incoming.read()',
  },
})
export class Designer {
  protected readonly scene = inject(SceneCommands);
  private readonly toasts = inject(Toasts);
  protected readonly exporter = inject(ImageExport);
  private readonly colouring = inject(ColouringState);
  protected readonly confirm = inject(ColourConfirm);
  protected readonly announcer = inject(ColourAnnouncer);
  protected readonly incoming = inject(IncomingShare);
  protected readonly shareLink = inject(ShareLink);
  protected readonly projects = inject(Projects);
  private readonly index = inject(ProjectIndex);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly frame = inject(ViewFrame);
  private readonly dock = viewChild(Dock);
  private readonly tray = viewChild(Tray);
  private readonly chrome = viewChild<ElementRef<HTMLElement>>('chrome');
  /** The open dock section, or null (closed on every visit). */
  protected readonly section = signal<SectionId | null>(null);
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
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  private hintToast: number | null = null;
  /** The insets and section the scene was last framed to. */
  private sceneInsets = NO_INSETS;
  private sceneSection: SectionId | null = null;

  constructor() {
    const title = inject(Title);
    const previousTitle = title.getTitle();
    title.setTitle('Floor designer - Parket');
    this.destroyRef.onDestroy(() => {
      title.setTitle(previousTitle || 'Parket');
      this.toasts.dismiss();
      this.exporter.closeFallback();
      this.shareLink.closeFallback();
      // Colour is closed on every visit.
      this.confirm.cancel();
      this.colouring.setColourOpen(false);
      this.announcer.say('');
    });

    this.startNewProject();
    void this.incoming.read();

    if (consumeFirstVisit()) {
      const touch = globalThis.matchMedia?.('(pointer: coarse)').matches ?? false;
      this.hintToast = this.toasts.show(touch ? TOUCH_HINT : MOUSE_HINT, {
        durationMs: HINT_MS,
        onDismiss: () => (this.hintToast = null),
      });
    }

    // The Colour section is the colouring mode: open means taps in 3D select a surface.
    effect(() => {
      const open = this.section() === 'colour';
      untracked(() => this.colouring.setColourOpen(open));
    });

    // Without a 3D view the calculator is the useful part: open Estimate (focus does not move).
    effect(() => {
      const status = this.scene.status();
      if (status === 'no-webgl' || status === 'error') {
        untracked(() => this.section.set('estimate'));
      }
    });

    // The covered strips frame the room: the scene eases to them.
    // A small height change inside the same open section (More, an error line) does not re-frame.
    effect(() => {
      const insets = this.frame.insets();
      const section = this.section();
      untracked(() => {
        const sectionChanged = section !== this.sceneSection;
        if (isMinorReframe(this.sceneInsets, insets, sectionChanged)) return;
        this.sceneInsets = insets;
        this.sceneSection = section;
        this.scene.setFrame(insets);
      });
    });

    afterNextRender(() => this.observeFrame());
  }

  /** One ResizeObserver on the host, top bar and chrome (tray + dock / rail) publishes the insets. */
  private observeFrame(): void {
    const host = this.host.nativeElement;
    const topBar = host.querySelector<HTMLElement>('app-view-toolbar');
    const chrome = this.chrome()?.nativeElement ?? null;
    const measure = (): void => {
      const vertical = this.dock()?.isRail() ?? false;
      this.frame.set(measureFrame({ host, topBar, chrome }, vertical));
    };
    measure();
    if (typeof ResizeObserver !== 'function') return;
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    if (topBar) observer.observe(topBar);
    if (chrome) observer.observe(chrome);
    this.destroyRef.onDestroy(() => observer.disconnect());
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

  /** A dock button: open, switch (focus moves to the new heading) or close its own tray. */
  protected onDockToggle(id: SectionId): void {
    if (this.section() === id) {
      this.section.set(null);
      return;
    }
    this.section.set(id);
    afterNextRender(() => this.tray()?.focusHeading(), { injector: this.injector });
  }

  /** The tray's close button: focus goes to the section's dock button. */
  protected closeSection(): void {
    const id = this.section();
    this.section.set(null);
    if (id) {
      this.dock()?.focusItem(id);
    }
  }

  /** Escape closes the tray (a popover or dialog took the key first; a held slider ignores it). */
  protected onEscape(event: Event): void {
    if (event.defaultPrevented || !this.section() || this.tray()?.isScrubbing()) {
      return;
    }
    event.preventDefault();
    this.closeSection();
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
