import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  InjectionToken,
  signal,
  viewChild,
} from '@angular/core';
import { bbox } from '../plan/polygon';
import { SurfaceHit, surfaceExists } from '../plan/paint';
import { shapeArea } from '../plan/room-shape';
import { ColouringState } from '../state/colouring-state';
import { DesignState } from '../state/design-state';
import { getSpecies } from '../state/species';
import { FloorSceneApi, SceneCallbacks } from '../scene/scene-api';
import { FloorScene } from '../scene/floor-scene';
import { SceneCommands, SceneStatus } from '../scene/scene-commands';

export type FloorSceneFactory = (
  canvas: HTMLCanvasElement,
  callbacks: SceneCallbacks,
) => FloorSceneApi;

/** Creates the WebGL scene; tests provide a fake. */
export const FLOOR_SCENE_FACTORY = new InjectionToken<FloorSceneFactory>('FLOOR_SCENE_FACTORY', {
  providedIn: 'root',
  factory: () => (canvas, callbacks) => new FloorScene(canvas, callbacks),
});

/** How long a lost WebGL context may take to come back before we give up. */
export const CONTEXT_RESTORE_TIMEOUT_MS = 5000;

export const CAMERA_HELP_ID = 'viewport-help';

/**
 * The 3D view. Fills its parent and bridges DesignState signals to the framework-free scene.
 * Loading and error overlays are drawn by the page from SceneCommands.status.
 */
@Component({
  selector: 'app-viewport',
  template: `
    @for (key of canvasKeys(); track key) {
      <canvas
        #canvas
        class="view"
        role="img"
        [attr.tabindex]="ready() ? 0 : -1"
        [attr.aria-hidden]="ready() ? null : 'true'"
        [attr.aria-label]="ready() ? ariaLabel() : null"
        [attr.aria-describedby]="describedBy()"
      ></canvas>
    }
    <p [id]="helpId" class="visually-hidden">
      Drag to look around. Pinch or scroll to zoom. Two fingers or right-drag to move. With the
      keyboard: arrow keys to look around, plus and minus to zoom, 0 to reset the view.
    </p>
    @if (colouring.colourOpen()) {
      <p [id]="colourHelpId" class="visually-hidden">
        Colour is open. Use the What and Which rows to pick a surface from a list.
      </p>
    }
  `,
  styleUrl: './viewport.scss',
})
export class Viewport {
  private readonly design = inject(DesignState);
  protected readonly colouring = inject(ColouringState);
  private readonly commands = inject(SceneCommands);
  private readonly factory = inject(FLOOR_SCENE_FACTORY);
  private readonly injector = inject(Injector);

  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly scene = signal<FloorSceneApi | null>(null);
  private restoreTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly helpId = CAMERA_HELP_ID;
  /** Changing the key swaps in a fresh canvas (a lost context cannot be reused). */
  protected readonly canvasKeys = signal([0]);

  /** The canvas is only a focusable, labelled view while the 3D scene is actually showing. */
  protected readonly ready = computed(() => this.commands.status() === 'ready');

  protected readonly colourHelpId = 'viewport-colour-help';
  /** Tells screen-reader users the canvas cannot be tapped by keyboard while Colour is open. */
  protected readonly describedBy = computed(() =>
    this.colouring.colourOpen() ? `${this.helpId} ${this.colourHelpId}` : this.helpId,
  );

  protected readonly ariaLabel = computed(() => {
    const species = getSpecies(this.design.species()).name.toLowerCase();
    const blocks = this.design.planksPerBlock();
    return (
      `3D view: ${this.roomDescription()}, ` +
      `${species} ${this.design.pattern()} floor` +
      (blocks > 1 ? ` of ${blocks} planks per block` : '') +
      ` at ${this.design.angle()} degrees, ` +
      `${this.design.finish()} finish`
    );
  });

