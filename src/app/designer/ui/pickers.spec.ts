import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { Finish } from '../state/design-defaults';
import { COLOR_PRESETS, SPECIES } from '../state/species';
import { FinishControl } from './finish-control';
import { SwatchGroup } from './swatch-group';
import { WoodPicker } from './wood-picker';

@Component({
  imports: [WoodPicker, SwatchGroup, FinishControl],
  template: `
    <app-wood-picker [species]="species" [value]="wood()" (picked)="wood.set($event)" />
    <app-swatch-group
      legend="Wall colour"
      customLabel="Custom wall colour"
      [presets]="presets"
      [value]="colour()"
      (picked)="colour.set($event)"
    />
    <app-finish-control [value]="finish()" (picked)="finish.set($event)" />
  `,
})
class Host {
  readonly species = SPECIES;
  readonly presets = COLOR_PRESETS;
  readonly wood = signal('golden-oak');
  readonly colour = signal('#efe9df');
  readonly finish = signal<Finish>('satin');
}

function setup() {
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, host: fixture.componentInstance, el };
}

describe('WoodPicker', () => {
  it('shows a legend and one named radio per species, with the current one checked', () => {
    const { el } = setup();
    const picker = el.querySelector('app-wood-picker')!;
    expect(picker.querySelector('legend')?.textContent).toBe('Wood');
    expect(picker.querySelectorAll('input[type=radio]').length).toBe(SPECIES.length);
    expect(picker.querySelector<HTMLInputElement>('input:checked')?.value).toBe('golden-oak');
    expect(picker.textContent).toContain(SPECIES[3].name);
  });

  it('emits the picked species', () => {
    const { fixture, host, el } = setup();
    el.querySelector<HTMLInputElement>('app-wood-picker input[value=ash]')!.click();
    fixture.detectChanges();
    expect(host.wood()).toBe('ash');
    expect(el.querySelector<HTMLInputElement>('app-wood-picker input:checked')?.value).toBe('ash');
  });
});

describe('SwatchGroup', () => {
  it('shows the legend, named presets and a custom colour input', () => {
    const { el } = setup();
    const group = el.querySelector('app-swatch-group')!;
    expect(group.querySelector('legend')?.textContent).toBe('Wall colour');
    expect(group.querySelector('input[aria-label="Sand"]')).not.toBeNull();
    expect(
      group.querySelector('input[type=color][aria-label="Custom wall colour"]'),
    ).not.toBeNull();
    expect(group.querySelector<HTMLInputElement>('input[type=radio]:checked')?.value).toBe(
      '#efe9df',
    );
  });

  it('emits preset and custom colours', () => {
    const { fixture, host, el } = setup();
    el.querySelector<HTMLInputElement>('app-swatch-group input[aria-label="Sand"]')!.click();
    fixture.detectChanges();
    expect(host.colour()).toBe('#d2bfa0');
    const custom = el.querySelector<HTMLInputElement>('input[type=color]')!;
    custom.value = '#123456';
    custom.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(host.colour()).toBe('#123456');
    expect(el.querySelector('app-swatch-group input[type=radio]:checked')).toBeNull();
  });
});

describe('FinishControl', () => {
  it('shows the three finishes and the hint for the current one', () => {
    const { el } = setup();
    const control = el.querySelector('app-finish-control')!;
    expect(control.querySelector('legend')?.textContent).toBe('Finish');
    expect(Array.from(control.querySelectorAll('.face')).map((f) => f.textContent)).toEqual([
      'Matte',
      'Satin',
      'Gloss',
    ]);
    expect(control.querySelector('.hint')?.textContent).toBe('Soft sheen');
  });

  it('emits the picked finish and updates the hint', () => {
    const { fixture, host, el } = setup();
    el.querySelector<HTMLInputElement>('app-finish-control input[value=gloss]')!.click();
    fixture.detectChanges();
    expect(host.finish()).toBe('gloss');
    expect(el.querySelector('app-finish-control .hint')?.textContent).toContain('Lacquered');
  });
});
