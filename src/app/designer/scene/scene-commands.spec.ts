import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SceneCommands, SceneController } from './scene-commands';

describe('SceneCommands', () => {
  let commands: SceneCommands;
  let controller: SceneController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    commands = TestBed.inject(SceneCommands);
    controller = {
      setPreset: vi.fn(),
      zoom: vi.fn(),
      exportPng: vi.fn(() => Promise.resolve(new Blob(['x']))),
    };
  });

  it('starts in the loading status', () => {
    expect(commands.status()).toBe('loading');
    commands.setStatus('ready');
    expect(commands.status()).toBe('ready');
  });

  it('ignores commands and rejects export without a scene', async () => {
    expect(() => commands.setPreset('top')).not.toThrow();
    expect(() => commands.zoom(1)).not.toThrow();
    await expect(commands.exportPng()).rejects.toThrow();
  });

  it('delegates to the attached scene', async () => {
    commands.attach(controller);
    commands.setPreset('doorway');
    commands.zoom(-1);
    expect(controller.setPreset).toHaveBeenCalledWith('doorway');
    expect(controller.zoom).toHaveBeenCalledWith(-1);
    expect((await commands.exportPng()).size).toBe(1);
  });

  it('stops delegating after detach, and ignores stale detaches', () => {
    const other = { ...controller, setPreset: vi.fn() };
    commands.attach(controller);
    commands.detach(other);
    commands.setPreset('top');
    expect(controller.setPreset).toHaveBeenCalledWith('top');
    commands.detach(controller);
    commands.setPreset('corner');
    expect(controller.setPreset).toHaveBeenCalledTimes(1);
  });

  it('calls the retry handler set by the viewport', () => {
    const handler = vi.fn();
    commands.retry();
    commands.setRetryHandler(handler);
    commands.retry();
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
