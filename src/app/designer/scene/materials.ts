import {
  AlwaysStencilFunc,
  Color,
  DoubleSide,
  EqualStencilFunc,
  KeepStencilOp,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  ReplaceStencilOp,
  Texture,
} from 'three';
import { Finish } from '../state/design-defaults';

/** Stencil value the floor mask writes and the planks test for (plan C9). */
const FLOOR_STENCIL_REF = 1;

interface FinishParams {
  roughness: number;
  clearcoat: number;
  clearcoatRoughness: number;
}

/** Finish to material parameters (plan D5). */
export const FINISH_PARAMS: Record<Finish, FinishParams> = {
  matte: { roughness: 0.75, clearcoat: 0, clearcoatRoughness: 0.5 },
  satin: { roughness: 0.55, clearcoat: 0.35, clearcoatRoughness: 0.35 },
  gloss: { roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.05 },
};

export function createFloorMaterial(): MeshPhysicalMaterial {
  const material = new MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: FINISH_PARAMS.satin.roughness,
    clearcoat: FINISH_PARAMS.satin.clearcoat,
    clearcoatRoughness: FINISH_PARAMS.satin.clearcoatRoughness,
    metalness: 0,
    envMapIntensity: 0.8,
    // Planks are drawn only where the floor mask wrote the stencil, i.e. inside the room outline.
    stencilWrite: true,
    stencilRef: FLOOR_STENCIL_REF,
    stencilFunc: EqualStencilFunc,
    stencilFail: KeepStencilOp,
    stencilZFail: KeepStencilOp,
    stencilZPass: KeepStencilOp,
  });
  return material;
}

export function applyFinish(material: MeshPhysicalMaterial, finish: Finish): void {
  const params = FINISH_PARAMS[finish];
  material.roughness = params.roughness;
  material.clearcoat = params.clearcoat;
  material.clearcoatRoughness = params.clearcoatRoughness;
  material.needsUpdate = true;
}

export function setFloorMap(material: MeshPhysicalMaterial, map: Texture | null): void {
  material.map = map;
  // The grain lines double as a faint bump so pores and growth rings catch the light.
  material.bumpMap = map;
  material.bumpScale = map ? 0.6 : 0;
  material.needsUpdate = true;
}

export function createWallMaterial(color: string): MeshStandardMaterial {
  return new MeshStandardMaterial({ color: new Color(color), roughness: 0.92, metalness: 0 });
}

export function createCeilingMaterial(color: string): MeshStandardMaterial {
  // A downward-facing plane: invisible from above so the top-down view can look through it,
  // but it still blocks the sun (shadows use both sides).
  const material = new MeshStandardMaterial({
    color: new Color(color),
    roughness: 0.95,
    metalness: 0,
  });
  material.shadowSide = DoubleSide;
  return material;
}

export function createSubfloorMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({ color: 0x1c1108, roughness: 1, metalness: 0 });
}

export function createTrimMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({ color: 0xf2eee6, roughness: 0.6, metalness: 0 });
}

/** Invisible polygon at plank-top height that writes the floor stencil (renderOrder before planks). */
export function createFloorMaskMaterial(): MeshBasicMaterial {
  return new MeshBasicMaterial({
    colorWrite: false,
    depthWrite: false,
    depthTest: false,
    side: DoubleSide,
    stencilWrite: true,
    stencilRef: FLOOR_STENCIL_REF,
    stencilFunc: AlwaysStencilFunc,
    stencilFail: ReplaceStencilOp,
    stencilZFail: ReplaceStencilOp,
    stencilZPass: ReplaceStencilOp,
  });
}

export function createGlassMaterial(): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({
    color: 0xdfeef7,
    roughness: 0.05,
    metalness: 0,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
    side: DoubleSide,
  });
}

export function createMetalMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({ color: 0xb9bdc3, roughness: 0.35, metalness: 0.85 });
}

/** Wood-like threshold strip in the doorway. */
export function createThresholdMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({ color: 0x7a5636, roughness: 0.55, metalness: 0 });
}

export function createDoorMaterial(color: string): MeshStandardMaterial {
  return new MeshStandardMaterial({ color: new Color(color), roughness: 0.6, metalness: 0 });
}
