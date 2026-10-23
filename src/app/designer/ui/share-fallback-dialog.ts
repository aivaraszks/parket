import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { pullFocusBack, restoreFocus, trapTab } from './dialog-focus';

/** The clipboard was blocked: show the link so it can be copied by hand. */
@Component({
  selector: 'app-share-fallback-dialog',
  template: `
    <div class="scrim" (click)="closed.emit()"></div>
    <div
      #dialog
      class="dialog"
      tabindex="-1"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-fallback-title"
      aria-describedby="share-fallback-body"
    >
      <h2 id="share-fallback-title">Copy link</h2>
      <p id="share-fallback-body">Copy this link to share {{ name() }}.</p>
      <div class="field-row">
        <label for="share-fallback-link">Share link</label>
        <input
          #link
          id="share-fallback-link"
          class="link"
          type="text"
          readonly
          spellcheck="false"
          [value]="url()"
          (focus)="link.select()"
        />
      </div>
      <div class="actions">
        <button type="button" class="btn" (click)="closed.emit()">Close</button>
      </div>
    </div>
  `,
  styleUrls: ['./colour-confirm-dialog.scss', './share-fallback-dialog.scss'],
  host: {
    '(document:keydown.escape)': 'closed.emit()',
    '(document:keydown)': 'onKey($event)',
    '(document:focusin)': 'pullBack($event)',
  },
})
export class ShareFallbackDialog {
  private readonly document = inject(DOCUMENT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('link');
  private readonly dialog = viewChild.required<ElementRef<HTMLElement>>('dialog');
  private readonly opener = this.document.activeElement as HTMLElement | null;

  readonly url = input.required<string>();
  readonly name = input.required<string>();
  readonly closed = output<void>();

  constructor() {
    afterNextRender(() => this.field().nativeElement.focus());
    inject(DestroyRef).onDestroy(() =>
      restoreFocus(this.document, '[data-trigger="share"]', this.opener),
    );
  }

  protected pullBack(event: Event): void {
    pullFocusBack(event, this.host.nativeElement, this.field().nativeElement);
  }

  protected onKey(event: Event): void {
    if ((event as KeyboardEvent).key !== 'Tab') {
      return;
    }
    trapTab(event, this.host.nativeElement, this.document, this.dialog().nativeElement);
  }
}
