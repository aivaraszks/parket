import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

let nextId = 0;

/**
 * CONTRACT (dock-redesign D5): while a pointer holds the range thumb, the host carries this class
 * (pointerdown on the range until pointerup / pointercancel / lostpointercapture; never for the
 * keyboard). The tray CSS reads it as "app-slider-field.scrubbing". */
export const SCRUBBING_CLASS = 'scrubbing';

const UNIT_NAMES: Record<string, string> = {
  m: 'metres',
  mm: 'millimetres',
  deg: 'degrees',
  '%': 'percent',
  x: 'times',
};

/** A labelled range slider paired with a number input; both show the same value. */
@Component({
  selector: 'app-slider-field',
  templateUrl: './slider-field.html',
  styleUrl: './slider-field.scss',
  host: { '[class.disabled]': 'disabled()', '[class.scrubbing]': 'scrubbing()' },
})
export class SliderField {
  readonly label = input.required<string>();
  readonly value = input.required<number>();
  /** m, mm, deg, % or x. */
  readonly unit = input('');
  /** Absolute limits, used to clamp typed numbers. */
  readonly min = input.required<number>();
  readonly max = input.required<number>();
  /** Slider step; also the number input step unless `numberStep` is set. */
  readonly step = input(1);
  readonly numberStep = input<number>();
  readonly decimals = input(0);
  /** Narrower range the slider can reach right now (dynamic limits); defaults to min/max. */
  readonly rangeMin = input<number>();
  readonly rangeMax = input<number>();
  readonly disabled = input(false);
  /** Decorative tick marks, as values within min..max. */
  readonly ticks = input<readonly number[]>([]);
  /** Extra helper text under the slider. */
  readonly note = input('');
  /** Error text from the parent (for example a rule the state enforced). */
  readonly error = input('');

  readonly changed = output<number>();

  private readonly id = `slider-${nextId++}`;
  protected readonly rangeId = `${this.id}-range`;
  protected readonly numberId = `${this.id}-number`;
  protected readonly hintId = `${this.id}-hint`;

  private readonly injector = inject(Injector);
  private readonly numberInput = viewChild.required<ElementRef<HTMLInputElement>>('numberInput');
  protected readonly draft = signal<string | null>(null);
  private readonly bubble = viewChild<ElementRef<HTMLElement>>('bubble');

  /** True while a pointer holds the thumb (never for the keyboard). */
  protected readonly scrubbing = signal(false);
  /** Viewport position (px) of the point above the thumb centre, for the fixed bubble. */
  protected readonly bubblePos = signal({ x: 0, y: 0 });
  private stopScrub: (() => void) | null = null;

  protected readonly effectiveMin = computed(() => this.rangeMin() ?? this.min());
  protected readonly effectiveMax = computed(() => this.rangeMax() ?? this.max());
  protected readonly unitLabel = computed(() => (this.unit() === 'deg' ? '°' : this.unit()));
  protected readonly valueText = computed(() => {
    const name = UNIT_NAMES[this.unit()] ?? this.unit();
    return `${this.format(this.value())} ${name}`.trim();
  });
  protected readonly numberText = computed(() => this.draft() ?? this.format(this.value()));
  protected readonly rangeText = computed(
    () =>
      `${this.format(this.effectiveMin())} - ${this.format(this.effectiveMax())}${this.suffix()}`,
  );
  protected readonly fill = computed(() => this.fraction(this.value()) * 100);
  protected readonly tickMarks = computed(() =>
    this.ticks().map((value) => ({ value, fraction: this.fraction(value) })),
  );

  protected readonly errorText = computed(() => {
    const draft = this.draft();
    if (draft !== null && this.parse(draft) === null) {
      return `Use ${this.format(this.min())} to ${this.format(this.max())}${this.suffix()}`;
    }
    return this.error();
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stopScrub?.());
  }

