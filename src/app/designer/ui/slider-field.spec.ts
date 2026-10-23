import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SCRUBBING_CLASS, SliderField } from './slider-field';

@Component({
  imports: [SliderField],
  template: `
    <app-slider-field
      label="Length"
      unit="m"
      [value]="value()"
      [min]="2"
      [max]="12"
      [step]="0.1"
      [numberStep]="0.01"
      [decimals]="2"
      [disabled]="disabled()"
      (changed)="onChanged($event)"
    />
  `,
})
class Host {
  readonly value = signal(5);
  readonly disabled = signal(false);
  readonly emitted: number[] = [];

  onChanged(value: number): void {
    this.emitted.push(value);
    this.value.set(value);
  }
}

@Component({
  imports: [SliderField],
  template: `<app-slider-field label="Width" [value]="5" [min]="2" [max]="12" [decimals]="2" />`,
})
class StubbornHost {}

function setup() {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const range = el.querySelector<HTMLInputElement>('input[type=range]')!;
  const num = el.querySelector<HTMLInputElement>('input[type=number]')!;
  const hint = (): string => el.querySelector('.hint')!.textContent!.replace(/\s+/g, ' ').trim();
  return { fixture, host: fixture.componentInstance, el, range, num, hint };
}

function typeInto(input: HTMLInputElement, text: string): void {
  input.value = text;
  input.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: text }));
}

describe('SliderField', () => {
  it('shows the value in both inputs, the unit and the range hint', () => {
    const { range, num, hint, el } = setup();
    expect(range.value).toBe('5');
    expect(num.value).toBe('5.00');
    expect(el.querySelector('.unit')?.textContent).toBe('m');
    expect(hint()).toBe('2.00 - 12.00 m');
  });

  it('labels both inputs and gives the slider a value text with the unit', () => {
    const { el, range } = setup();
    expect(el.querySelector(`label[for="${range.id}"]`)?.textContent).toBe('Length');
    expect(el.querySelector('label.visually-hidden')?.textContent).toContain('Length (number)');
    expect(range.getAttribute('aria-valuetext')).toBe('5.00 metres');
  });

  it('emits when the slider moves', () => {
    const { fixture, host, range } = setup();
    range.value = '7.5';
    range.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(host.emitted).toEqual([7.5]);
  });

  it('does not clamp while typing, shows the range hint, and clamps on blur', () => {
    const { fixture, host, num, hint } = setup();
    typeInto(num, '20');
    fixture.detectChanges();
    expect(host.emitted).toEqual([]);
    expect(hint()).toContain('Use 2.00 to 12.00 m');
    expect(num.getAttribute('aria-invalid')).toBe('true');

    num.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    expect(host.emitted).toEqual([12]);
    expect(num.value).toBe('12.00');
    expect(hint()).toBe('2.00 - 12.00 m');
  });

  it('commits a typed in-range value on Enter', () => {
    const { fixture, host, num } = setup();
    typeInto(num, '6.25');
    num.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    fixture.detectChanges();
    expect(host.emitted).toEqual([6.25]);
  });

  it('restores the last value when the number is left empty', () => {
    const { fixture, host, num } = setup();
    typeInto(num, '');
    num.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    expect(host.emitted).toEqual([]);
    expect(num.value).toBe('5.00');
  });

  it('disables both inputs', () => {
    const { fixture, host, range, num } = setup();
    host.disabled.set(true);
    fixture.detectChanges();
    expect(range.disabled).toBe(true);
    expect(num.disabled).toBe(true);
  });

  it('shows the real value after commit when the parent keeps the value unchanged', async () => {
    const fixture = TestBed.createComponent(StubbornHost);
    fixture.detectChanges();
    const num = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      'input[type=number]',
    )!;
    typeInto(num, '9');
    num.dispatchEvent(new Event('blur'));
    await fixture.whenStable();
    expect(num.value).toBe('5.00');
  });

  it('announces a refused value through a persistent polite live region', () => {
    const { fixture, el, num } = setup();
    const live = el.querySelector('[aria-live=polite]')!;
    expect(live.textContent?.trim()).toBe('');
    typeInto(num, '20');
    fixture.detectChanges();
    expect(el.querySelector('[aria-live=polite]')).toBe(live);
    expect(live.textContent).toContain('Use 2.00 to 12.00 m');
  });

  describe('scrubbing', () => {
    const host = (el: HTMLElement): HTMLElement => el.querySelector('app-slider-field')!;

    it('adds the scrubbing class and a value bubble while a pointer holds the thumb', () => {
      const { fixture, el, range } = setup();
      expect(host(el).classList.contains(SCRUBBING_CLASS)).toBe(false);
      expect(el.querySelector('.bubble')).toBeNull();

      range.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      fixture.detectChanges();
      expect(host(el).classList.contains(SCRUBBING_CLASS)).toBe(true);
      const bubble = el.querySelector('.bubble')!;
      expect(bubble.textContent).toBe('5.00 m');
      expect(bubble.getAttribute('aria-hidden')).toBe('true');

      window.dispatchEvent(new Event('pointerup'));
      fixture.detectChanges();
      expect(host(el).classList.contains(SCRUBBING_CLASS)).toBe(false);
      expect(el.querySelector('.bubble')).toBeNull();
    });

    it('follows the value while dragging and stops on pointercancel and lost capture', () => {
      const { fixture, el, range } = setup();
      range.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      range.value = '8';
      range.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(el.querySelector('.bubble')?.textContent).toBe('8.00 m');

      window.dispatchEvent(new Event('pointercancel'));
      fixture.detectChanges();
      expect(host(el).classList.contains(SCRUBBING_CLASS)).toBe(false);

      range.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      fixture.detectChanges();
      range.dispatchEvent(new Event('lostpointercapture'));
      fixture.detectChanges();
      expect(host(el).classList.contains(SCRUBBING_CLASS)).toBe(false);
    });

    it('does not scrub for the keyboard or the number field', () => {
      const { fixture, el, range, num } = setup();
      range.value = '6';
      range.dispatchEvent(new Event('input'));
      range.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
      typeInto(num, '7');
      fixture.detectChanges();
      expect(host(el).classList.contains(SCRUBBING_CLASS)).toBe(false);
      expect(el.querySelector('.bubble')).toBeNull();
    });

    it('does not scrub while disabled', () => {
      const { fixture, host: h, el, range } = setup();
      h.disabled.set(true);
      fixture.detectChanges();
      range.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      fixture.detectChanges();
      expect(host(el).classList.contains(SCRUBBING_CLASS)).toBe(false);
    });
  });
});
