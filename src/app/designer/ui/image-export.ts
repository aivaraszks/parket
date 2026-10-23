import { DOCUMENT } from '@angular/common';
import { inject, Service, signal } from '@angular/core';
import { SceneCommands } from '../scene/scene-commands';
import { DesignState } from '../state/design-state';
import { Toasts } from './toasts';

const ERROR_TOAST_MS = 8000;

/** iOS Safari ignores or blocks the `download` attribute for blobs: show the image instead. */
export function needsSaveFallback(doc: Document): boolean {
  const nav = doc.defaultView?.navigator;
  const ua = nav?.userAgent ?? '';
  const iosTouchMac = nav?.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1;
  return /iPad|iPhone|iPod/.test(ua) || iosTouchMac || !('download' in doc.createElement('a'));
}

/** "Save image": renders the view to a PNG, downloads it and reports the result in a toast. */
@Service()
export class ImageExport {
  private readonly scene = inject(SceneCommands);
  private readonly state = inject(DesignState);
  private readonly toasts = inject(Toasts);
  private readonly document = inject(DOCUMENT);

  readonly busy = signal(false);
  /** Object URL of the image while the fallback dialog is open. */
  readonly fallbackUrl = signal<string | null>(null);

  async save(): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    try {
      const blob = await this.scene.exportPng();
      const url = URL.createObjectURL(blob);
      if (needsSaveFallback(this.document)) {
        this.fallbackUrl.set(url);
      } else {
        this.download(url);
        this.toasts.show('Image saved.');
      }
    } catch {
      this.toasts.show('Could not create the image. Try again.', {
        kind: 'error',
        durationMs: ERROR_TOAST_MS,
        action: { label: 'Retry', run: () => void this.save() },
      });
    } finally {
      this.busy.set(false);
    }
  }

  closeFallback(): void {
    const url = this.fallbackUrl();
    if (url) {
      URL.revokeObjectURL(url);
      this.fallbackUrl.set(null);
    }
  }

  private download(url: string): void {
    const link = this.document.createElement('a');
    link.href = url;
    link.download = `parket-herringbone-${this.state.species()}-${this.state.angle()}deg.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
