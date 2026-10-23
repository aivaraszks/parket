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
import { trapTab } from './dialog-focus';

/** Alert dialog: really change every wall colour? Focus starts on Cancel (the safe answer). */
@Component({
  selector: 'app-colour-confirm-dialog',
  template: `
    <div class="scrim" (click)="cancelled.emit()"></div>
    <div
      #dialog
      class="dialog"
      tabindex="-1"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="colour-confirm-title"
      aria-describedby="colour-confirm-body"
    >
      <h2 id="colour-confirm-title">Change all walls?</h2>
      <p id="colour-confirm-body">{{ body() }}</p>
      <div class="actions">
        <button #cancel type="button" class="btn" (click)="cancelled.emit()">Cancel</button>
        <button type="button" class="btn primary" (click)="confirmed.emit()">
          Change all walls
        </button>
      </div>
    </div>
  `,
  styleUrl: './colour-confirm-dialog.scss',
  // On the document, so Escape and Tab keep working even if focus ended up outside the dialog.
  host: {
    '(document:keydown.escape)': 'cancelled.emit()',
    '(document:keydown)': 'onKey($event)',
    '(document:focusin)': 'pullBack($event)',
  },
})
export class ColourConfirmDialog {
  private readonly document = inject(DOCUMENT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly cancelButton = viewChild.required<ElementRef<HTMLButtonElement>>('cancel');
  private readonly dialog = viewChild.required<ElementRef<HTMLElement>>('dialog');
  private readonly opener = this.document.activeElement as HTMLElement | null;

  readonly body = input.required<string>();
  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  constructor() {
    afterNextRender(() => this.cancelButton().nativeElement.focus());
    inject(DestroyRef).onDestroy(() => {
      // The opener is inert until the dialog is gone: focus it on the next turn.
      const opener = this.opener;
      setTimeout(() => (opener?.isConnected ? opener.focus() : null));
    });
  }

  /** Focus that lands outside the dialog (the scrim, the page) goes back to Cancel. */
  protected pullBack(event: Event): void {
    const target = event.target as Node | null;
    if (target && !this.host.nativeElement.contains(target)) {
      this.cancelButton().nativeElement.focus();
    }
  }

  /** Keep Tab and Shift+Tab inside the dialog. */
  protected onKey(event: Event): void {
    if ((event as KeyboardEvent).key === 'Tab') {
      trapTab(event, this.host.nativeElement, this.document, this.dialog().nativeElement);
    }
  }
}
