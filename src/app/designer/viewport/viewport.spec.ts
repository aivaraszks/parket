import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FloorSceneApi, SceneCallbacks } from '../scene/scene-api';
import { SceneCommands } from '../scene/scene-commands';
import { DesignState } from '../state/design-state';
import { FLOOR_SCENE_FACTORY, Viewport } from './viewport';

function fakeScene(): FloorSceneApi {
  return {
    setRoom: vi.fn(),
    setSurfaces: vi.fn(),
    setSpecies: vi.fn(),
    setFinish: vi.fn(),
    setSun: vi.fn(),
    setFloor: vi.fn(),
    setPreset: vi.fn(),
    zoom: vi.fn(),
    exportPng: vi.fn(() => Promise.resolve(new Blob())),
    dispose: vi.fn(),
  };
}

describe('Viewport', () => {
  let scene: FloorSceneApi;
  let callbacks: SceneCallbacks | undefined;
  let factory: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    scene = fakeScene();
    callbacks = undefined;
    factory = vi.fn((_canvas: HTMLCanvasElement, cb: SceneCallbacks) => {
      callbacks = cb;
      return scene;
    });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: FLOOR_SCENE_FACTORY, useValue: factory }],
    });
  });

  async function setup() {
    const fixture = TestBed.createComponent(Viewport);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('creates the scene on a focusable canvas image and pushes the whole design', async () => {
    const { el } = await setup();
    const canvas = el.querySelector('canvas')!;
    expect(factory).toHaveBeenCalledTimes(1);
    expect(canvas.getAttribute('role')).toBe('img');
    expect(canvas.getAttribute('tabindex')).toBe('-1');
    expect(scene.setRoom).toHaveBeenCalledWith(
      expect.objectContaining({
        height: 2.7,
        outline: [
          { x: -2.5, y: -2 },
          { x: 2.5, y: -2 },
          { x: 2.5, y: 2 },
          { x: -2.5, y: 2 },
        ],
      }),
    );
    expect(scene.setSurfaces).toHaveBeenCalledWith('#efe9df', '#f7f5f0');
    expect(scene.setSpecies).toHaveBeenCalledWith(expect.objectContaining({ id: 'golden-oak' }));
    expect(scene.setFinish).toHaveBeenCalledWith('satin');
    expect(scene.setSun).toHaveBeenCalledWith({
      on: true,
      azimuth: 135,
      elevation: 35,
      intensity: 1,
    });
    expect(scene.setFloor).toHaveBeenCalledWith({
      pattern: 'herringbone',
      plankLength: 600,
      plankWidth: 100,
      planksPerBlock: 1,
      angle: 0,
    });
  });

  it('is focusable and labelled only once the 3D view is ready', async () => {
    const { fixture, el } = await setup();
    const canvas = el.querySelector('canvas')!;
    expect(canvas.getAttribute('aria-hidden')).toBe('true');
    expect(canvas.getAttribute('aria-label')).toBeNull();
    callbacks?.onStatus('ready');
    await fixture.whenStable();
    expect(canvas.getAttribute('tabindex')).toBe('0');
    expect(canvas.getAttribute('aria-hidden')).toBeNull();
    expect(canvas.getAttribute('aria-label')).toContain('3D view');
    callbacks?.onStatus('context-lost');
    await fixture.whenStable();
    expect(canvas.getAttribute('tabindex')).toBe('-1');
  });

  it('forwards every state change to the scene', async () => {
    const { fixture } = await setup();
    const state = TestBed.inject(DesignState);
    state.setRoomLength(6);
    state.setWallColor('#3d3a38');
    state.setSpecies('walnut');
    state.setFinish('gloss');
    state.setSun({ on: false });
    state.setAngle(30);
    state.setPlankWidth(120);
    await fixture.whenStable();
    expect(scene.setRoom).toHaveBeenLastCalledWith(
      expect.objectContaining({
        outline: expect.arrayContaining([{ x: 3, y: 2 }]),
      }),
    );
    expect(scene.setSurfaces).toHaveBeenLastCalledWith('#3d3a38', '#f7f5f0');
    expect(scene.setSpecies).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'walnut' }));
    expect(scene.setFinish).toHaveBeenLastCalledWith('gloss');
    expect(scene.setSun).toHaveBeenLastCalledWith(expect.objectContaining({ on: false }));
    expect(scene.setFloor).toHaveBeenLastCalledWith(
      expect.objectContaining({ angle: 30, plankWidth: 120 }),
    );
  });

  it('describes the view for assistive technology and links the keyboard help', async () => {
    const { fixture, el } = await setup();
    callbacks?.onStatus('ready');
    TestBed.inject(DesignState).setAngle(30);
    await fixture.whenStable();
    const canvas = el.querySelector('canvas')!;
    expect(canvas.getAttribute('aria-label')).toBe(
      '3D view: 5.00 by 4.00 m room, golden oak herringbone floor at 30 degrees, satin finish',
    );
    const help = el.querySelector(`#${canvas.getAttribute('aria-describedby')}`);
    expect(help?.textContent).toContain('arrow keys');
  });

  it('attaches the scene to SceneCommands and publishes its status', async () => {
    await setup();
    const commands = TestBed.inject(SceneCommands);
    expect(commands.status()).toBe('loading');
    callbacks?.onStatus('ready');
    expect(commands.status()).toBe('ready');
    commands.setPreset('top');
    commands.zoom(1);
    expect(scene.setPreset).toHaveBeenCalledWith('top');
    expect(scene.zoom).toHaveBeenCalledWith(1);
  });

  it('disposes the scene and detaches when destroyed', async () => {
    const { fixture } = await setup();
    const commands = TestBed.inject(SceneCommands);
    fixture.destroy();
    expect(scene.dispose).toHaveBeenCalledTimes(1);
    commands.setPreset('top');
    expect(scene.setPreset).not.toHaveBeenCalled();
    await expect(commands.exportPng()).rejects.toThrow();
  });

  it('reports no-webgl when the scene cannot be created, and retries on request', async () => {
    factory.mockImplementationOnce(() => {
      throw new Error('Error creating WebGL context.');
    });
    const { fixture } = await setup();
    const commands = TestBed.inject(SceneCommands);
    expect(commands.status()).toBe('no-webgl');
    commands.retry();
    await fixture.whenStable();
    expect(factory).toHaveBeenCalledTimes(2);
    expect(commands.status()).toBe('loading');
    expect(scene.setPreset).not.toHaveBeenCalled();
    commands.setPreset('top');
    expect(scene.setPreset).toHaveBeenCalledWith('top');
  });

  it('reports a non-WebGL failure as error', async () => {
    factory.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    await setup();
    expect(TestBed.inject(SceneCommands).status()).toBe('error');
  });
});
