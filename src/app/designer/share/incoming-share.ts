import { DOCUMENT } from '@angular/common';
import { inject, Service, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter, merge, take, timer } from 'rxjs';
import { Design } from '../state/design-defaults';
import { ProjectIndex } from '../state/project-index';
import { Projects } from '../state/projects';
import { Toasts } from '../ui/toasts';
import { decodeShare, DecodeFailure, SHARE_HASH_PREFIX } from './share-codec';

const ERROR_TOAST_MS = 8000;
/** How long to wait for the router's own navigation after a hashchange. */
const ROUTER_SETTLE_MS = 250;

export interface IncomingDesign {
  /** Sanitised name from the link, or null (the project is then called "Shared design"). */
  readonly name: string | null;
  readonly design: Design;
}

const FAILURE_COPY: Record<DecodeFailure, string> = {
  invalid: 'This link is broken or incomplete.',
  'too-large': 'This link is broken or incomplete.',
  'newer-version': 'This link was made with a newer version of Parket. Reload to update.',
  unsupported: "This browser can't open shared links.",
};

/**
 * Reads a `#s=...` link from the address bar (plan P8). The designer calls `read()` on init and,
 * while `pending()` is set, shows the "Open shared design?" prompt wired to `accept()` / `decline()`.
 * The hash is removed after either answer and after a decode error.
 */
@Service()
export class IncomingShare {
  private readonly document = inject(DOCUMENT);
  private readonly projects = inject(Projects);
  private readonly index = inject(ProjectIndex);
  private readonly toasts = inject(Toasts);
  private readonly router = inject(Router);

  /** A decoded design waiting for the user's answer; null = no prompt. */
  readonly pending = signal<IncomingDesign | null>(null);

  /** True when the current address bar carries a share link. */
  hasLink(): boolean {
    return this.document.location.hash.startsWith(`#${SHARE_HASH_PREFIX}`);
  }

  /** Decode the link in the address bar, if any. Never throws. */
  async read(): Promise<void> {
    if (!this.hasLink() || this.pending()) {
      return;
    }
    const fragment = this.document.location.hash.slice(1 + SHARE_HASH_PREFIX.length);
    const result = await decodeShare(fragment);
    if (!result.ok) {
      this.toasts.show(FAILURE_COPY[result.reason], { kind: 'error', durationMs: ERROR_TOAST_MS });
      this.clearHash();
      return;
    }
    this.pending.set({ name: result.name, design: result.design });
  }

  /** Add the pending design as a new project. A refusal closes the prompt too; Projects shows why in a toast. */
  accept(): void {
    const incoming = this.pending();
    if (!incoming) {
      return;
    }
    const result = this.projects.addShared(incoming.name, incoming.design);
    if (!result.ok) {
      this.finish();
      return;
    }
    const added = this.index.projects().find((p) => p.id === result.id);
    this.toasts.show(`Added “${added?.name ?? incoming.name ?? 'Shared design'}”.`);
    this.finish();
  }

  decline(): void {
    this.finish();
  }

  private finish(): void {
    this.pending.set(null);
    this.clearHash();
  }

  /** Remove the hash, keeping path and query; reloading then does nothing. */
  private clearHash(): void {
    const { history, location } = this.document.defaultView ?? {};
    if (history && location && location.hash) {
      history.replaceState(history.state, '', location.pathname + location.search);
      this.settleRouter();
    }
  }

  /**
   * The router hears a hashchange (a link pasted while the designer is open) a tick later and
   * then puts the hash back in the address bar. When its navigation ends, or nothing happens,
   * bring its own URL in line without the hash, replacing the history entry.
   */
  private settleRouter(): void {
    merge(
      this.router.events.pipe(filter((event) => event instanceof NavigationEnd)),
      timer(ROUTER_SETTLE_MS),
    )
      .pipe(take(1))
      .subscribe(() => {
        if (this.router.url.includes('#')) {
          void this.router
            .navigate([], { queryParamsHandling: 'preserve', replaceUrl: true })
            .catch(() => false);
        }
      });
  }
}
