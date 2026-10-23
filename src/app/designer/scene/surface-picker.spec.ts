import { BoxGeometry, Mesh, MeshBasicMaterial, PerspectiveCamera, Vector3 } from 'three';
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

describe('pickSurface through a framed camera', () => {
  // Canvas 200x100 with the bottom 40 px covered: the frame is 200x60 and sits at the top.
  function framed(): PerspectiveCamera {
    const cam = camera();
    cam.aspect = 200 / 60;
    cam.setViewOffset(200, 60, 0, 0, 200, 100);
    cam.updateMatrixWorld();
    return cam;
  }

  function small(x: number, y: number): Mesh {
    const mesh = new Mesh(new BoxGeometry(0.2, 0.2, 0.2), new MeshBasicMaterial());
    mesh.position.set(x, y, 0);
    mesh.userData['surface'] = { kind: 'ceiling' };
    mesh.updateMatrixWorld();
    return mesh;
  }

  /** Canvas pixel where the framed camera draws a world point. */
  function pixelOf(cam: PerspectiveCamera, x: number, y: number): [number, number] {
    const ndc = new Vector3(x, y, 0).project(cam);
    return [rect.left + ((ndc.x + 1) / 2) * rect.width, rect.top + ((1 - ndc.y) / 2) * rect.height];
  }

  it('hits the mesh at the frame centre, which is above the canvas centre', () => {
    const cam = framed();
    const [px, py] = pixelOf(cam, 0, 0);
    expect(py).toBeCloseTo(rect.top + 30);
    expect(pickSurface(rect, px, py, cam, [small(0, 0)])).toEqual({ kind: 'ceiling' });
    expect(pickSurface(rect, px, py, camera(), [small(0, 0)])).toBeNull();
  });

  it('hits a mesh drawn just inside the frame edge, and ignores the spot beside it', () => {
    const cam = framed();
    // 30 px below the frame centre is the frame bottom: put a mesh 1.2 m low and tap on it.
    const [px, py] = pixelOf(cam, 0.5, -1.2);
    expect(py).toBeGreaterThan(rect.top + 30);
    expect(pickSurface(rect, px, py, cam, [small(0.5, -1.2)])).toEqual({ kind: 'ceiling' });
    expect(pickSurface(rect, px, py + 12, cam, [small(0.5, -1.2)])).toBeNull();
  });
});
