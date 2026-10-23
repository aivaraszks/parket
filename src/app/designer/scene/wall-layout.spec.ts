import { describe, expect, it } from 'vitest';
import { RoomShape, ShapeOpening } from '../plan/room-shape';
import { wallLayout } from './wall-layout';

const door = (wall: number, start: number, end: number): ShapeOpening => ({
  id: `d${wall}${start}`,
  kind: 'door',
  wall,
  start,
  end,
  bottom: 0,
  top: 2.1,
});
const win = (wall: number, start: number, end: number, bottom = 0.9): ShapeOpening => ({
  id: `w${wall}${start}`,
  kind: 'window',
  wall,
  start,
  end,
  bottom,
  top: bottom + 1.2,
});

const rect = (openings: ShapeOpening[]): RoomShape => ({
  outline: [
    { x: -2.5, y: -2 },
    { x: 2.5, y: -2 },
    { x: 2.5, y: 2 },
    { x: -2.5, y: 2 },
  ],
  height: 2.7,
  openings,
});

describe('wallLayout', () => {
  it('describes each wall of a rectangle', () => {
    const walls = wallLayout(rect([]));
    expect(walls).toHaveLength(4);
    expect(walls[0].length).toBeCloseTo(5);
    expect(walls[0].dir).toEqual({ x: 1, y: 0 });
    expect(walls[0].normal).toEqual({ x: 0, y: -1 });
    expect(walls[1].length).toBeCloseTo(4);
    expect(walls[1].normal.x).toBeCloseTo(1);
    expect(walls[0].skirting).toEqual([[0, 5]]);
  });

  it('puts openings on their wall, sorted', () => {
    const walls = wallLayout(rect([win(1, 2, 3), win(1, 0.5, 1.5), door(2, 1, 2)]));
    expect(walls[1].openings.map((o) => o.start)).toEqual([0.5, 2]);
    expect(walls[2].openings).toHaveLength(1);
    expect(walls[0].openings).toHaveLength(0);
  });

  it('leaves a skirting gap at a door', () => {
    const walls = wallLayout(rect([door(0, 1, 2)]));
    expect(walls[0].skirting).toEqual([
      [0, 1],
      [2, 5],
    ]);
  });

  it('runs the skirting under raised windows but not under low ones', () => {
    expect(wallLayout(rect([win(0, 1, 2)]))[0].skirting).toEqual([[0, 5]]);
    expect(wallLayout(rect([win(0, 1, 2, 0)]))[0].skirting).toEqual([
      [0, 1],
      [2, 5],
    ]);
  });

  it('handles a door at the very start and two doors', () => {
    const walls = wallLayout(rect([door(0, 0.05, 0.95), door(0, 4, 4.9)]));
    expect(walls[0].skirting).toEqual([
      [0, 0.05],
      [0.95, 4],
      [4.9, 5],
    ]);
  });

  it('clamps openings that overrun the wall', () => {
    const walls = wallLayout(rect([door(0, 4.5, 6)]));
    expect(walls[0].openings[0].end).toBe(5);
  });
});
