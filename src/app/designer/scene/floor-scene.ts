import { ACESFilmicToneMapping, Color, PCFShadowMap, Scene, WebGLRenderer } from 'three';
import { PATTERN_GENERATORS } from '../patterns/registry';
import { RoomShape } from '../plan/room-shape';
import { Finish, Sun } from '../state/design-defaults';
import { Species } from '../state/species';
import { CameraRig } from './camera-rig';
import { FloorBuilder } from './floor-builder';
import { Lighting } from './lighting';
import { RoomBuilder } from './room-builder';
import { diffRoom } from './room-change';
import { FloorLayout, FloorSceneApi, SceneCallbacks } from './scene-api';
import { ViewPreset } from './scene-commands';

const BACKGROUND = '#1b120b';

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function isSmallScreen(): boolean {
  return Math.min(innerWidth, innerHeight) < 500;
}

/**
 * Framework-free facade: renderer, on-demand render loop, resize, context loss, export and
 * disposal. It never reads or writes Angular signals. Throws if WebGL is unavailable.
 */
export class FloorScene implements FloorSceneApi {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly rig: CameraRig;
  private readonly roomBuilder = new RoomBuilder();
  private readonly floorBuilder: FloorBuilder;
  private readonly lighting: Lighting;
  private readonly host: HTMLElement;
  private readonly resizeObserver: ResizeObserver | null;

  private room: RoomShape = {
    outline: [
      { x: -2.5, y: -2 },
      { x: 2.5, y: -2 },
      { x: 2.5, y: 2 },
      { x: -2.5, y: 2 },
    ],
    height: 2.7,
    openings: [],
  };
  private layout: FloorLayout = {
    pattern: 'herringbone',
    plankLength: 600,
    plankWidth: 100,
    planksPerBlock: 1,
    angle: 0,
  };
  /** The shape last built into the scene; null until the first sync. */
  private builtRoom: RoomShape | null = null;
  private floorDirty = true;
  private rafId = 0;
  private disposed = false;
  private contextLost = false;
  private reportedReady = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly callbacks: SceneCallbacks,
  ) {
    // Throws when WebGL is not available; the caller reports 'no-webgl'.
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      stencil: true,
      powerPreference: 'default',
    });
    const small = isSmallScreen();
    const renderer = this.renderer;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFShadowMap;
    renderer.shadowMap.autoUpdate = false;

    this.scene.background = new Color(BACKGROUND);
    this.host = canvas.parentElement ?? canvas;
    this.lighting = new Lighting(this.scene, renderer, small ? 1024 : 2048);
    const lowMemory = small || renderer.capabilities.maxTextureSize < 4096;
    this.floorBuilder = new FloorBuilder(
      lowMemory,
      Math.min(8, renderer.capabilities.getMaxAnisotropy()),
    );
    this.rig = new CameraRig(canvas, prefersReducedMotion(), this.requestRender);
    this.scene.add(this.roomBuilder.group, this.floorBuilder.group);

    canvas.addEventListener('webglcontextlost', this.onContextLost);
    canvas.addEventListener('webglcontextrestored', this.onContextRestored);
    this.resizeObserver =
      typeof ResizeObserver === 'function' ? new ResizeObserver(this.resize) : null;
    this.resizeObserver?.observe(this.host);
    this.resize();
    this.requestRender();
  }

  setRoom(shape: RoomShape): void {
    this.room = shape;
    // Cheap; the real comparison runs once per frame in syncScene.
    this.requestRender();
  }

  setSurfaces(wallColor: string, ceilingColor: string): void {
    this.roomBuilder.setColors(wallColor, ceilingColor);
    this.requestRender();
  }

  setSpecies(species: Species): void {
    this.floorBuilder.setSpecies(species);
    this.requestRender();
  }

  setFinish(finish: Finish): void {
    this.floorBuilder.setFinish(finish);
    this.requestRender();
  }

  setSun(sun: Sun): void {
    this.lighting.setSun(sun);
    this.requestRender();
  }

  setFloor(layout: FloorLayout): void {
    this.layout = layout;
    this.floorDirty = true;
    this.requestRender();
  }

  setPreset(name: ViewPreset): void {
    // Fit the preset to the latest room size, not the one from the last frame.
    this.syncScene();
    this.rig.setPreset(name);
  }

  zoom(direction: 1 | -1): void {
    this.rig.zoom(direction);
  }

  exportPng(): Promise<Blob> {
    if (this.disposed || this.contextLost) {
      return Promise.reject(new Error('The 3D view is not available.'));
    }
    return new Promise<Blob>((resolve, reject) => {
      try {
        // No preserveDrawingBuffer: render and read back in the same task.
        this.syncScene();
        this.renderer.render(this.scene, this.rig.camera);
        this.canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('Could not create the image.'))),
          'image/png',
        );
      } catch (error) {
        reject(error);
      }
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    this.resizeObserver?.disconnect();
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.rig.dispose();
    this.floorBuilder.dispose();
    this.roomBuilder.dispose();
    this.lighting.dispose();
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  private readonly requestRender = (): void => {
    if (this.disposed || this.contextLost || this.rafId) return;
    this.rafId = requestAnimationFrame(this.frame);
  };

  private readonly frame = (now: number): void => {
    this.rafId = 0;
    if (this.disposed || this.contextLost) return;
    this.syncScene();
    const animating = this.rig.update(now);
    this.renderer.render(this.scene, this.rig.camera);
    if (!this.reportedReady) {
      this.reportedReady = true;
      this.callbacks.onStatus('ready');
    }
    if (animating) {
      this.requestRender();
    }
  };

  /** Apply pending room and floor changes once per frame, however many setters ran. */
  private syncScene(): void {
    if (this.builtRoom !== this.room) {
      const change = diffRoom(this.builtRoom, this.room);
      this.builtRoom = this.room;
      if (change.shell) {
        this.roomBuilder.setRoom(this.room);
        this.lighting.setRoom(this.room);
        this.rig.setRoom(this.room);
      }
      if (change.mask) {
        this.floorBuilder.setRoom(this.room);
      }
      if (change.placements) {
        this.floorDirty = true;
      }
    }
    if (this.floorDirty) {
      this.floorDirty = false;
      const generator = PATTERN_GENERATORS[this.layout.pattern];
      const angle = Math.min(
        generator.angleRange.max,
        Math.max(generator.angleRange.min, this.layout.angle),
      );
      this.floorBuilder.setPlacements(
        generator.generate(
          {
            plankLength: this.layout.plankLength,
            plankWidth: this.layout.plankWidth,
            planksPerBlock: this.layout.planksPerBlock,
            angle,
          },
          { outline: this.room.outline },
        ),
      );
    }
  }

  private readonly resize = (): void => {
    if (this.disposed) return;
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;
    if (width === 0 || height === 0) return;
    const ratioCap = isSmallScreen() ? 1.5 : 2;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, ratioCap));
    this.renderer.setSize(width, height, false);
    this.rig.setAspect(width / height);
    this.requestRender();
  };

  private readonly onContextLost = (event: Event): void => {
    event.preventDefault();
    this.contextLost = true;
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    this.callbacks.onStatus('context-lost');
  };

  private readonly onContextRestored = (): void => {
    this.contextLost = false;
    // Render targets lost their contents; the textures and buffers re-upload on demand.
    this.lighting.buildEnvironment();
    this.callbacks.onStatus('ready');
    this.requestRender();
  };
}
