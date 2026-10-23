import { MeshStandardMaterial } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { SurfaceHit, SurfacePaint } from '../plan/paint';
import { RoomShape } from '../plan/room-shape';
import { HIGHLIGHT_INTENSITY, HIGHLIGHT_INTENSITY_SINGLE, highlightIntensity } from './highlight';
import {
  buildCeilingGeometry,
  buildPrismGeometry,
  buildWallGeometry,
  RoomBuilder,
} from './room-builder';
import { SKIRTING_HEIGHT, WallLayout } from './wall-layout';

const wall = (openings: WallLayout['openings']): WallLayout => ({
  index: 0,
  origin: { x: 0, y: 0 },
  dir: { x: 1, y: 0 },
  normal: { x: 0, y: -1 },
  length: 5,
  openings,
  skirting: [[0, 5]],
});
const opening = (
  kind: 'door' | 'window',
  start: number,
  end: number,
  bottom: number,
  top: number,
) => ({
  id: 'o',
  kind,
  wall: 0,
  start,
  end,
  bottom,
  top,
});

describe('buildWallGeometry', () => {
  it('fills the elevation and extrudes behind the inner face', () => {
    const g = buildWallGeometry(wall([]), 2.7);
    g.computeBoundingBox();
    expect(g.boundingBox!.min.x).toBeCloseTo(0);
    expect(g.boundingBox!.max.x).toBeCloseTo(5);
    expect(g.boundingBox!.max.y).toBeCloseTo(2.7);
    expect(g.boundingBox!.min.z).toBeCloseTo(-0.15);
    expect(g.boundingBox!.max.z).toBeCloseTo(0);
  });

  it('cuts windows as holes and doors as notches, adding faces', () => {
    const plain = buildWallGeometry(wall([]), 2.7).getAttribute('position').count;
    const win = buildWallGeometry(wall([opening('window', 1, 2, 0.9, 2.1)]), 2.7);
    const door = buildWallGeometry(wall([opening('door', 3, 3.9, 0, 2.1)]), 2.7);
    expect(win.getAttribute('position').count).toBeGreaterThan(plain);
    expect(door.getAttribute('position').count).toBeGreaterThan(plain);
  });
});

describe('floor and ceiling geometry', () => {
  const square = [
    { x: -1, y: -1 },
    { x: 1, y: -1 },
    { x: 1, y: 1 },
    { x: -1, y: 1 },
  ];

  it('faces the ceiling downward at the given height', () => {
    const g = buildCeilingGeometry(square, 2.7);
    const pos = g.getAttribute('position');
    const index = g.getIndex()!;
    for (let k = 0; k < index.count; k += 3) {
      const [i, j, l] = [index.getX(k), index.getX(k + 1), index.getX(k + 2)];
      const e1 = [pos.getX(j) - pos.getX(i), pos.getZ(j) - pos.getZ(i)];
      const e2 = [pos.getX(l) - pos.getX(i), pos.getZ(l) - pos.getZ(i)];
      expect(pos.getY(i)).toBeCloseTo(2.7);
      expect(e1[1] * e2[0] - e1[0] * e2[1]).toBeLessThan(0);
    }
  });

  it('builds a prism between y0 and y0 + height', () => {
    const g = buildPrismGeometry(square, 0, SKIRTING_HEIGHT);
    g.computeBoundingBox();
    expect(g.boundingBox!.min.y).toBeCloseTo(0);
    expect(g.boundingBox!.max.y).toBeCloseTo(SKIRTING_HEIGHT);
    expect(g.boundingBox!.max.z).toBeCloseTo(1);
  });
});