  private roomDescription(): string {
    const shape = this.design.roomShape();
    if (this.design.mode() === 'simple') {
      const box = bbox(shape.outline);
      return `${box.width.toFixed(2)} by ${box.height.toFixed(2)} m room`;
    }
    const doors = shape.openings.filter((o) => o.kind === 'door').length;
    const windows = shape.openings.length - doors;
    return (
      `custom room with ${shape.outline.length} corners, ${shapeArea(shape).toFixed(1)} square metres, ` +
      `${doors} ${doors === 1 ? 'door' : 'doors'} and ${windows} ${windows === 1 ? 'window' : 'windows'}`
    );
  }

  constructor() {
    this.commands.setStatus('loading');
    afterNextRender(() => this.start());
    this.commands.setRetryHandler(() => this.retry());
    inject(DestroyRef).onDestroy(() => {
      this.commands.setRetryHandler(null);
      this.stop();
    });

    effect(() => {
      const scene = this.scene();
      const shape = this.design.roomShape();
      scene?.setRoom(shape);
    });
    effect(() => {
      const scene = this.scene();
      const paint = this.design.paint();
      scene?.setPaint(paint);
    });
    effect(() => {
      const scene = this.scene();
      const on = this.colouring.picking();
      scene?.setPicking(on);
    });
    effect(() => {
      const scene = this.scene();
      const highlighted = this.colouring.highlight();
      scene?.setHighlight(highlighted);
    });
    effect(() => {
      // A plan edit or mode switch can remove the selected wall or door: back to "All walls".
      const shape = this.design.roomShape();
      const selected = this.colouring.selected();
      if (selected && !surfaceExists(selected, shape)) {
        this.colouring.select({ kind: 'walls' }, 'list');
      }
    });
    effect(() => {
      const scene = this.scene();
      const species = getSpecies(this.design.species());
      scene?.setSpecies(species);
    });
    effect(() => {
      const scene = this.scene();
      const finish = this.design.finish();
      scene?.setFinish(finish);
    });
    effect(() => {
      const scene = this.scene();
      const sun = this.design.sun();
      scene?.setSun(sun);
    });
    effect(() => {
      const scene = this.scene();
      const plank = this.design.plank();
      const pattern = this.design.pattern();
      const angle = this.design.angle();
      scene?.setFloor({
        pattern,
        plankLength: plank.length,
        plankWidth: plank.width,
        planksPerBlock: this.design.planksPerBlock(),
        angle,
      });
    });
  }

  /** Re-create the scene after a failure ("Try again"); reached through SceneCommands.retry(). */
  private retry(): void {
    this.stop();
    this.commands.setStatus('loading');
    this.canvasKeys.update(([key]) => [key + 1]);
    afterNextRender(() => this.start(), { injector: this.injector });
  }

  private start(): void {
    const canvas = this.canvas()?.nativeElement;
    if (!canvas) {
      return;
    }
    this.commands.setStatus('loading');
    let scene: FloorSceneApi;
    try {
      scene = this.factory(canvas, {
        onStatus: (status) => this.onSceneStatus(status),
        onPick: (hit) => this.onPick(hit),
      });
    } catch (error) {
      const noWebgl = error instanceof Error && /webgl/i.test(error.message);
      this.commands.setStatus(noWebgl ? 'no-webgl' : 'error');
      return;
    }
    this.commands.attach(scene);
    this.scene.set(scene);
  }

  /** A tap in the 3D view selects a surface; a tap on empty space keeps the selection. */
  private onPick(hit: SurfaceHit | null): void {
    if (hit) {
      this.colouring.select(hit, 'tap');
    }
  }

  private stop(): void {
    clearTimeout(this.restoreTimer);
    const scene = this.scene();
    if (scene) {
      this.commands.detach(scene);
      this.scene.set(null);
      scene.dispose();
    }
  }

  private onSceneStatus(status: SceneStatus): void {
    clearTimeout(this.restoreTimer);
    this.commands.setStatus(status);
    if (status === 'context-lost') {
      this.restoreTimer = setTimeout(() => {
        this.stop();
        this.commands.setStatus('no-webgl');
      }, CONTEXT_RESTORE_TIMEOUT_MS);
    }
  }
}
