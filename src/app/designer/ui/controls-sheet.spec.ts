import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ControlsSheet } from './controls-sheet';

describe('ControlsSheet', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  async function setup() {
    const fixture = TestBed.createComponent(ControlsSheet);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const flush = async () => {
      fixture.detectChanges();
      await fixture.whenStable();
    };
    return { fixture, el, flush };
  }

  const tabs = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLElement>('[role=tab]'));
  const handle = (el: HTMLElement) => el.querySelector<HTMLButtonElement>('button.handle')!;

  function drag(button: HTMLElement, from: number, to: number) {
    button.dispatchEvent(new PointerEvent('pointerdown', { clientY: from, pointerId: 1 }));
    button.dispatchEvent(new PointerEvent('pointerup', { clientY: to, pointerId: 1 }));
  }

  it('starts peeked on the Room tab with a collapsed handle', async () => {
    const { el } = await setup();
    expect(el.className).toContain('stop-peek');
    expect(handle(el).getAttribute('aria-expanded')).toBe('false');
    expect(tabs(el)[0].getAttribute('aria-selected')).toBe('true');
    expect(el.querySelectorAll('[role=tabpanel]').length).toBe(1);
  });

  it('makes the body inert while peeked so hidden controls cannot be tabbed to', async () => {
    const { el, flush } = await setup();
    const body = el.querySelector('.body')!;
    expect(body.hasAttribute('inert')).toBe(true);
    handle(el).click();
    await flush();
    expect(body.hasAttribute('inert')).toBe(false);
  });

  it('handle click toggles peek and half', async () => {
    const { fixture, el, flush } = await setup();
    handle(el).click();
    await flush();
    expect(fixture.componentInstance.stop()).toBe('half');
    expect(handle(el).getAttribute('aria-expanded')).toBe('true');
    handle(el).click();
    await flush();
    expect(fixture.componentInstance.stop()).toBe('peek');
  });

  it('tapping a tab on a peeked sheet opens it; tapping the active tab collapses', async () => {
    const { fixture, el, flush } = await setup();
    tabs(el)[2].click();
    await flush();
    expect(fixture.componentInstance.stop()).toBe('half');
    expect(fixture.componentInstance.tab()).toBe('floor');
    tabs(el)[3].click();
    await flush();
    expect(fixture.componentInstance.stop()).toBe('half');
    expect(fixture.componentInstance.tab()).toBe('light');
    tabs(el)[3].click();
    await flush();
    expect(fixture.componentInstance.stop()).toBe('peek');
  });

  it('dragging up and down moves one stop and clamps at the ends', async () => {
    const { fixture, el } = await setup();
    const stop = () => fixture.componentInstance.stop();
    drag(handle(el), 500, 400);
    expect(stop()).toBe('half');
    drag(handle(el), 500, 400);
    expect(stop()).toBe('full');
    drag(handle(el), 500, 400);
    expect(stop()).toBe('full');
    drag(handle(el), 400, 500);
    expect(stop()).toBe('half');
    drag(handle(el), 400, 500);
    drag(handle(el), 400, 500);
    expect(stop()).toBe('peek');
  });

  it('a small movement is a tap, not a drag', async () => {
    const { fixture, el } = await setup();
    drag(handle(el), 500, 490);
    expect(fixture.componentInstance.stop()).toBe('peek');
  });

  it('the click that ends a drag does not toggle the sheet', async () => {
    const { fixture, el, flush } = await setup();
    drag(handle(el), 500, 400);
    handle(el).click();
    await flush();
    expect(fixture.componentInstance.stop()).toBe('half');
    handle(el).click();
    await flush();
    expect(fixture.componentInstance.stop()).toBe('peek');
  });

  it('pointerup without pointerdown is ignored', async () => {
    const { fixture, el } = await setup();
    handle(el).dispatchEvent(new PointerEvent('pointerup', { clientY: 0 }));
    expect(fixture.componentInstance.stop()).toBe('peek');
  });

  it('keyboard: arrows, Home and End move between tabs and focus follows', async () => {
    const { fixture, el, flush } = await setup();
    const key = (k: string) => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }),
      );
    };
    tabs(el)[0].focus();
    key('ArrowRight');
    await flush();
    expect(fixture.componentInstance.tab()).toBe('surfaces');
    expect(document.activeElement).toBe(tabs(el)[1]);
    key('ArrowLeft');
    key('ArrowLeft');
    await flush();
    expect(fixture.componentInstance.tab()).toBe('estimate');
    key('Home');
    await flush();
    expect(fixture.componentInstance.tab()).toBe('room');
    key('End');
    await flush();
    expect(fixture.componentInstance.tab()).toBe('estimate');
    // Arrow keys do not open a peeked sheet.
    expect(fixture.componentInstance.stop()).toBe('peek');
    expect(tabs(el).map((t) => t.getAttribute('tabindex'))).toEqual(['-1', '-1', '-1', '-1', '0']);
  });

  it('labels the panel by its tab', async () => {
    const { el } = await setup();
    const panel = el.querySelector('[role=tabpanel]')!;
    expect(panel.getAttribute('aria-labelledby')).toBe(tabs(el)[0].id);
    expect(tabs(el)[0].getAttribute('aria-controls')).toBe(panel.id);
  });
});
