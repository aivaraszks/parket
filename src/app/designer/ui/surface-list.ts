import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  untracked,
} from '@angular/core';
import { sameSurface, SurfaceRef } from '../plan/paint';
import { ColouringState } from '../state/colouring-state';
import { SurfaceItem, whatOf, whatOptions, whichItems } from './surface-model';

let nextId = 0;

/**
 * What to colour and which one, as two rows of radio chips (docs/ux/dock-redesign.md). Each row is
 * a native radio group: one tab stop, arrows move and select. The Which row keeps its height in
 * every state, so a tap never resizes the tray.
 */
@Component({
  selector: 'app-surface-list',
  templateUrl: './surface-list.html',
  styleUrl: './surface-list.scss',
})
export class SurfaceList {
  private readonly colouring = inject(ColouringState);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  readonly items = input.required<readonly SurfaceItem[]>();

  private readonly uid = nextId++;
  protected readonly whatName = `what-${this.uid}`;
  protected readonly whichName = `which-${this.uid}`;
  protected readonly selected = this.colouring.selected;
  protected readonly whats = computed(() => whatOptions(this.items()));
  protected readonly what = computed(() => whatOf(this.selected()));
  protected readonly whichs = computed(() => whichItems(this.items(), this.what()));
  /** The note that holds the Which row for a single-item group. */
  protected readonly note = computed(() => {
    const what = this.what();
    return what === 'ceiling' ? 'Whole ceiling.' : what === 'skirting' ? 'All skirting.' : '';
  });

  constructor() {
    // A selection made elsewhere (a 3D tap) brings its chips into view; focus does not move.
    effect(() => {
      this.selected();
      untracked(() =>
        afterNextRender(
          () =>
            this.host.nativeElement
              .querySelectorAll<HTMLElement>('input:checked')
              .forEach((input) =>
                input.parentElement?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }),
              ),
          { injector: this.injector },
        ),
      );
    });
  }

  protected isSelected(ref: SurfaceRef): boolean {
    return sameSurface(this.selected(), ref);
  }

  protected pick(ref: SurfaceRef): void {
    this.colouring.select(ref, 'list');
  }
}
