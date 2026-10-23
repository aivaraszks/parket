import { Component, computed, inject, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ShareLink } from '../share/share-link';
import { SceneCommands } from '../scene/scene-commands';
import { CameraMenu } from './camera-menu';
import { ImageExport } from './image-export';

/** Top bar over the view: back link, project chip, Camera menu, Share, Save image. */
@Component({
  selector: 'app-view-toolbar',
  imports: [RouterLink, CameraMenu],
  templateUrl: './view-toolbar.html',
  styleUrl: './view-toolbar.scss',
})
export class ViewToolbar {
  private readonly scene = inject(SceneCommands);
  protected readonly exporter = inject(ImageExport);
  protected readonly shareLink = inject(ShareLink);

  /** The Projects chip was pressed: the designer opens the dialog. */
  readonly projects = output<void>();

  protected readonly projectName = computed(() => this.shareLink.projectName());
  protected readonly unavailable = computed(() => this.scene.status() !== 'ready');
  /** Tooltip only once the 3D view has failed, not while it loads. */
  protected readonly saveTitle = computed(() => {
    const status = this.scene.status();
    return status !== 'ready' && status !== 'loading' ? 'Needs 3D view' : null;
  });

  protected save(): void {
    if (!this.unavailable() && !this.exporter.busy()) {
      void this.exporter.save();
    }
  }

  protected share(): void {
    if (!this.shareLink.busy()) {
      void this.shareLink.share();
    }
  }
}
