import { BoxGeometry, Mesh, MeshBasicMaterial, PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import { pickSurface, surfaceOf } from './surface-picker';

const rect = { left: 10, top: 20, width: 200, height: 100 };

function camera(): PerspectiveCamera {
  const cam = new PerspectiveCamera(50, rect.width / rect.height, 0.1, 100);
  cam.position.set(0, 0, 5);
  cam.updateMatrixWorld();
  return cam;
}

function box(z: number, surface?: Mesh['userData']['surface']): Mesh {
  const mesh = new Mesh(new BoxGeometry(1, 1, 0.2), new MeshBasicMaterial());
  mesh.position.z = z;
  if (surface) mesh.userData['surface'] = surface;
  mesh.updateMatrixWorld();
  return mesh;
}

describe('pickSurface', () => {
  const centreX = rect.left + rect.width / 2;
  const centreY = rect.top + rect.height / 2;

  it('reads the tag of the nearest tagged mesh', () => {
    const near = box(1, { kind: 'wall', id: 'a' });
    const far = box(-1, { kind: 'ceiling' });
    expect(pickSurface(rect, centreX, centreY, camera(), [far, near])).toEqual({
      kind: 'wall',
      id: 'a',
    });
  });

  it('returns null when the ray misses everything', () => {
    const mesh = box(0, { kind: 'ceiling' });
    expect(pickSurface(rect, rect.left + 2, rect.top + 2, camera(), [mesh])).toBeNull();
    expect(pickSurface(rect, centreX, centreY, camera(), [])).toBeNull();
  });

  it('skips untagged meshes and handles a zero-size canvas', () => {
    expect(pickSurface(rect, centreX, centreY, camera(), [box(0)])).toBeNull();
    expect(
      pickSurface({ ...rect, width: 0 }, 0, 0, camera(), [box(0, { kind: 'ceiling' })]),
    ).toBeNull();
  });

  it('maps a mesh to its SurfaceHit', () => {
    expect(surfaceOf(box(0, { kind: 'door', id: 'o1' }))).toEqual({ kind: 'door', id: 'o1' });
    expect(surfaceOf(box(0))).toBeNull();
  });
});
