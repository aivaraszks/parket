// Derived, display-ready facts about a plan: numbered corners and walls, angles, lengths, totals.
// Pure. "Wall n" runs from corner n to corner n + 1 (loop order).

import { Plan, PlanOpening, planLoop } from '../plan/plan-model';
import { interiorAngles, perimeter, signedArea } from '../plan/polygon';

export interface CornerInfo {
  id: string;
  /** 0-based loop position; the user sees index + 1. */
  index: number;
  name: string;
  x: number;
  y: number;
  /** Interior angle in degrees. */
  angle: number;
}

export interface WallInfo {
  id: string;
  index: number;
  name: string;
  length: number;
  from: CornerInfo;
  to: CornerInfo;
  /** Sorted along the wall. */
  openings: PlanOpening[];
}

export interface PlanInfo {
  corners: CornerInfo[];
  walls: WallInfo[];
  area: number;
  perimeter: number;
  height: number;
  doors: number;
  windows: number;
}

export function planInfo(plan: Plan): PlanInfo | null {
  const loop = planLoop(plan);
  if (!loop) {
    return null;
  }
  const points = loop.vertices.map((v) => ({ x: v.x, y: v.y }));
  const angles = interiorAngles(points);
  const corners = loop.vertices.map((v, index): CornerInfo => ({
    id: v.id,
    index,
    name: `Corner ${index + 1}`,
    x: v.x,
    y: v.y,
    angle: angles[index],
  }));
  const walls = loop.walls.map((w, index): WallInfo => {
    const from = corners[index];
    const to = corners[(index + 1) % corners.length];
    return {
      id: w.id,
      index,
      name: `Wall ${index + 1}`,
      length: Math.hypot(to.x - from.x, to.y - from.y),
      from,
      to,
      openings: plan.openings.filter((o) => o.wallId === w.id).sort((a, b) => a.offset - b.offset),
    };
  });
  return {
    corners,
    walls,
    area: Math.abs(signedArea(points)),
    perimeter: perimeter(points),
    height: loop.room.height,
    doors: plan.openings.filter((o) => o.kind === 'door').length,
    windows: plan.openings.filter((o) => o.kind === 'window').length,
  };
}

export function kindName(opening: Pick<PlanOpening, 'kind'>): string {
  return opening.kind === 'door' ? 'Door' : 'Window';
}

/** "1 door", "2 windows", "1 door · 2 windows", "No doors or windows" style summary. */
export function openingsSummary(doors: number, windows: number): string {
  const door = doors === 0 ? 'No doors' : `${doors} ${doors === 1 ? 'door' : 'doors'}`;
  const window =
    windows === 0 ? 'No windows' : `${windows} ${windows === 1 ? 'window' : 'windows'}`;
  return `${door} · ${window}`;
}

const m = (n: number): string => n.toFixed(2);

export function cornerLabel(c: CornerInfo): string {
  return `${c.name}, x ${m(c.x)} metres, y ${m(c.y)} metres`;
}

export function wallLabel(w: WallInfo): string {
  const doors = w.openings.filter((o) => o.kind === 'door').length;
  const windows = w.openings.length - doors;
  const parts = [w.name, `${m(w.length)} metres`];
  if (doors > 0) parts.push(`${doors} ${doors === 1 ? 'door' : 'doors'}`);
  if (windows > 0) parts.push(`${windows} ${windows === 1 ? 'window' : 'windows'}`);
  return parts.join(', ');
}

export function openingLabel(o: PlanOpening, wall: WallInfo): string {
  return `${kindName(o)} on ${wall.name.toLowerCase()}, ${m(o.width)} metres wide`;
}
