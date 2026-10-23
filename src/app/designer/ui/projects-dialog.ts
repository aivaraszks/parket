import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { SceneCommands } from '../scene/scene-commands';
import { ColouringState } from '../state/colouring-state';
import { DesignState } from '../state/design-state';
import { MAX_PROJECT_NAME_LENGTH, MAX_PROJECTS, ProjectMeta } from '../state/project-meta';
import { ProjectIndex } from '../state/project-index';
import { Projects, ProjectsResult } from '../state/projects';
import { ColourAnnouncer } from './colour-announcer';
import { pullFocusBack, restoreFocus, trapTab } from './dialog-focus';
import { formatEdited } from './project-date';
import { Toasts } from './toasts';

interface RowMenu {
  readonly id: string;
  readonly right: number;
  readonly top: number;
}

/** Rough height of the four-item menu, to decide whether it flips above its button. */
const MENU_HEIGHT_PX = 210;
const UNDO_TOAST_MS = 8000;
const MENU_GAP_PX = 4;
const CHIP = '[data-trigger="projects"]';
const LIMIT_HINT = 'Limit reached. Delete a project to add more.';

/** Modal sheet (phones) / dialog (desktop) to open, create, rename, duplicate and delete projects. */
@Component({
  selector: 'app-projects-dialog',
  templateUrl: './projects-dialog.html',
  styleUrl: './projects-dialog.scss',
  host: {
    '(document:keydown.escape)': 'onEscape()',
    '(document:keydown)': 'onKey($event)',
    '(document:focusin)': 'pullBack($event)',
  },
})
export class ProjectsDialog {
  private readonly document = inject(DOCUMENT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly projects = inject(Projects);
  private readonly index = inject(ProjectIndex);
  private readonly design = inject(DesignState);
  private readonly toasts = inject(Toasts);
  private readonly scene = inject(SceneCommands);
  private readonly announcer = inject(ColourAnnouncer);
  private readonly colouring = inject(ColouringState);
  private readonly dialog = viewChild.required<ElementRef<HTMLElement>>('dialog');
  private readonly renameField = viewChild<ElementRef<HTMLInputElement>>('renameField');
  private readonly opener = this.document.activeElement as HTMLElement | null;
  /** Where focus goes when the dialog closes: the Projects chip, or the toast's Undo after a delete. */
  private restoreTargets: readonly string[] = [CHIP];

  protected readonly max = MAX_PROJECTS;
  protected readonly nameMax = MAX_PROJECT_NAME_LENGTH;
  protected readonly atLimit = this.projects.atLimit;
  protected readonly renamingId = signal<string | null>(null);
  protected readonly menu = signal<RowMenu | null>(null);

  /** Row order is fixed when the dialog opens: rows do not jump while it is open. */
  private readonly order = untracked(() =>
    [...this.index.projects()].sort((a, b) => b.updatedAt - a.updatedAt).map((p) => p.id),
  );
  private readonly now = Date.now();

  protected readonly currentId = computed(() => this.design.activeId());
  protected readonly count = computed(() => this.index.projects().length);
  protected readonly rows = computed(() => {
    const byId = new Map(this.index.projects().map((p) => [p.id, p]));
    const active = this.design.activeId();
    return this.order
      .map((id) => byId.get(id))
      .filter((meta): meta is ProjectMeta => meta !== undefined)
      .map((meta) => {
        const edited = formatEdited(meta.updatedAt, this.now);
        const current = meta.id === active;
        return {
          id: meta.id,
          name: meta.name,
          edited: `Edited ${edited}`,
          current,
        };
      });
  });
  protected readonly menuName = computed(
    () => this.index.projects().find((p) => p.id === this.menu()?.id)?.name ?? '',
  );

  readonly closed = output<void>();

  constructor() {
    afterNextRender(() => {
      const current = this.host.nativeElement.querySelector<HTMLElement>('[aria-current="true"]');
      const target = current ?? this.host.nativeElement.querySelector<HTMLElement>('.row');
      target?.focus();
      current?.scrollIntoView?.({ block: 'nearest' });
    });
    inject(DestroyRef).onDestroy(() =>
      restoreFocus(this.document, this.restoreTargets, this.opener),
    );
  }

  /** Escape closes the rename first, then the menu, then the dialog. */
  protected onEscape(): void {
    if (this.renamingId()) {
      this.cancelRename();
    } else if (this.menu()) {
      this.closeMenu(true);
    } else {
      this.closed.emit();
    }
  }

  protected onScrim(): void {
    if (this.menu()) {
      this.closeMenu(false);
    } else {
      this.closed.emit();
    }
  }

  /** A click anywhere in the panel except on a More button closes the open menu. */
  protected onPanelClick(event: Event): void {
    if (this.menu() && !(event.target as Element).closest('[data-more]')) {
      this.closeMenu(false);
    }
  }

  protected pullBack(event: Event): void {
    pullFocusBack(event, this.host.nativeElement, this.firstFocusable());
  }

  protected onKey(event: Event): void {
    if ((event as KeyboardEvent).key !== 'Tab') {
      return;
    }
    const open = this.menu();
    if (open && !event.defaultPrevented) {
      // Tab closes the menu and moves on from its More button (focus moves first, the default
      // Tab then continues from there).
      this.menu.set(null);
      this.host.nativeElement.querySelector<HTMLElement>(`[data-more="${open.id}"]`)?.focus();
    }
    trapTab(event, this.host.nativeElement, this.document, this.dialog().nativeElement);
  }

  private firstFocusable(): HTMLElement | null {
    return this.host.nativeElement.querySelector<HTMLElement>('button, input');
  }

  protected open(id: string): void {
    if (id !== this.design.activeId()) {
      const result = this.projects.switchTo(id);
      if (!result.ok) {
        return;
      }
      this.announceOpened(id);
    }
    this.closed.emit();
  }

  protected create(): void {
    if (this.atLimit()) {
      this.announcer.say(LIMIT_HINT);
      return;
    }
    const result = this.projects.create();
    if (result.ok) {
      this.toasts.show(`Created “${this.nameOf(result.id)}”.`);
      this.announceOpened(result.id);
      this.closed.emit();
    }
  }

  protected duplicate(id: string): void {
    this.closeMenu(false);
    if (this.atLimit()) {
      this.announcer.say(LIMIT_HINT);
      return;
    }
    const result = this.projects.duplicate(id);
    if (result.ok) {
      this.toasts.show(`Duplicated as “${this.nameOf(result.id)}”.`);
      this.announceOpened(result.id);
      this.closed.emit();
    }
  }

  protected remove(id: string): void {
    const name = this.nameOf(id);
    const wasActive = id === this.design.activeId();
    this.closeMenu(false);
    const result = this.projects.remove(id);
    if (!result.ok) {
      return;
    }
    const opened = wasActive ? ` Opened ${this.nameOf(this.design.activeId())}.` : '';
    this.announcer.say(`Deleted ${name}.${opened}`);
    // The Undo toast is the only way back and lasts 8 s: put keyboard focus on it (it pauses there).
    this.restoreTargets = ['.toast .action', CHIP];
    this.closed.emit();
  }

  /** Reset the current project to defaults (its room shape is kept), with an Undo toast. */
  protected reset(): void {
    this.closeMenu(false);
    this.design.reset();
    this.scene.setPreset('corner');
    // Colour open: the selection returns to "All walls" (Undo leaves it as is).
    if (this.colouring.colourOpen()) {
      this.colouring.select({ kind: 'walls' }, 'list');
    }
    const kept = this.design.plan() ? ' Your room shape is kept.' : '';
    this.toasts.show(`Design reset.${kept}`, {
      durationMs: UNDO_TOAST_MS,
      action: {
        label: 'Undo',
        run: () => {
          this.design.undo();
          // Focus was on the Undo button, which is about to go away.
          restoreFocus(this.document, [CHIP], null);
        },
      },
      // A manual edit drops the undo buffer; the toast must not offer a dead Undo.
      keepWhile: () => this.design.canUndo(),
      onDismiss: () => this.design.dismissUndo(),
    });
    this.announcer.say('Design reset.');
    // The Undo toast lasts 8 s: put keyboard focus on it, else on the Projects chip.
    this.restoreTargets = ['.toast .action', CHIP];
    this.closed.emit();
  }

  protected startRename(id: string): void {
    this.closeMenu(false);
    this.renamingId.set(id);
    afterNextRender(
      () => {
        const field = this.renameField()?.nativeElement;
        field?.focus();
        field?.select();
      },
      { injector: this.injector },
    );
  }

  protected commitRename(id: string, value: string): void {
    if (this.renamingId() !== id) {
      return;
    }
    this.renamingId.set(null);
    const before = this.nameOf(id);
    const trimmed = value.trim();
    let result: ProjectsResult | null = null;
    if (trimmed !== '' && trimmed !== before) {
      result = this.projects.rename(id, trimmed);
    }
    const after = this.nameOf(id);
    if (result?.ok && after !== before) {
      this.announcer.say(`Renamed to ${after}.`);
    } else if (trimmed === '') {
      this.announcer.say('Name unchanged.');
    }
    this.focusMore(id);
  }

  protected cancelRename(): void {
    const id = this.renamingId();
    if (id) {
      this.renamingId.set(null);
      this.focusMore(id);
    }
  }

  protected toggleMenu(id: string, event: Event): void {
    if (this.menu()?.id === id) {
      this.closeMenu(true);
      return;
    }
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const view = this.document.defaultView;
    const height = view?.innerHeight ?? 0;
    const width = view?.innerWidth ?? 0;
    // Below the button, or above it when that does not fit; never above the list, so the menu
    // cannot cover Close or New project.
    const listTop =
      this.host.nativeElement.querySelector('.list')?.getBoundingClientRect().top ?? 0;
    const minTop = listTop + MENU_GAP_PX;
    const maxTop = height > 0 ? height - MENU_HEIGHT_PX - MENU_GAP_PX : Number.POSITIVE_INFINITY;
    const below = rect.bottom + MENU_GAP_PX;
    const top = below <= maxTop ? below : rect.top - MENU_GAP_PX - MENU_HEIGHT_PX;
    this.menu.set({
      id,
      right: Math.max(0, width - rect.right),
      top: Math.max(minTop, Math.min(top, maxTop)),
    });
    afterNextRender(
      () => this.host.nativeElement.querySelector<HTMLElement>('.menu .item')?.focus(),
      { injector: this.injector },
    );
  }

  protected closeMenu(restoreFocus: boolean): void {
    const open = this.menu();
    this.menu.set(null);
    if (open && restoreFocus) {
      this.focusMore(open.id);
    }
  }

  protected onMenuKey(event: Event): void {
    const key = (event as KeyboardEvent).key;
    if (key !== 'ArrowDown' && key !== 'ArrowUp') {
      return;
    }
    event.preventDefault();
    const items = Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('.menu .item'));
    const at = items.indexOf(this.document.activeElement as HTMLElement);
    const step = key === 'ArrowDown' ? 1 : -1;
    items[(at + step + items.length) % items.length]?.focus();
  }

  private focusMore(id: string): void {
    afterNextRender(
      () => this.host.nativeElement.querySelector<HTMLElement>(`[data-more="${id}"]`)?.focus(),
      { injector: this.injector },
    );
  }

  private nameOf(id: string): string {
    return this.index.projects().find((p) => p.id === id)?.name ?? '';
  }

  private announceOpened(id: string): void {
    this.announcer.say(`Opened ${this.nameOf(id)}.`);
  }
}
