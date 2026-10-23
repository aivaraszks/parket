import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SceneCommands } from '../scene/scene-commands';
import { ColouringState } from '../state/colouring-state';
import { ShareLink } from '../share/share-link';
import { ImageExport } from './image-export';
import { ViewToolbar } from './view-toolbar';

describe('ViewToolbar', () => {
  const status = signal('ready');
  const scene = { setPreset: vi.fn(), zoom: vi.fn(), exportPng: vi.fn(), status };
  const busy = signal(false);
  const exporter = { busy, save: vi.fn() };
  const shareBusy = signal(false);
  const shareLink = { busy: shareBusy, share: vi.fn(), projectName: () => 'Kitchen' };

  beforeEach(() => {
    status.set('ready');
    busy.set(false);
    scene.setPreset.mockReset();
    scene.zoom.mockReset();
    exporter.save.mockReset();
    shareBusy.set(false);
    shareLink.share.mockReset().mockResolvedValue(undefined);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: SceneCommands, useValue: scene },
        { provide: ImageExport, useValue: exporter },
        { provide: ShareLink, useValue: shareLink },
      ],
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  async function setup() {
    const fixture = TestBed.createComponent(ViewToolbar);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const flush = async () => {
      await new Promise((r) => setTimeout(r, 0));
      fixture.detectChanges();
      await fixture.whenStable();
    };
    const q = (sel: string) => el.querySelector<HTMLElement>(sel)!;
    return { fixture, el, flush, q };
  }

  const escape = () =>
    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );

  it('inline presets and zoom call the scene', async () => {
    const { el } = await setup();
    const inline = Array.from(el.querySelectorAll<HTMLElement>('.group.inline button'));
    inline.find((b) => b.textContent?.includes('Doorway'))!.click();
    inline.find((b) => b.textContent?.includes('Top-down'))!.click();
    el.querySelector<HTMLElement>('[aria-label="Zoom in"]')!.click();
    el.querySelector<HTMLElement>('[aria-label="Zoom out"]')!.click();
    expect(scene.setPreset.mock.calls).toEqual([['doorway'], ['top']]);
    expect(scene.zoom.mock.calls).toEqual([[1], [-1]]);
  });

  it('Views menu opens, focuses the first item, picks a preset and closes', async () => {
    const { el, q, flush } = await setup();
    const trigger = q('[data-trigger=views]');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    trigger.click();
    await flush();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const items = el.querySelectorAll<HTMLElement>('#views-popover .item');
    expect(items.length).toBe(6);
    expect(document.activeElement).toBe(items[0]);
    items[1].click();
    await flush();
    expect(scene.setPreset).toHaveBeenCalledWith('doorway');
    expect(el.querySelector('#views-popover')).toBeNull();
  });

  it('Escape closes the Views menu and returns focus to its trigger', async () => {
    const { el, q, flush } = await setup();
    q('[data-trigger=views]').click();
    await flush();
    escape();
    await flush();
    expect(el.querySelector('#views-popover')).toBeNull();
    expect(document.activeElement).toBe(q('[data-trigger=views]'));
  });

  it('a click outside closes the popover but a click inside does not', async () => {
    const { el, q, flush } = await setup();
    q('[data-trigger=views]').click();
    await flush();
    q('#views-popover').click();
    await flush();
    expect(el.querySelector('#views-popover')).not.toBeNull();
    document.body.click();
    await flush();
    expect(el.querySelector('#views-popover')).toBeNull();
  });

  it('toggling the trigger twice closes the menu', async () => {
    const { el, q, flush } = await setup();
    q('[data-trigger=views]').click();
    await flush();
    q('[data-trigger=views]').click();
    await flush();
    expect(el.querySelector('#views-popover')).toBeNull();
  });

  it('opening Help replaces the Views menu; focus goes in, Close returns focus', async () => {
    const { el, q, flush } = await setup();
    q('[data-trigger=views]').click();
    await flush();
    q('[data-trigger=help]').click();
    await flush();
    expect(el.querySelector('#views-popover')).toBeNull();
    const help = q('#help-popover');
    expect(help.textContent).toContain('Arrow keys to look around');
    expect(q('[data-trigger=help]').getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(help.querySelector('button'));
    help.querySelector<HTMLElement>('button')!.click();
    await flush();
    expect(el.querySelector('#help-popover')).toBeNull();
    expect(document.activeElement).toBe(q('[data-trigger=help]'));
  });

  it('Escape closes Help and restores focus to the ? button', async () => {
    const { el, q, flush } = await setup();
    q('[data-trigger=help]').click();
    await flush();
    escape();
    await flush();
    expect(el.querySelector('#help-popover')).toBeNull();
    expect(document.activeElement).toBe(q('[data-trigger=help]'));
  });

  it('the Colour toggle is a pressed button that turns Colour mode on and off', async () => {
    const { fixture, q } = await setup();
    const colouring = TestBed.inject(ColouringState);
    colouring.setActive(false);
    const toggle = q('[data-colour-toggle]');
    expect(toggle.textContent).toContain('Colour');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    toggle.click();
    fixture.detectChanges();
    expect(colouring.active()).toBe(true);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    toggle.click();
    fixture.detectChanges();
    expect(colouring.active()).toBe(false);
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
  });

  it('the Views menu has a Colour mode item that toggles and closes the menu', async () => {
    const { el, q, flush } = await setup();
    const colouring = TestBed.inject(ColouringState);
    colouring.setActive(false);
    q('[data-trigger=views]').click();
    await flush();
    const item = q('[data-colour-item]');
    expect(item.getAttribute('aria-pressed')).toBe('false');
    expect(item.textContent).toContain('Tap surfaces to colour them');
    item.click();
    await flush();
    expect(colouring.active()).toBe(true);
    expect(el.querySelector('#views-popover')).toBeNull();
    colouring.setActive(false);
  });

  it('Escape closing the Views menu leaves Colour mode alone (the event is handled)', async () => {
    const { q, flush } = await setup();
    const colouring = TestBed.inject(ColouringState);
    colouring.setActive(true);
    q('[data-trigger=views]').click();
    await flush();
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.activeElement!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(colouring.active()).toBe(true);
    colouring.setActive(false);
  });

  it('the Colour toggle is aria-disabled and does nothing without a 3D view', async () => {
    status.set('no-webgl');
    const { fixture, q } = await setup();
    const colouring = TestBed.inject(ColouringState);
    colouring.setActive(false);
    const toggle = q('[data-colour-toggle]');
    expect(toggle.getAttribute('aria-disabled')).toBe('true');
    expect(toggle.title).toBe('Needs 3D view');
    toggle.click();
    fixture.detectChanges();
    expect(colouring.active()).toBe(false);
  });

  it('without a 3D view Help still opens but Views, presets, zoom and Save do nothing', async () => {
    status.set('no-webgl');
    const { el, q, flush } = await setup();
    const views = q('[data-trigger=views]');
    expect(views.getAttribute('aria-disabled')).toBe('true');
    views.click();
    await flush();
    expect(el.querySelector('#views-popover')).toBeNull();
    q('.group.inline button').click();
    q('[aria-label="Zoom in"]').click();
    q('.primary').click();
    expect(scene.setPreset).not.toHaveBeenCalled();
    expect(scene.zoom).not.toHaveBeenCalled();
    expect(exporter.save).not.toHaveBeenCalled();
    expect(q('.primary').title).toBe('Needs 3D view');
    q('[data-trigger=help]').click();
    await flush();
    expect(el.querySelector('#help-popover')).not.toBeNull();
  });

  it('Save image calls the exporter once, and not while busy', async () => {
    const { q, flush } = await setup();
    q('.primary').click();
    expect(exporter.save).toHaveBeenCalledTimes(1);
    busy.set(true);
    await flush();
    expect(q('.primary').getAttribute('aria-busy')).toBe('true');
    expect(q('.primary').textContent).toContain('Saving...');
    q('.primary').click();
    expect(exporter.save).toHaveBeenCalledTimes(1);
  });

  it('names the back link by its purpose', async () => {
    const { el } = await setup();
    expect(el.querySelector('a')?.getAttribute('aria-label')).toBe('Back to Parket home');
  });
  describe('Projects and Share chips', () => {
    it('shows the active project name and opens the dialog request', async () => {
      const { fixture, q } = await setup();
      const opened = vi.fn();
      fixture.componentInstance.projects.subscribe(opened);
      const chip = q('[data-trigger="projects"]');
      expect(chip.getAttribute('aria-label')).toBe('Projects, current: Kitchen');
      expect(chip.getAttribute('aria-haspopup')).toBe('dialog');
      expect(chip.textContent).toContain('Kitchen');
      chip.click();
      expect(opened).toHaveBeenCalledTimes(1);
    });

    it('puts the Projects chip right after Back and Share before Save image', async () => {
      const { el } = await setup();
      const buttons = Array.from(
        el.querySelectorAll('.bar > a, .bar > button, .bar > div > button'),
      );
      const at = (sel: string) => buttons.indexOf(el.querySelector(sel)!);
      expect(at('[data-trigger="projects"]')).toBe(1);
      expect(at('[data-trigger="share"]')).toBeLessThan(at('.chip.primary'));
    });

    it('Share makes a link, and is busy and aria-disabled while it works', async () => {
      const { fixture, q } = await setup();
      const share = q('[data-trigger="share"]');
      expect(share.getAttribute('aria-label')).toBe('Share link');
      expect(share.textContent).toContain('Share');
      share.click();
      expect(shareLink.share).toHaveBeenCalledTimes(1);

      shareBusy.set(true);
      fixture.detectChanges();
      expect(share.getAttribute('aria-busy')).toBe('true');
      expect(share.getAttribute('aria-disabled')).toBe('true');
      expect(share.querySelector('.spinner')).not.toBeNull();
      share.click();
      expect(shareLink.share).toHaveBeenCalledTimes(1);
    });

    it('Share still works when 3D is unavailable', async () => {
      status.set('no-webgl');
      const { q } = await setup();
      const share = q('[data-trigger="share"]');
      expect(share.getAttribute('aria-disabled')).toBe('false');
      share.click();
      expect(shareLink.share).toHaveBeenCalledTimes(1);
    });
  });
});
