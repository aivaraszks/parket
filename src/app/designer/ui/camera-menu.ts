import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  signal,
} from '@angular/core';
import { SceneCommands, ViewPreset } from '../scene/scene-commands';

const PRESETS: readonly { id: ViewPreset; label: string; sub: string }[] = [
  { id: 'corner', label: 'Corner', sub: 'Eye level from a corner' },
  { id: 'doorway', label: 'Doorway', sub: 'Looking in from the door' },
  { id: 'top', label: 'Top-down', sub: 'Straight down on the pattern' },
];

/**
 * Camera popover of the top bar: view presets, zoom and the "How to look around" help.
 * Presets also show inline from 1200 px. Escape closes the menu and does not reach the tray.
 */
@Component({
  selector: 'app-camera-menu',
  templateUrl: './camera-menu.html',
  styleUrl: './camera-menu.scss',
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(keydown.escape)': 'onEscape($event)',
    '(focusout)': 'onFocusOut($event)',
  },
})
export class CameraMenu {
  private readonly scene = inject(SceneCommands);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  protected readonly presets = PRESETS;
  protected readonly open = signal(false);
  protected readonly helpOpen = signal(false);
  /** Not while the 3D view is still loading. */
  protected readonly unavailable = computed(() => this.scene.status() !== 'ready');
  protected readonly failed = computed(() => {
    const status = this.scene.status();
    return status !== 'ready' && status !== 'loading';
  });
  protected readonly title = computed(() => (this.failed() ? 'Needs 3D view' : null));

  protected toggle(): void {
    if (this.unavailable()) {
      return;
    }
    if (this.open()) {
      this.close(true);
      return;
    }
    this.open.set(true);
    // Move focus to the first item once the popover is rendered.
    afterNextRender(() => this.query('.popover .item')?.focus(), { injector: this.injector });
  }

  protected close(restoreFocus: boolean): void {
    if (!this.open()) {
      return;
    }
    this.open.set(false);
    this.helpOpen.set(false);
    if (restoreFocus) {
      this.query('[data-trigger="camera"]')?.focus();
    }
  }

  protected setPreset(preset: ViewPreset, fromMenu: boolean): void {
    if (this.unavailable()) {
      return;
    }
    this.scene.setPreset(preset);
    if (fromMenu) {
      this.close(true);
    }
  }

  protected zoom(direction: 1 | -1, fromMenu: boolean): void {
    if (this.unavailable()) {
      return;
    }
    this.scene.zoom(direction);
    if (fromMenu) {
      this.close(true);
    }
  }

  protected onEscape(event: Event): void {
    if (!this.open()) {
      return;
    }
    // Handled here: it must not also close the tray.
    event.preventDefault();
    event.stopPropagation();
    this.close(true);
  }

  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (this.open() && next && !this.host.nativeElement.contains(next)) {
      this.close(false);
    }
  }

  protected onDocumentClick(event: Event): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.close(false);
    }
  }

  private query(selector: string): HTMLElement | null {
    return this.host.nativeElement.querySelector<HTMLElement>(selector);
  }
}
