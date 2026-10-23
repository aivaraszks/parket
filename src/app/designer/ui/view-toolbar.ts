import { Component, computed, ElementRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SceneCommands, ViewPreset } from '../scene/scene-commands';
import { ImageExport } from './image-export';

type Popover = 'views' | 'help' | null;

const PRESETS: readonly { id: ViewPreset; label: string; sub: string }[] = [
  { id: 'corner', label: 'Corner', sub: 'Eye level from a corner' },
  { id: 'doorway', label: 'Doorway', sub: 'Looking in from the door' },
  { id: 'top', label: 'Top-down', sub: 'Straight down on the pattern' },
];

/** Top bar over the view: back link, view presets and zoom, help, Save image. */
@Component({
  selector: 'app-view-toolbar',
  imports: [RouterLink],
  templateUrl: './view-toolbar.html',
  styleUrl: './view-toolbar.scss',
  host: { '(document:click)': 'onDocumentClick($event)', '(keydown.escape)': 'closePopover()' },
})
export class ViewToolbar {
  protected readonly scene = inject(SceneCommands);
  protected readonly exporter = inject(ImageExport);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly presets = PRESETS;
  protected readonly open = signal<Popover>(null);
  protected readonly unavailable = computed(() => this.scene.status() !== 'ready');
  protected readonly saveTitle = computed(() => (this.unavailable() ? 'Needs 3D view' : null));

  protected toggle(popover: Exclude<Popover, null>): void {
    if (this.open() === popover) {
      this.closePopover();
      return;
    }
    this.open.set(popover);
    // Move focus to the first item once the popover is rendered.
    setTimeout(() => {
      this.host.nativeElement.querySelector<HTMLElement>('.popover button, .popover a')?.focus();
    });
  }

  protected closePopover(): void {
    const popover = this.open();
    if (!popover) {
      return;
    }
    this.open.set(null);
    this.host.nativeElement.querySelector<HTMLElement>(`[data-trigger="${popover}"]`)?.focus();
  }

  protected setPreset(preset: ViewPreset): void {
    if (this.unavailable()) {
      return;
    }
    this.scene.setPreset(preset);
    this.open.set(null);
  }

  protected zoom(direction: 1 | -1): void {
    if (!this.unavailable()) {
      this.scene.zoom(direction);
    }
  }

  protected save(): void {
    if (!this.unavailable() && !this.exporter.busy()) {
      void this.exporter.save();
    }
  }

  protected onDocumentClick(event: Event): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.open.set(null);
    }
  }
}
