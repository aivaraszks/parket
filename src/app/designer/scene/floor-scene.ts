import { ACESFilmicToneMapping, Color, PCFShadowMap, Scene, WebGLRenderer } from 'three';
import { PATTERN_GENERATORS } from '../patterns/registry';
import { SurfacePaint, SurfaceRef } from '../plan/paint';
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
import { pickSurface } from './surface-picker';
import { TapDetector } from './tap-detector';

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
    wallIds: ['s0', 's1', 's2', 's3'],
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
  private paint: SurfacePaint | null = null;
  private paintDirty = false;
  private highlight: SurfaceRef | null = null;
  private picking = false;
  private readonly tapDetector = new TapDetector();
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

    canvas.addEventListener('pointerdown', this.onPointerDown, { passive: true });
    canvas.addEventListener('pointermove', this.onPointerMove, { passive: true });
    canvas.addEventListener('pointerup', this.onPointerUp, { passive: true });
    canvas.addEventListener('pointercancel', this.onPointerCancel, { passive: true });
    canvas.addEventListener('lostpointercapture', this.onPointerCancel, { passive: true });
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

  setPaint(paint: SurfacePaint): void {
    this.paint = paint;
    this.paintDirty = true;
    this.requestRender();
  }

  setPicking(on: boolean): void {
    this.picking = on;
    this.canvas.style.cursor = on ? 'pointer' : '';
  }

  setHighlight(ref: SurfaceRef | null): void {
    this.highlight = ref;
    this.roomBuilder.setHighlight(ref);
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
        // The selection highlight is a UI cue: never in the picture.
        this.roomBuilder.setHighlight(null);
        try {
          this.renderer.render(this.scene, this.rig.camera);
          this.canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error('Could not create the image.'))),
            'image/png',
          );
        } finally {
          this.roomBuilder.setHighlight(this.highlight);
          this.requestRender();
        }
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
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerCancel);
    this.canvas.removeEventListener('lostpointercapture', this.onPointerCancel);
    this.canvas.style.cursor = '';
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
    if (this.paintDirty && this.paint) {
      // After any rebuild: new materials start at the fallback colour.
      this.paintDirty = false;
      this.roomBuilder.applyPaint(this.paint);
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

  private readonly onPointerDown = (e: PointerEvent): void => this.tapDetector.down(e);

  private readonly onPointerMove = (e: PointerEvent): void => this.tapDetector.move(e);

  private readonly onPointerCancel = (e: PointerEvent): void => this.tapDetector.cancel(e);

  private readonly onPointerUp = (e: PointerEvent): void => {
    const tap = this.tapDetector.up(e);
    if (!tap || !this.picking || this.disposed || this.contextLost) return;
    // One raycast per tap, with the matrices of the last rendered frame.
    const hit = pickSurface(
      this.canvas.getBoundingClientRect(),
      tap.clientX,
      tap.clientY,
      this.rig.camera,
      this.roomBuilder.pickables,
    );
    this.callbacks.onPick(hit);
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
