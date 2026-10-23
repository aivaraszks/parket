import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

let nextId = 0;

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
  host: { '[class.disabled]': 'disabled()' },
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

  protected onRange(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(value)) {
      this.changed.emit(value);
    }
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
