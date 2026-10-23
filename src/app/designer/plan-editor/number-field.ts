import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';

let nextId = 0;

/**
 * A labelled metre field for the shape editor (no slider). The value commits on blur or Enter;
 * nothing is clamped while typing. A value outside `min..max` is refused here ("Use x to y m");
 * other refusals come from the parent as `error`. Afterwards the field always shows the real value.
 */
@Component({
  selector: 'app-number-field',
  template: `
    <label class="label" [for]="inputId">{{ label() }}</label>
    <span class="number">
      <input
        #field
        class="num"
        type="text"
        inputmode="decimal"
        autocomplete="off"
        [id]="inputId"
        [value]="format(value())"
        [attr.aria-invalid]="message() ? 'true' : null"
        [attr.aria-describedby]="hintId"
        (input)="draft = $any($event.target).value"
        (blur)="commit()"
        (keydown.enter)="commit()"
      />
      <span class="unit" aria-hidden="true">{{ unit() }}</span>
    </span>
    @if (fixed()) {
      <span class="tag">Fixed</span>
    }
    <p class="hint" [id]="hintId" [class.error]="!!message()">
      @if (message(); as text) {
        <svg class="icon" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.5" />
          <path d="M8 4.5v4.2M8 10.6v1" stroke="currentColor" stroke-width="1.6" />
        </svg>
        {{ text }}
      } @else {
        {{ hint() }}
      }
    </p>
  `,
  styleUrl: './number-field.scss',
  host: { '[attr.data-field]': 'name()' },
})
export class NumberField {
  readonly label = input.required<string>();
  readonly value = input.required<number>();
  /** Stable name for tests and error routing. */
  readonly name = input('');
  readonly unit = input('m');
  readonly min = input<number>();
  readonly max = input<number>();
  readonly decimals = input(2);
  readonly hint = input('');
  /** Refusal text from the edit (shown until the next edit). */
  readonly error = input('');
  /** Shows the "Fixed" tag (the window field the last edit anchored). */
  readonly fixed = input(false);

  readonly committed = output<number>();
  /** Emitted with the reason when a typed value is refused here (for the live region). */
  readonly invalid = output<string>();

  private readonly id = nextId++;
  protected readonly inputId = `num-${this.id}`;
  protected readonly hintId = `num-${this.id}-hint`;
  private readonly injector = inject(Injector);
  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');
  protected draft: string | null = null;
  private readonly range = signal('');
  protected readonly message = computed(() => this.range() || this.error());

  constructor() {
    // A new value (another item, an undo) clears an old refusal.
    effect(() => {
      this.value();
      untracked(() => this.range.set(''));
    });
  }

  protected format(value: number): string {
    return value.toFixed(this.decimals());
  }

  protected commit(): void {
    const text = this.draft;
    if (text === null) {
      return;
    }
    this.draft = null;
    const trimmed = text.trim().replace(',', '.');
    const parsed = /^[+-]?(\d+\.?\d*|\.\d+)$/.test(trimmed) ? Number(trimmed) : NaN;
    const min = this.min();
    const max = this.max();
    this.range.set('');
    const outside =
      (min !== undefined && parsed < min - 1e-9) || (max !== undefined && parsed > max + 1e-9);
    if (!Number.isFinite(parsed) || outside) {
      const reason = this.rangeText();
      this.range.set(reason);
      this.invalid.emit(reason);
    } else if (Math.abs(parsed - this.value()) > 1e-9) {
      this.committed.emit(parsed);
    }
    // The bound text may be unchanged for Angular: write the real value into the DOM.
    const input = this.field().nativeElement;
    input.value = this.format(this.value());
    afterNextRender(() => (input.value = this.format(this.value())), { injector: this.injector });
  }

  private rangeText(): string {
    const min = this.min();
    const max = this.max();
    if (min !== undefined && max !== undefined) {
      return `Use ${this.format(min)} to ${this.format(max)} ${this.unit()}`;
    }
    if (min !== undefined) {
      return `Use ${this.format(min)} ${this.unit()} or more`;
    }
    return 'Enter a number.';
  }
}
