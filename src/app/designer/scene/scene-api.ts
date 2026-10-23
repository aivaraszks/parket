import { RoomShape } from '../plan/room-shape';
import { Finish, PatternId, Sun } from '../state/design-defaults';
import { Species } from '../state/species';
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
}

/**
 * What the Viewport needs from a scene. Implemented by FloorScene; faked in component tests.
 * Setters never render synchronously; the scene renders on demand.
 */
export interface FloorSceneApi extends SceneController {
  setRoom(shape: RoomShape): void;
  setSurfaces(wallColor: string, ceilingColor: string): void;
  setSpecies(species: Species): void;
  setFinish(finish: Finish): void;
  setSun(sun: Sun): void;
  setFloor(layout: FloorLayout): void;
  dispose(): void;
}
