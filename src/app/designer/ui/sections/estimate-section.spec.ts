import { TestBed } from '@angular/core/testing';
import { DesignState } from '../../state/design-state';
import { EstimateSection } from './estimate-section';

describe('EstimateSection', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  function setup() {
    const fixture = TestBed.createComponent(EstimateSection);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el, state: TestBed.inject(DesignState) };
  }

  const text = (el: HTMLElement): string => el.textContent!.replace(/\s+/g, ' ');

  it('leads with the planks to buy and the area with waste', () => {
    const { el } = setup();
    expect(el.querySelector('.big')?.textContent).toBe('374 planks to buy');
    expect(el.querySelector('.sub')?.textContent?.trim()).toBe('22.40 m² incl. 12% waste');
    expect(el.querySelector('h2')).toBeNull();
  });

  it('keeps the other results under More', () => {
    const { el } = setup();
    const more = el.querySelector('details.more')!;
    expect(more.querySelector('summary')?.textContent).toBe('Details and how it is calculated');
    expect(more.hasAttribute('open')).toBe(false);
    expect(text(more as HTMLElement)).toContain('Floor area20.00 m²');
    expect(text(more as HTMLElement)).toContain('Planks needed (no waste)334');
  });

  it('changes the waste allowance through the slider field', () => {
    const { fixture, el, state } = setup();
    const range = el.querySelector<HTMLInputElement>('input[type=range]')!;
    range.value = '20';
    range.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(state.wastePercent()).toBe(20);
    expect(el.querySelector('.sub')?.textContent).toContain('24.00 m² incl. 20% waste');
  });

  it('shows the skirting length and the polygon wording', () => {
    const { el } = setup();
    expect(text(el)).toContain('Skirting length');
    expect(text(el)).toContain('Walls minus doors');
    expect(text(el)).toContain('18.0 m');
    expect(text(el)).toContain('Estimate for the floor area of your room.');
    expect(text(el)).not.toContain('rectangular');
  });

  it('has no Reset (it lives in the Projects menu)', () => {
    const { el } = setup();
    expect(el.querySelector('button')).toBeNull();
    expect(text(el)).not.toContain('Reset');
  });
});
