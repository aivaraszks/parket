import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SceneCommands } from '../scene/scene-commands';
import { CameraMenu } from './camera-menu';

describe('CameraMenu', () => {
  const status = signal('ready');
  const scene = { setPreset: vi.fn(), zoom: vi.fn(), status };

  beforeEach(() => {
    status.set('ready');
    scene.setPreset.mockReset();
    scene.zoom.mockReset();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: SceneCommands, useValue: scene }] });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  async function setup() {
    const fixture = TestBed.createComponent(CameraMenu);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const flush = async () => {
      await new Promise((r) => setTimeout(r, 0));
      fixture.detectChanges();
      await fixture.whenStable();
    };
    const q = (sel: string) => el.querySelector<HTMLElement>(sel)!;
    return { fixture, el, flush, q, trigger: q('[data-trigger=camera]') };
  }

  const escape = () => {
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.activeElement!.dispatchEvent(event);
    return event;
  };

  it('has an icon trigger named Camera that opens the popover and focuses the first item', async () => {
    const { el, flush, trigger } = await setup();
    expect(trigger.getAttribute('aria-label')).toBe('Camera');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    trigger.click();
    await flush();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const items = el.querySelectorAll<HTMLElement>('#camera-popover .item');
    expect(Array.from(items).map((i) => i.querySelector('span')?.textContent)).toEqual([
      'Corner',
      'Doorway',
      'Top-down',
      'Zoom in',
      'Zoom out',
      'How to look around',
    ]);
    expect(document.activeElement).toBe(items[0]);
  });

  it('a preset calls the scene, closes the menu and returns focus to the trigger', async () => {
    const { el, flush, trigger } = await setup();
    trigger.click();
    await flush();
    el.querySelectorAll<HTMLElement>('#camera-popover .item')[1].click();
    await flush();
    expect(scene.setPreset).toHaveBeenCalledWith('doorway');
    expect(el.querySelector('#camera-popover')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('zoom items call the scene and close the menu', async () => {
    const { el, flush, trigger } = await setup();
    trigger.click();
    await flush();
    el.querySelectorAll<HTMLElement>('#camera-popover .item')[3].click();
    expect(scene.zoom).toHaveBeenCalledWith(1);
    trigger.click();
    await flush();
    el.querySelectorAll<HTMLElement>('#camera-popover .item')[4].click();
    expect(scene.zoom).toHaveBeenCalledWith(-1);
    await flush();
    expect(el.querySelector('#camera-popover')).toBeNull();
  });

  it('inline presets (shown from 1200px) call the scene', async () => {
    const { el } = await setup();
    const inline = Array.from(el.querySelectorAll<HTMLElement>('.group.inline button'));
    expect(inline.map((b) => b.textContent?.trim())).toEqual(['Corner', 'Doorway', 'Top-down']);
    inline[2].click();
    expect(scene.setPreset).toHaveBeenCalledWith('top');
  });

  it('How to look around expands the help in place and keeps the menu open', async () => {
    const { el, q, flush, trigger } = await setup();
    trigger.click();
    await flush();
    const toggle = q('.help-toggle');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('#camera-help')).toBeNull();
    toggle.click();
    await flush();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(q('#camera-help').textContent).toContain('Arrow keys to look around');
    expect(el.querySelector('#camera-popover')).not.toBeNull();
    toggle.click();
    await flush();
    expect(el.querySelector('#camera-help')).toBeNull();
  });

  it('Escape closes the menu, returns focus to the trigger and is handled here', async () => {
    const { el, flush, trigger } = await setup();
    trigger.click();
    await flush();
    const event = escape();
    await flush();
    expect(event.defaultPrevented).toBe(true);
    expect(el.querySelector('#camera-popover')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('Escape with the menu closed is left alone', async () => {
    const { trigger } = await setup();
    trigger.focus();
    expect(escape().defaultPrevented).toBe(false);
  });

  it('a click outside closes the menu but a click inside does not', async () => {
    const { el, q, flush, trigger } = await setup();
    trigger.click();
    await flush();
    q('#camera-popover').click();
    await flush();
    expect(el.querySelector('#camera-popover')).not.toBeNull();
    document.body.click();
    await flush();
    expect(el.querySelector('#camera-popover')).toBeNull();
  });

  it('tabbing out of the menu closes it', async () => {
    const { el, flush, trigger } = await setup();
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    trigger.click();
    await flush();
    el.querySelector<HTMLElement>('#camera-popover .item')!.dispatchEvent(
      new FocusEvent('focusout', { bubbles: true, relatedTarget: outside }),
    );
    await flush();
    expect(el.querySelector('#camera-popover')).toBeNull();
  });

  it('toggling the trigger twice closes the menu', async () => {
    const { el, flush, trigger } = await setup();
    trigger.click();
    await flush();
    trigger.click();
    await flush();
    expect(el.querySelector('#camera-popover')).toBeNull();
  });

  it('without a 3D view the trigger is aria-disabled with a tooltip and does nothing', async () => {
    status.set('no-webgl');
    const { el, flush, trigger } = await setup();
    expect(trigger.getAttribute('aria-disabled')).toBe('true');
    expect(trigger.title).toBe('Needs 3D view');
    trigger.click();
    el.querySelector<HTMLElement>('.group.inline button')!.click();
    await flush();
    expect(el.querySelector('#camera-popover')).toBeNull();
    expect(scene.setPreset).not.toHaveBeenCalled();
  });

  it('while the 3D view loads it is disabled without a tooltip', async () => {
    status.set('loading');
    const { trigger } = await setup();
    expect(trigger.getAttribute('aria-disabled')).toBe('true');
    expect(trigger.hasAttribute('title')).toBe(false);
  });
});
