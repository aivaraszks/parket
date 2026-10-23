import { SurfaceHit, SurfacePaint, SurfaceRef } from '../plan/paint';
import { RoomShape } from '../plan/room-shape';
import { Finish, PatternId, Sun } from '../state/design-defaults';
import { Species } from '../state/species';
import type { FrameInsets } from './frame-insets';
import { SceneController, SceneStatus } from './scene-commands';

export interface FloorLayout {
  pattern: PatternId;
  /** mm */
  plankLength: number;
  /** mm */
  plankWidth: number;
  /** Parallel planks per herringbone block (1 = classic). */
  planksPerBlock: number;
  /** degrees */
  angle: number;
}

export interface SceneCallbacks {
  onStatus(status: SceneStatus): void;
  /**
   * A tap while picking is on (`setPicking(true)`); `null` when the tap hit nothing pickable
   * (floor, window, sky). Called synchronously from the pointer event, never from the render loop.
   */
  onPick(hit: SurfaceHit | null): void;
}

/**
 * What the Viewport needs from a scene. Implemented by FloorScene; faked in component tests.
 * Setters never render synchronously; the scene renders on demand.
 */
export interface FloorSceneApi extends SceneController {
  setRoom(shape: RoomShape): void;
  /** Resolved colours; only updates materials, never geometry. Missing ids use the base colours. */
  setPaint(paint: SurfacePaint): void;
  /** Turn tap picking on or off (also switches the canvas cursor). */
  setPicking(on: boolean): void;
  /** Highlight a surface (every wall / door for the groups); `null` clears it. Never in the PNG export. */
  setHighlight(ref: SurfaceRef | null): void;
  setSpecies(species: Species): void;
  setFinish(finish: Finish): void;
  setSun(sun: Sun): void;
  setFloor(layout: FloorLayout): void;
  /** Frame the room in the canvas minus the strips covered by UI (CSS px); zeros clear the frame. */
  setFrame(insets: FrameInsets): void;
  dispose(): void;
}