describe('RoomBuilder surfaces', () => {
  const room: RoomShape = {
    outline: [
      { x: -2, y: -1.5 },
      { x: 2, y: -1.5 },
      { x: 2, y: 1.5 },
      { x: -2, y: 1.5 },
    ],
    wallIds: ['a', 'b', 'c', 'd'],
    height: 2.7,
    openings: [
      { id: 'win', kind: 'window', wall: 0, start: 1, end: 2.5, bottom: 0.9, top: 2.1 },
      { id: 'door1', kind: 'door', wall: 1, start: 0.5, end: 1.4, bottom: 0, top: 2.04 },
      { id: 'door2', kind: 'door', wall: 2, start: 0.5, end: 1.4, bottom: 0, top: 2.04 },
    ],
  };
  const paint: SurfacePaint = {
    base: '#999999',
    walls: { a: '#111111', b: '#222222', c: '#333333', d: '#444444' },
    skirting: { a: '#111111', b: '#222222', c: '#333333', d: '#444444' },
    doors: { door1: '#aa0000', door2: '#00aa00' },
    ceiling: '#f7f5f0',
  };
  const tagOf = (m: { userData: Record<string, unknown> }) =>
    m.userData['surface'] as { kind: string; id?: string };
  const hex = (m: unknown) => (m as MeshStandardMaterial).color.getHexString();

  function build(shape = room): RoomBuilder {
    const b = new RoomBuilder();
    b.setRoom(shape);
    return b;
  }

  it('creates one material per wall, per wall skirting and per door, and tags the meshes', () => {
    const b = build();
    // 4 walls + 4 skirting + 2 doors + the ceiling.
    expect(b.materialCount).toBe(11);
    const tags = b.pickables.map(tagOf);
    for (const id of ['a', 'b', 'c', 'd']) {
      expect(tags).toContainEqual({ kind: 'wall', id });
    }
    expect(tags).toContainEqual({ kind: 'door', id: 'door1' });
    expect(tags).toContainEqual({ kind: 'door', id: 'door2' });
    expect(tags).toContainEqual({ kind: 'skirting' });
    expect(tags).toContainEqual({ kind: 'ceiling' });
    // Window frames and glass are not pickable.
    expect(tags.every((t) => ['wall', 'door', 'skirting', 'ceiling'].includes(t.kind))).toBe(true);
    b.dispose();
  });

  it('paints the door leaf and its casing, but not the handle', () => {
    const b = build();
    b.applyPaint(paint);
    const door1 = b.pickables.filter((m) => tagOf(m).kind === 'door' && tagOf(m).id === 'door1');
    // 3 casing boxes + the leaf + 3 metal handle parts.
    expect(door1).toHaveLength(7);
    expect(door1.filter((m) => hex(m.material) === 'aa0000')).toHaveLength(4);
    b.dispose();
  });

  it('recolours existing materials without touching geometry', () => {
    const b = build();
    const geometries = b.pickables.map((m) => m.geometry);
    b.applyPaint(paint);
    b.applyPaint({ ...paint, walls: { ...paint.walls, a: '#abcdef' } });
    expect(b.pickables.map((m) => m.geometry)).toEqual(geometries);
    const wallA = b.pickables.find((m) => tagOf(m).id === 'a')!;
    expect(hex(wallA.material)).toBe('abcdef');
    b.dispose();
  });

  it('falls back to the base wall colour for ids missing from the paint', () => {
    const b = build();
    b.applyPaint({ ...paint, base: '#123456', walls: { a: '#abcdef' }, skirting: {}, doors: {} });
    const wallC = b.pickables.find((m) => tagOf(m).id === 'c')!;
    expect(hex(wallC.material)).toBe('123456');
    b.dispose();
  });

  it('keeps the paint across a rebuild', () => {
    const b = build();
    b.applyPaint(paint);
    b.setRoom({ ...room, height: 3 });
    expect(hex(b.pickables.find((m) => tagOf(m).id === 'b')!.material)).toBe('222222');
    b.dispose();
  });

  it('disposes the old materials on every rebuild (no leaks)', () => {
    const dispose = vi.spyOn(MeshStandardMaterial.prototype, 'dispose');
    const b = build();
    for (let i = 0; i < 19; i++) {
      b.setRoom({ ...room, height: 2.5 + i * 0.01 });
      expect(b.materialCount).toBe(11);
    }
    // 19 rebuilds each dispose the 10 per-surface materials of the previous shell.
    expect(dispose).toHaveBeenCalledTimes(19 * 10);
    b.dispose();
    expect(b.materialCount).toBe(1);
    dispose.mockRestore();
  });

  it('highlights a single surface or a whole group, and clears it', () => {
    const b = build();
    b.applyPaint(paint);
    const glow = (id: string) =>
      (b.pickables.find((m) => tagOf(m).id === id)!.material as MeshStandardMaterial)
        .emissiveIntensity;
    b.setHighlight({ kind: 'wall', id: 'a' });
    expect(glow('a')).toBeCloseTo(highlightIntensity({ kind: 'wall', id: 'a' }, '#111111'), 5);
    // #111111 is dark: the tint is weaker than on a light surface.
    expect(glow('a')).toBeLessThan(HIGHLIGHT_INTENSITY_SINGLE);
    expect(glow('b')).toBe(1);
    b.setHighlight({ kind: 'walls' });
    expect(glow('a')).toBeCloseTo(highlightIntensity({ kind: 'walls' }, '#111111'), 5);
    expect(glow('a')).toBeLessThan(HIGHLIGHT_INTENSITY);
    expect(glow('d')).toBeLessThan(HIGHLIGHT_INTENSITY);
    b.setHighlight({ kind: 'doors' });
    expect(glow('door1')).toBeCloseTo(highlightIntensity({ kind: 'doors' }, '#aa0000'), 5);
    expect(glow('a')).toBe(1);
    // The highlight survives a rebuild, and a missing target is a no-op.
    b.setRoom({ ...room, height: 3 });
    expect(glow('door2')).toBeGreaterThan(1e-3);
    expect(glow('door2')).toBeLessThan(1);
    b.setHighlight({ kind: 'wall', id: 'gone' });
    expect(glow('door2')).toBe(1);
    b.setHighlight(null);
    expect(glow('a')).toBe(1);
    b.dispose();
  });
});
