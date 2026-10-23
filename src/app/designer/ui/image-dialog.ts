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

/** Fallback for browsers that cannot download: shows the image so it can be long-pressed. */
@Component({
  selector: 'app-image-dialog',
  template: `
    <div class="scrim" (click)="closed.emit()"></div>
    <div
      class="dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="image-dialog-title"
      (keydown.escape)="closed.emit()"
      (keydown.tab)="trap($event)"
    >
      <h2 id="image-dialog-title">Image ready</h2>
      <p>Press and hold the image, then choose "Save to Photos".</p>
      <img [src]="url()" alt="Your floor design" />
      <a class="link" [href]="url()" target="_blank" rel="noopener">Open image</a>
      <button #close type="button" class="btn primary" (click)="closed.emit()">Close</button>
    </div>
  `,
  styleUrl: './image-dialog.scss',
})
export class ImageDialog {
  private readonly document = inject(DOCUMENT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly closeButton = viewChild.required<ElementRef<HTMLButtonElement>>('close');
  private readonly opener = this.document.activeElement as HTMLElement | null;

  readonly url = input.required<string>();
  readonly closed = output<void>();

  constructor() {
    afterNextRender(() => this.closeButton().nativeElement.focus());
    inject(DestroyRef).onDestroy(() => this.opener?.focus());
  }

  /** Keep Tab inside the dialog. */
  protected trap(event: Event): void {
    const keyboard = event as KeyboardEvent;
    const items = Array.from(
      this.host.nativeElement.querySelectorAll<HTMLElement>('a[href], button'),
    );
    const first = items[0];
    const last = items[items.length - 1];
    const active = this.document.activeElement;
    if (keyboard.shiftKey && active === first) {
      keyboard.preventDefault();
      last.focus();
    } else if (!keyboard.shiftKey && active === last) {
      keyboard.preventDefault();
      first.focus();
    }
  }
}
