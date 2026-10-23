import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach } from 'vitest';
import { Dock } from './dock';
import { SectionId } from './section-id';

@Component({
  imports: [Dock],
  template: `<app-dock [open]="open()" (toggled)="toggled.push($event)" />`,
})
class Host {
  readonly open = signal<SectionId | null>(null);
  readonly toggled: SectionId[] = [];
}

describe('Dock', () => {
  beforeEach(() => localStorage.clear());

  async function setup() {
    const fixture = TestBed.createComponent(Host);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const items = () => Array.from(el.querySelectorAll<HTMLButtonElement>('.item'));
    const key = (target: HTMLElement, k: string) =>
      target.dispatchEvent(
        new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }),
      );
    return { fixture, el, items, key };
  }

  it('is a toolbar of disclosure buttons, not tabs', async () => {
    const { el, items } = await setup();
    expect(el.querySelector('nav')?.getAttribute('aria-label')).toBe('Design sections');
    // A different name, so a screen reader does not hear the same label twice.
    expect(el.querySelector('[role=toolbar]')?.getAttribute('aria-label')).toBe('Open a section');
    expect(el.querySelector('[role=toolbar]')).not.toBeNull();
    expect(el.querySelectorAll('[role=tab]').length).toBe(0);
    for (const item of items()) {
      expect(item.getAttribute('aria-controls')).toBe('designer-tray');
      expect(item.getAttribute('aria-expanded')).toBe('false');
    }
    expect(items().map((i) => i.getAttribute('data-section'))).toEqual([
      'room',
      'floor',
      'colour',
      'light',
      'estimate',
    ]);
  });

  it('marks the open section with aria-expanded and a class', async () => {
    const { fixture, items } = await setup();
    fixture.componentInstance.open.set('light');
    await fixture.whenStable();
    expect(items()[3].getAttribute('aria-expanded')).toBe('true');
    expect(items()[3].classList.contains('open')).toBe(true);
    expect(items()[0].getAttribute('aria-expanded')).toBe('false');
  });

  it('emits the section when a button is activated', async () => {
    const { fixture, items } = await setup();
    items()[1].click();
    expect(fixture.componentInstance.toggled).toEqual(['floor']);
  });

  it('shows the planks count on the Estimate button with a result-carrying name', async () => {
    const { items } = await setup();
    const estimate = items()[4];
    expect(estimate.textContent).toContain('374');
    expect(estimate.textContent).toContain('planks');
    expect(estimate.getAttribute('aria-label')).toBe(
      'Estimate, 374 planks to buy, 20.00 square metres',
    );
    // Other buttons are named by their visible label.
    expect(items()[0].getAttribute('aria-label')).toBeNull();
  });

  it('has one tab stop that follows focus, and arrows move focus without opening', async () => {
    const { fixture, items, key } = await setup();
    expect(items().map((i) => i.tabIndex)).toEqual([0, -1, -1, -1, -1]);
    items()[0].focus();
    key(items()[0], 'ArrowRight');
    await fixture.whenStable();
    expect(document.activeElement).toBe(items()[1]);
    expect(items().map((i) => i.tabIndex)).toEqual([-1, 0, -1, -1, -1]);
    key(items()[1], 'ArrowDown');
    expect(document.activeElement).toBe(items()[2]);
    key(items()[2], 'ArrowUp');
    expect(document.activeElement).toBe(items()[1]);
    key(items()[1], 'End');
    expect(document.activeElement).toBe(items()[4]);
    key(items()[4], 'ArrowRight');
    expect(document.activeElement).toBe(items()[0]);
    key(items()[0], 'ArrowLeft');
    expect(document.activeElement).toBe(items()[4]);
    key(items()[4], 'Home');
    expect(document.activeElement).toBe(items()[0]);
    expect(fixture.componentInstance.toggled).toEqual([]);
  });

  it('keeps the live estimate region outside the buttons', async () => {
    const { el } = await setup();
    const live = el.querySelector('[aria-live=polite]')!;
    expect(live.closest('button')).toBeNull();
  });
});
