import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SceneCommands } from '../scene/scene-commands';
import { DesignState } from '../state/design-state';
import { ImageExport, needsSaveFallback } from './image-export';
import { Toasts } from './toasts';

function fakeDoc(ua: string, platform = 'Win32', touch = 0, hasDownload = true): Document {
  return {
    defaultView: { navigator: { userAgent: ua, platform, maxTouchPoints: touch } },
    createElement: () => (hasDownload ? { download: '' } : {}),
  } as unknown as Document;
}

describe('needsSaveFallback', () => {
  it('detects iPhone, iPad and iPadOS desktop-mode Safari', () => {
    expect(needsSaveFallback(fakeDoc('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)'))).toBe(true);
    expect(needsSaveFallback(fakeDoc('Mozilla/5.0 (iPad; CPU OS 17_0)'))).toBe(true);
    expect(needsSaveFallback(fakeDoc('Mozilla/5.0 (Macintosh)', 'MacIntel', 5))).toBe(true);
  });

  it('is false for desktop and Android Chrome', () => {
    expect(needsSaveFallback(fakeDoc('Mozilla/5.0 (Windows NT 10.0) Chrome/120'))).toBe(false);
    expect(
      needsSaveFallback(fakeDoc('Mozilla/5.0 (Linux; Android 14) Chrome/120', 'Linux armv8l', 5)),
    ).toBe(false);
    expect(needsSaveFallback(fakeDoc('Mozilla/5.0 (Macintosh)', 'MacIntel', 0))).toBe(false);
  });

  it('is true when the download attribute is unsupported', () => {
    expect(needsSaveFallback(fakeDoc('Mozilla/5.0 Chrome', 'Win32', 0, false))).toBe(true);
  });
});

describe('ImageExport', () => {
  const exportPng = vi.fn();
  let clicks: { download: string; href: string }[];
  const createUrl = vi.fn();
  const revokeUrl = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    exportPng.mockReset();
    createUrl.mockReset().mockReturnValue('blob:fake');
    revokeUrl.mockReset();
    clicks = [];
    URL.createObjectURL = createUrl;
    URL.revokeObjectURL = revokeUrl;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicks.push({ download: this.download, href: this.href });
    });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: SceneCommands, useValue: { exportPng } }],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('downloads with the species and angle in the file name, then revokes the URL', async () => {
    exportPng.mockResolvedValue(new Blob(['x']));
    const state = TestBed.inject(DesignState);
    state.setSpecies('walnut');
    state.setAngle(30);
    const exporter = TestBed.inject(ImageExport);
    await exporter.save();
    expect(clicks).toHaveLength(1);
    expect(clicks[0].download).toBe('parket-herringbone-walnut-30deg.png');
    expect(TestBed.inject(Toasts).current()?.text).toBe('Image saved.');
    expect(exporter.busy()).toBe(false);
    expect(revokeUrl).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(revokeUrl).toHaveBeenCalledWith('blob:fake');
    expect(exporter.fallbackUrl()).toBeNull();
  });

  it('ignores a second save while busy', async () => {
    let resolve!: (b: Blob) => void;
    exportPng.mockReturnValue(new Promise<Blob>((r) => (resolve = r)));
    const exporter = TestBed.inject(ImageExport);
    const first = exporter.save();
    expect(exporter.busy()).toBe(true);
    await exporter.save();
    expect(exportPng).toHaveBeenCalledTimes(1);
    resolve(new Blob(['x']));
    await first;
    expect(exporter.busy()).toBe(false);
  });

  it('shows the in-page image instead of downloading on iOS, and revokes on close', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)',
    );
    exportPng.mockResolvedValue(new Blob(['x']));
    const exporter = TestBed.inject(ImageExport);
    await exporter.save();
    expect(clicks).toHaveLength(0);
    expect(exporter.fallbackUrl()).toBe('blob:fake');
    expect(TestBed.inject(Toasts).current()).toBeNull();
    exporter.closeFallback();
    expect(revokeUrl).toHaveBeenCalledWith('blob:fake');
    expect(exporter.fallbackUrl()).toBeNull();
    exporter.closeFallback();
    expect(revokeUrl).toHaveBeenCalledTimes(1);
  });

  it('reports an error with a Retry action that saves again', async () => {
    exportPng.mockRejectedValueOnce(new Error('boom'));
    const exporter = TestBed.inject(ImageExport);
    await exporter.save();
    const toast = TestBed.inject(Toasts).current();
    expect(toast?.kind).toBe('error');
    expect(toast?.text).toBe('Could not create the image. Try again.');
    expect(toast?.action?.label).toBe('Retry');
    expect(exporter.busy()).toBe(false);

    exportPng.mockResolvedValue(new Blob(['x']));
    toast!.action!.run();
    await vi.advanceTimersByTimeAsync(0);
    expect(exportPng).toHaveBeenCalledTimes(2);
    expect(clicks).toHaveLength(1);
  });
});
