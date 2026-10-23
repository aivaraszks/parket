import { DOCUMENT } from '@angular/common';
import { inject, Service, signal } from '@angular/core';
import { Toasts } from '../ui/toasts';
import { DesignState } from '../state/design-state';
import { ProjectIndex } from '../state/project-index';
import { encodeShare, shareUrl, ShareTooLarge } from './share-codec';

const ERROR_TOAST_MS = 8000;

/**
 * Share the active project as a link (plan P8).
 * Coarse pointer + `navigator.share` + `canShare({ url })` opens the share sheet (AbortError is
 * silent); otherwise the link is copied with a "Link copied." toast; if the clipboard fails,
 * `fallbackUrl` is set and the designer shows the fallback dialog. A too-big design shows the
 * error toast "This design is too big to share as a link.".
 */
@Service()
export class ShareLink {
  private readonly state = inject(DesignState);
  private readonly index = inject(ProjectIndex);
  private readonly toasts = inject(Toasts);
  private readonly document = inject(DOCUMENT);

  /** The link to show in the fallback dialog; null = dialog closed. */
  readonly fallbackUrl = signal<string | null>(null);
  /** True while the link is being made (the Share chip shows `aria-busy`). */
  readonly busy = signal(false);

  /** Name of the project being shared, for titles and the fallback dialog text. */
  projectName(): string {
    const id = this.state.activeId();
    return this.index.projects().find((p) => p.id === id)?.name ?? 'Parket';
  }

  async share(): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    try {
      const name = this.projectName();
      const url = await this.makeUrl(name);
      if (url !== null) {
        await this.deliver(url, name);
      }
    } finally {
      this.busy.set(false);
    }
  }

  closeFallback(): void {
    this.fallbackUrl.set(null);
  }

  private async makeUrl(name: string): Promise<string | null> {
    try {
      const token = await encodeShare(this.state.snapshot(), name);
      return shareUrl(this.document.baseURI, token);
    } catch (error) {
      const text =
        error instanceof ShareTooLarge
          ? error.message
          : "Couldn't make a link. Try again or use a different browser.";
      this.toasts.show(text, { kind: 'error', durationMs: ERROR_TOAST_MS });
      return null;
    }
  }

  private async deliver(url: string, name: string): Promise<void> {
    const win = this.document.defaultView;
    const nav = win?.navigator;
    const coarse = win?.matchMedia?.('(pointer: coarse)').matches ?? false;
    if (coarse && typeof nav?.share === 'function' && nav.canShare?.({ url })) {
      try {
        await nav.share({ title: `Parket: ${name}`, url });
        return;
      } catch (error) {
        if ((error as { name?: string } | null)?.name === 'AbortError') {
          return;
        }
        // Any other failure: fall through to copying the link.
      }
    }
    try {
      await nav!.clipboard.writeText(url);
      this.toasts.show('Link copied.');
    } catch {
      this.fallbackUrl.set(url);
    }
  }
}
