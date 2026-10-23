import { describe, expect, it } from 'vitest';
import { RoomShape } from '../plan/room-shape';
import { diffRoom } from './room-change';

const room: RoomShape = {
  outline: [
    { x: -2, y: -1 },
    { x: 2, y: -1 },
    { x: 2, y: 1 },
    { x: -2, y: 1 },
  ],
  wallIds: ['s0', 's1', 's2', 's3'],
  height: 2.7,
  openings: [{ id: 'd1', kind: 'door', wall: 0, start: 1, end: 2, bottom: 0, top: 2 }],
};

describe('diffRoom', () => {
  it('rebuilds everything the first time', () => {
    expect(diffRoom(null, room)).toEqual({ shell: true, mask: true, placements: true });
  });

  it('rebuilds nothing for a structurally equal shape (a keyboard nudge back to the same spot)', () => {
    const copy: RoomShape = JSON.parse(JSON.stringify(room));
    expect(diffRoom(room, copy)).toEqual({ shell: false, mask: false, placements: false });
  });

  it('rebuilds only the shell for a height change', () => {
    expect(diffRoom(room, { ...room, height: 3 })).toEqual({
      shell: true,
      mask: false,
      placements: false,
    });
  });

  it('rebuilds the thresholds but not the planks when a door moves', () => {
    const moved = { ...room, openings: [{ ...room.openings[0], start: 1.2, end: 2.2 }] };
    expect(diffRoom(room, moved)).toEqual({ shell: true, mask: true, placements: false });
  });

  it('rebuilds only the shell when wall ids change (they key the per-wall materials)', () => {
    const renamed = { ...room, wallIds: ['a', 'b', 'c', 'd'] };
    expect(diffRoom(room, renamed)).toEqual({ shell: true, mask: false, placements: false });
  });

  it('rebuilds the planks when the outline changes', () => {
    const wider = { ...room, outline: room.outline.map((p) => ({ ...p, x: p.x * 1.1 })) };
    expect(diffRoom(room, wider)).toEqual({ shell: true, mask: true, placements: true });
  });
});
