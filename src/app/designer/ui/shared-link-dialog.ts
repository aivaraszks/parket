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
import { MAX_PROJECTS, SHARED_PROJECT_NAME } from '../state/project-meta';
import { Design } from '../state/design-defaults';
import { shapeArea, toRoomShape } from '../plan/room-shape';
import { formatArea } from './format';
import { pullFocusBack, restoreFocus, trapTab } from './dialog-focus';

/** "“Kitchen”, custom shape, 14.00 m²." (plain text only). */
export function describeShared(name: string | null, design: Design): string {
  const kind = design.mode === 'custom' ? 'custom shape' : 'simple room';
  const area = formatArea(shapeArea(toRoomShape(design)));
  return `“${name ?? SHARED_PROJECT_NAME}”, ${kind}, ${area} m².`;
}

/** Alert dialog: add the design from a shared link as a new project? Focus starts on Cancel. */
@Component({
  selector: 'app-shared-link-dialog',
  template: `
    <div class="scrim" (click)="cancelled.emit()"></div>
    <div
      #dialog
      class="dialog"
      tabindex="-1"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="shared-link-title"
      aria-describedby="shared-link-body"
    >
      <h2 id="shared-link-title">Open shared design?</h2>
      <div id="shared-link-body" class="body">
        <p class="summary">{{ summary() }}</p>
        <p>It will be added as a new project. Your projects stay as they are.</p>
        @if (atLimit()) {
          <p class="warn">You have {{ limit }} projects. Delete one to add this design.</p>
        }
      </div>
      <div class="actions">
        <button #cancel type="button" class="btn" (click)="cancelled.emit()">Cancel</button>
        <button
          type="button"
          class="btn primary"
          data-add
          [attr.aria-disabled]="atLimit()"
          (click)="add()"
        >
          Add as new project
        </button>
      </div>
    </div>
  `,
  styleUrls: ['./colour-confirm-dialog.scss', './shared-link-dialog.scss'],
  host: {
    '(document:keydown.escape)': 'cancelled.emit()',
    '(document:keydown)': 'onKey($event)',
    '(document:focusin)': 'pullBack($event)',
  },
})
export class SharedLinkDialog {
  private readonly document = inject(DOCUMENT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly cancelButton = viewChild.required<ElementRef<HTMLButtonElement>>('cancel');
  private readonly dialog = viewChild.required<ElementRef<HTMLElement>>('dialog');
  private readonly opener = this.document.activeElement as HTMLElement | null;

  protected readonly limit = MAX_PROJECTS;

  readonly summary = input.required<string>();
  readonly atLimit = input(false);
  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  constructor() {
    afterNextRender(() => this.cancelButton().nativeElement.focus());
    inject(DestroyRef).onDestroy(() =>
      restoreFocus(this.document, '[data-trigger="projects"]', this.opener),
    );
  }

  protected add(): void {
    if (!this.atLimit()) {
      this.confirmed.emit();
    }
  }

  protected pullBack(event: Event): void {
    pullFocusBack(event, this.host.nativeElement, this.cancelButton().nativeElement);
  }

  protected onKey(event: Event): void {
    if ((event as KeyboardEvent).key !== 'Tab') {
      return;
    }
    trapTab(event, this.host.nativeElement, this.document, this.dialog().nativeElement);
  }
}
