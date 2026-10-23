import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { beforeEach, describe, expect, it } from 'vitest';
import { SectionId } from './section-id';
import { Tray } from './tray';

@Component({
  imports: [Tray],
  template: `<app-tray [section]="section()" (closed)="closed = closed + 1" />`,
})
class Host {
  readonly section = signal<SectionId | null>(null);
  closed = 0;
}

describe('Tray', () => {
  beforeEach(() => localStorage.clear());

  async function setup() {
    const fixture = TestBed.createComponent(Host);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el, tray: el.querySelector<HTMLElement>('#designer-tray')! };
  }

  it('is in the DOM but hidden and empty while no section is open', async () => {
    const { tray } = await setup();
    expect(tray.hidden).toBe(true);
    expect(tray.querySelector('h2')).toBeNull();
    expect(tray.querySelector('button')).toBeNull();
  });

  it('is a region labelled by its heading, which can take focus', async () => {
    const { fixture, tray } = await setup();
    fixture.componentInstance.section.set('floor');
    await fixture.whenStable();
    expect(tray.hidden).toBe(false);
    const region = tray.querySelector('[role=region]')!;
    const heading = tray.querySelector('h2')!;
    expect(region.getAttribute('aria-labelledby')).toBe(heading.id);
    expect(heading.textContent?.trim()).toBe('Floor');
    expect(heading.getAttribute('tabindex')).toBe('-1');
    fixture.debugElement.query(By.directive(Tray)).componentInstance.focusHeading();
    expect(document.activeElement).toBe(heading);
  });

  it('switches the section content and heading', async () => {
    const { fixture, tray } = await setup();
    fixture.componentInstance.section.set('light');
    await fixture.whenStable();
    expect(tray.querySelector('h2')?.textContent?.trim()).toBe('Light');
    expect(tray.querySelector('app-light-section')).not.toBeNull();
    fixture.componentInstance.section.set('estimate');
    await fixture.whenStable();
    expect(tray.querySelector('h2')?.textContent?.trim()).toBe('Estimate');
    expect(tray.querySelector('app-light-section')).toBeNull();
  });

  it('has a close button named after the section', async () => {
    const { fixture, tray } = await setup();
    fixture.componentInstance.section.set('floor');
    await fixture.whenStable();
    const close = tray.querySelector<HTMLButtonElement>('.tray-close')!;
    expect(close.getAttribute('aria-label')).toBe('Close Floor');
    close.click();
    expect(fixture.componentInstance.closed).toBe(1);
  });

  it('knows when a slider is being scrubbed', async () => {
    const { fixture, tray } = await setup();
    fixture.componentInstance.section.set('floor');
    await fixture.whenStable();
    const tr = fixture.debugElement.query(By.directive(Tray)).componentInstance as Tray;
    expect(tr.isScrubbing()).toBe(false);
    const field = document.createElement('app-slider-field');
    field.className = 'scrubbing';
    tray.appendChild(field);
    expect(tr.isScrubbing()).toBe(true);
  });
});
