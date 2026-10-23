import { Camera, Intersection, Mesh, Object3D, Raycaster, Vector2 } from 'three';
import { SurfaceHit } from '../plan/paint';

/** Read the surface tag off an object (set by RoomBuilder in `userData.surface`). */
export function surfaceOf(object: Object3D): SurfaceHit | null {
  const tag = object.userData['surface'] as SurfaceHit | undefined;
  return tag ?? null;
}

/**
 * Cast a ray through a canvas point and return the first tagged surface it hits. `pickables` is
 * the flat list of tagged meshes (no recursion). Glass and the sky are not in it. Runs once per
 * tap, never per frame.
 */
export function pickSurface(
  rect: { left: number; top: number; width: number; height: number },
  clientX: number,
  clientY: number,
  camera: Camera,
  pickables: readonly Mesh[],
  raycaster = new Raycaster(),
): SurfaceHit | null {
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }
  const ndc = new Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -(((clientY - rect.top) / rect.height) * 2 - 1),
  );
  raycaster.setFromCamera(ndc, camera);
  const hits: Intersection[] = raycaster.intersectObjects(pickables as Mesh[], false);
  for (const hit of hits) {
    const surface = surfaceOf(hit.object);
    if (surface) {
      return surface;
    }
  }
  return null;
}
