import { RoomShape } from '../plan/room-shape';
import { outwardNormal } from '../plan/polygon';

/** Window outward normal . sun direction above which the sun counts as facing the window. */
const FACING = 0.15;

/**
 * Does some window face the sun? Azimuth in degrees; 180 is the sun on the -z side (the simple
 * room's window), matching `sunDirection`. Pure and three-free, used for the Light tab hint.
 */
export function sunHitsWindow(shape: RoomShape, azimuthDeg: number): boolean {
  const az = (azimuthDeg * Math.PI) / 180;
  const sx = Math.sin(az);
  const sz = Math.cos(az);
  const n = shape.outline.length;
  return shape.openings.some((o) => {
    if (o.kind !== 'window') {
      return false;
    }
    const normal = outwardNormal(shape.outline[o.wall], shape.outline[(o.wall + 1) % n]);
    return normal.x * sx + normal.y * sz > FACING;
  });
}
