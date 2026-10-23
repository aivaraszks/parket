import {
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { DesignState } from '../state/design-state';
import { EstimateLive, EstimateSummary, estimateName } from './estimate-summary';
import { SectionIcon } from './section-icon';
import { SectionId, SECTIONS } from './section-id';

/** The layouts where the dock becomes a vertical rail (see designer.scss). */
const RAIL_QUERY = '(min-width: 900px), (min-width: 560px) and (max-height: 499px)';

/**
 * Bottom dock on phones, right-edge rail on wide screens (CSS only). A toolbar of disclosure
 * buttons (not tabs): arrows move focus, Enter / Space opens or closes the section.
 */
@Component({
  selector: 'app-dock',
  imports: [SectionIcon, EstimateSummary, EstimateLive],
  templateUrl: './dock.html',
  styleUrl: './dock.scss',
})
export class Dock {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly design = inject(DesignState);

  /** The open section, or null. */
  readonly open = input<SectionId | null>(null);
  /** A dock button was activated (the shell opens, switches or closes). */
  readonly toggled = output<SectionId>();

  protected readonly sections = SECTIONS;
  protected readonly vertical = signal(false);
  /** Roving tab stop: the focused item, else the open one, else the first. */
  protected readonly tabStop = linkedSignal<SectionId | null, SectionId>({
    source: this.open,
    computation: (open, previous) => open ?? previous?.value ?? 'room',
  });
  protected readonly estimateLabel = computed(() =>
    estimateName(this.design.planksWithWaste(), this.design.floorArea()),
  );

  constructor() {
    const query = typeof matchMedia === 'function' ? matchMedia(RAIL_QUERY) : null;
    if (query && typeof query.addEventListener === 'function') {
      const update = (): void => this.vertical.set(query.matches);
      update();
      query.addEventListener('change', update);
      inject(DestroyRef).onDestroy(() => query.removeEventListener('change', update));
    }
  }

  /** True when the dock is laid out as the side rail (wide screens, landscape phones). */
  isRail(): boolean {
    return this.vertical();
  }

  /** Move focus to a section's button (after Escape or the tray's close button). */
  focusItem(id: SectionId): void {
    this.tabStop.set(id);
    this.button(id)?.focus();
  }

  protected onKeydown(event: KeyboardEvent): void {
    const ids = SECTIONS.map((s) => s.id);
    const current = ids.indexOf(this.tabStop());
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = (current + 1) % ids.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = (current - 1 + ids.length) % ids.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = ids.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    this.focusItem(ids[next]);
  }

  private button(id: SectionId): HTMLElement | null {
    return this.host.nativeElement.querySelector<HTMLElement>(`[data-section="${id}"]`);
  }
}
