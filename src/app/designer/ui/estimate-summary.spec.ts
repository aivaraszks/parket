import { TestBed } from '@angular/core/testing';
import { DesignState } from '../state/design-state';
import { formatCount } from './format';
import { EstimateSummary, LIVE_DEBOUNCE_MS } from './estimate-summary';

describe('EstimateSummary', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => vi.useRealTimers());

  function setup() {
    const fixture = TestBed.createComponent(EstimateSummary);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const text = (id: string) =>
      el.querySelector(`[data-testid=${id}]`)!.textContent!.replace(/\s+/g, ' ').trim();
    return { fixture, state: TestBed.inject(DesignState), text, el };
  }

  it('shows area, planks to buy and the waste percent for the default room', () => {
    const { text } = setup();
    expect(text('summary')).toBe('20.00 m²·Buy 374 planks (incl. 12% waste)');
  });

  it('updates the visible line at once when the design changes', () => {
    const { fixture, state, text } = setup();
    state.setWastePercent(20);
    fixture.detectChanges();
    expect(text('summary')).toContain('(incl. 20% waste)');
  });

  it('announces one debounced sentence in a polite live region', () => {
    const { fixture, state, text, el } = setup();
    expect(el.querySelector('[aria-live=polite]')).not.toBeNull();
    expect(text('live')).toBe('');

    vi.advanceTimersByTime(LIVE_DEBOUNCE_MS);
    fixture.detectChanges();
    expect(text('live')).toBe('20.00 square metres, 374 planks including 12 percent waste');

    // Rapid changes (a slider drag) announce only the final value.
    state.setWastePercent(13);
    fixture.detectChanges();
    vi.advanceTimersByTime(LIVE_DEBOUNCE_MS - 100);
    state.setWastePercent(15);
    fixture.detectChanges();
    vi.advanceTimersByTime(LIVE_DEBOUNCE_MS - 100);
    fixture.detectChanges();
    expect(text('live')).toContain('12 percent');

    vi.advanceTimersByTime(100);
    fixture.detectChanges();
    expect(text('live')).toBe(
      `20.00 square metres, ${formatCount(state.planksWithWaste())} planks including 15 percent waste`,
    );
  });
});
