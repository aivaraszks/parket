import { TestBed } from '@angular/core/testing';
import { DesignState } from '../state/design-state';
import { formatCount } from './format';
import { EstimateLive, EstimateSummary, estimateName, LIVE_DEBOUNCE_MS } from './estimate-summary';

describe('EstimateSummary', () => {
  beforeEach(() => localStorage.clear());

  it('shows the planks to buy over the word "planks"', () => {
    const fixture = TestBed.createComponent(EstimateSummary);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.count')?.textContent?.trim()).toBe('374');
    expect(el.querySelector('.unit')?.textContent?.trim()).toBe('planks');
    TestBed.inject(DesignState).setWastePercent(20);
    fixture.detectChanges();
    expect(el.querySelector('.count')?.textContent?.trim()).toBe('400');
  });

  it('separates the count and the word with a space, so the visible text is "374 planks" (WCAG 2.5.3 / axe label-content-name-mismatch)', () => {
    const fixture = TestBed.createComponent(EstimateSummary);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toMatch(/\d\s+planks/);
    expect(estimateName(374, 22.4)).toContain('374 planks');
  });

  it('builds the accessible name from the result, containing the visible text', () => {
    expect(estimateName(374, 22.4)).toBe('Estimate, 374 planks to buy, 22.40 square metres');
    expect(estimateName(1234, 20)).toContain('1,234 planks');
  });
});

describe('EstimateLive', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => vi.useRealTimers());

  it('announces one debounced sentence in a polite live region', () => {
    const fixture = TestBed.createComponent(EstimateLive);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const state = TestBed.inject(DesignState);
    const text = () => el.querySelector('[data-testid=live]')!.textContent!.trim();
    expect(el.querySelector('[aria-live=polite]')).not.toBeNull();
    expect(text()).toBe('');

    vi.advanceTimersByTime(LIVE_DEBOUNCE_MS);
    fixture.detectChanges();
    expect(text()).toBe('20.00 square metres, 374 planks including 12 percent waste');

    // Rapid changes (a slider drag) announce only the final value.
    state.setWastePercent(13);
    fixture.detectChanges();
    vi.advanceTimersByTime(LIVE_DEBOUNCE_MS - 100);
    state.setWastePercent(15);
    fixture.detectChanges();
    vi.advanceTimersByTime(LIVE_DEBOUNCE_MS - 100);
    fixture.detectChanges();
    expect(text()).toContain('12 percent');

    vi.advanceTimersByTime(100);
    fixture.detectChanges();
    expect(text()).toBe(
      `20.00 square metres, ${formatCount(state.planksWithWaste())} planks including 15 percent waste`,
    );
  });
});
