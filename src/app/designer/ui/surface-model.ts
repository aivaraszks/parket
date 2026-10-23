import { sameSurface, SurfacePaint, SurfaceRef } from '../plan/paint';
import { RoomShape } from '../plan/room-shape';

export type SurfaceSection = 'walls' | 'doors' | 'other';

export interface SurfaceItem {
  readonly ref: SurfaceRef;
  readonly section: SurfaceSection;
  /** Text of the list chip: "Wall 1 (window)". */
  readonly label: string;
  /** Name inside sentences: "Wall 1", "all walls". */
  readonly name: string;
  /** Name at the start of a sentence: "Wall 1", "All walls", "Ceiling". */
  readonly subject: string;
  /** Colour of the chip dot. */
  readonly hex: string;
  /** Text of the Which chip: "All", "3". */
  readonly chip: string;
  /** Accessible name of the Which chip: "All walls", "Wall 1, has the window". */
  readonly chipName: string;
}

/** The What chips: which kind of surface is being coloured. */
export type WhatId = 'walls' | 'doors' | 'ceiling' | 'skirting';

export interface WhatOption {
  readonly id: WhatId;
  readonly label: string;
  /** What choosing the chip selects: "All" of the group, or the single ceiling/skirting item. */
  readonly ref: SurfaceRef;
}

export function whatOf(ref: SurfaceRef | null): WhatId | null {
  switch (ref?.kind) {
    case 'walls':
    case 'wall':
      return 'walls';
    case 'doors':
    case 'door':
      return 'doors';
    case 'ceiling':
      return 'ceiling';
    case 'skirting':
      return 'skirting';
    default:
      return null;
  }
}

const WHAT_OPTIONS: readonly WhatOption[] = [
  { id: 'walls', label: 'Walls', ref: { kind: 'walls' } },
  { id: 'doors', label: 'Doors', ref: { kind: 'doors' } },
  { id: 'ceiling', label: 'Ceiling', ref: { kind: 'ceiling' } },
  { id: 'skirting', label: 'Skirting', ref: { kind: 'skirting' } },
];

/** The What chips that exist for these items (Doors only when the room has doors). */
export function whatOptions(items: readonly SurfaceItem[]): WhatOption[] {
  return WHAT_OPTIONS.filter(
    (option) => option.id !== 'doors' || items.some((item) => item.section === 'doors'),
  );
}

/** The Which chips of a What group; empty for ceiling and skirting (a note takes the row). */
export function whichItems(items: readonly SurfaceItem[], what: WhatId | null): SurfaceItem[] {
  return what === 'walls' || what === 'doors' ? items.filter((item) => item.section === what) : [];
}

export interface SurfaceColours {
  readonly paint: SurfacePaint;
  readonly wallColor: string;
  /** Group door colour; null = auto. */
  readonly doorColor: string | null;
}

export function doorIds(shape: RoomShape): string[] {
  return shape.openings.filter((o) => o.kind === 'door').map((o) => o.id);
}

/** Every surface in list order. Doors exist only in a custom shape (simple mode has none). */
export function surfaceItems(
  shape: RoomShape,
  simple: boolean,
  colours: SurfaceColours,
): SurfaceItem[] {
  const { paint, wallColor, doorColor } = colours;
  const items: SurfaceItem[] = [
    {
      ref: { kind: 'walls' },
      section: 'walls',
      label: 'All walls',
      name: 'all walls',
      subject: 'All walls',
      hex: wallColor,
      chip: 'All',
      chipName: 'All walls',
    },
  ];
  shape.wallIds.forEach((id, i) => {
    items.push({
      ref: { kind: 'wall', id },
      section: 'walls',
      label: `Wall ${i + 1}${simple && i === 0 ? ' (window)' : ''}`,
      name: `Wall ${i + 1}`,
      subject: `Wall ${i + 1}`,
      hex: paint.walls[id] ?? wallColor,
      chip: `${i + 1}`,
      chipName: `Wall ${i + 1}${simple && i === 0 ? ', has the window' : ''}`,
    });
  });
  const doors = doorIds(shape);
  if (doors.length > 0) {
    items.push({
      ref: { kind: 'doors' },
      section: 'doors',
      label: 'All doors',
      name: 'all doors',
      subject: 'All doors',
      hex: doorColor ?? paint.doors[doors[0]] ?? wallColor,
      chip: 'All',
      chipName: 'All doors',
    });
    doors.forEach((id, i) => {
      items.push({
        ref: { kind: 'door', id },
        section: 'doors',
        label: `Door ${i + 1}`,
        name: `Door ${i + 1}`,
        subject: `Door ${i + 1}`,
        chip: `${i + 1}`,
        chipName: `Door ${i + 1}`,
        hex: paint.doors[id] ?? wallColor,
      });
    });
  }
  items.push(
    {
      ref: { kind: 'ceiling' },
      section: 'other',
      label: 'Ceiling',
      name: 'the ceiling',
      subject: 'Ceiling',
      hex: paint.ceiling,
      chip: 'Ceiling',
      chipName: 'Ceiling',
    },
    {
      ref: { kind: 'skirting' },
      section: 'other',
      label: 'Skirting',
      name: 'the skirting',
      subject: 'Skirting',
      hex: paint.skirting[shape.wallIds[0]] ?? wallColor,
      chip: 'Skirting',
      chipName: 'Skirting',
    },
  );
  return items;
}

export function findItem(
  items: readonly SurfaceItem[],
  ref: SurfaceRef | null,
): SurfaceItem | undefined {
  return items.find((item) => sameSurface(item.ref, ref));
}
