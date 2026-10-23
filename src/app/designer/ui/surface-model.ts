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
    });
    doors.forEach((id, i) => {
      items.push({
        ref: { kind: 'door', id },
        section: 'doors',
        label: `Door ${i + 1}`,
        name: `Door ${i + 1}`,
        subject: `Door ${i + 1}`,
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
    },
    {
      ref: { kind: 'skirting' },
      section: 'other',
      label: 'Skirting',
      name: 'the skirting',
      subject: 'Skirting',
      hex: paint.skirting[shape.wallIds[0]] ?? wallColor,
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
