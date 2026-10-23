import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SceneCommands } from '../scene/scene-commands';
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

  it('holds Back, Project, Camera, Share and Save image in that order', async () => {
    const { el } = await setup();
    const order = Array.from(
      el.querySelectorAll('.bar > a, .bar > button, .bar > app-camera-menu'),
    ).map((n) => n.getAttribute('data-trigger') ?? n.tagName.toLowerCase());
    expect(order).toEqual(['a', 'projects', 'app-camera-menu', 'share', 'save']);
  });

  it('has no Colour toggle, Views menu or ? chip', async () => {
    const { el } = await setup();
    expect(
      el.querySelector('[data-colour-toggle], [data-trigger=views], [data-trigger=help]'),
    ).toBeNull();
    expect(el.textContent).not.toContain('Colour');
  });

  it('Save image calls the exporter once, and not while busy', async () => {
    const { q, flush } = await setup();
    q('.primary').click();
    expect(exporter.save).toHaveBeenCalledTimes(1);
    busy.set(true);
    await flush();
    expect(q('.primary').getAttribute('aria-busy')).toBe('true');
    expect(q('.primary').textContent).toContain('Saving image...');
    expect(q('.primary').getAttribute('aria-label')).toBe('Saving image...');
    q('.primary').click();
    expect(exporter.save).toHaveBeenCalledTimes(1);
  });

  it('Save keeps its name for icon-only phones', async () => {
    const { q } = await setup();
    expect(q('.primary').getAttribute('aria-label')).toBe('Save image');
  });

  it('without a 3D view Save does nothing; the tooltip shows after a failure, not while loading', async () => {
    status.set('loading');
    const { q, fixture } = await setup();
    expect(q('.primary').getAttribute('aria-disabled')).toBe('true');
    expect(q('.primary').hasAttribute('title')).toBe(false);
    status.set('no-webgl');
    fixture.detectChanges();
    expect(q('.primary').title).toBe('Needs 3D view');
    q('.primary').click();
    expect(exporter.save).not.toHaveBeenCalled();
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