  protected onRange(event: Event): void {
    const range = event.target as HTMLInputElement;
    const value = Number(range.value);
    if (Number.isFinite(value)) {
      this.changed.emit(value);
      if (this.scrubbing()) {
        this.placeBubble(range, value);
      }
    }
  }

  protected startScrub(event: Event): void {
    if (this.disabled() || this.scrubbing()) {
      return;
    }
    const range = event.target as HTMLInputElement;
    this.placeBubble(range, Number(range.value));
    this.scrubbing.set(true);
    const end = (): void => this.endScrub();
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    this.stopScrub = () => {
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
    // A popover sits in the top layer: a transformed or filtered tray cannot offset its fixed position.
    afterNextRender(() => this.bubble()?.nativeElement.showPopover?.(), {
      injector: this.injector,
    });
  }

  protected endScrub(): void {
    if (!this.scrubbing()) {
      return;
    }
    this.stopScrub?.();
    this.stopScrub = null;
    const el = this.bubble()?.nativeElement;
    if (el?.matches(':popover-open')) {
      el.hidePopover();
    }
    this.scrubbing.set(false);
  }

  private placeBubble(range: HTMLInputElement, value: number): void {
    const rect = range.getBoundingClientRect();
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const thumb = (parseFloat(getComputedStyle(range).getPropertyValue('--thumb-size')) || 0) * rem;
    const min = this.effectiveMin();
    const span = this.effectiveMax() - min;
    const fraction = span > 0 ? Math.min(1, Math.max(0, (value - min) / span)) : 0;
    const x = rect.left + thumb / 2 + (rect.width - thumb) * fraction;
    const half = 32; // about half the bubble width, keeps it inside the viewport
    this.bubblePos.set({
      x: Math.min(window.innerWidth - half, Math.max(half, x)),
      y: rect.top + rect.height / 2 - thumb / 2,
    });
  }

  protected onNumberInput(event: Event): void {
    const text = (event.target as HTMLInputElement).value;
    this.draft.set(text);
    // Spinner and arrow-key steps are not typing: apply them at once.
    if (!(event instanceof InputEvent && event.inputType) && this.parse(text) !== null) {
      this.commit();
    }
  }

  protected commit(): void {
    const text = this.draft();
    if (text === null) {
      return;
    }
    const parsed = Number(text);
    let shown = this.value();
    if (text.trim() !== '' && Number.isFinite(parsed)) {
      shown = Math.min(this.max(), Math.max(this.min(), parsed));
      this.changed.emit(shown);
    }
    this.draft.set(null);
    // The bound text may be unchanged from Angular's point of view, so write the DOM directly.
    this.numberInput().nativeElement.value = this.format(shown);
    // The parent may clamp further (dynamic limits) and leave the value unchanged: show the real one.
    afterNextRender(
      () => {
        this.numberInput().nativeElement.value = this.format(this.value());
      },
      { injector: this.injector },
    );
  }

  private parse(text: string): number | null {
    const value = Number(text);
    if (text.trim() === '' || !Number.isFinite(value)) {
      return null;
    }
    return value >= this.min() && value <= this.max() ? value : null;
  }

  private fraction(value: number): number {
    const span = this.effectiveMax() - this.effectiveMin();
    return span > 0 ? Math.min(1, Math.max(0, (value - this.effectiveMin()) / span)) : 0;
  }

  /** The value as the bubble shows it, for example "45°" or "120%". */
  protected readonly bubbleText = computed(() => {
    const unit = this.unit();
    const text = this.format(this.value());
    if (!unit) return text;
    return unit === 'deg' || unit === '%' ? `${text}${this.unitLabel()}` : `${text} ${unit}`;
  });

  private format(value: number): string {
    return value.toFixed(this.decimals());
  }

  private suffix(): string {
    const unit = this.unit();
    if (!unit) {
      return '';
    }
    return unit === 'deg' ? '°' : ` ${unit}`;
  }
}
