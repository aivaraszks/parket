// Error code -> copy (UX spec, "Errors and the reason chip"). The subject picks the wording of
// codes that mean different things for walls and for openings.

import { PLAN_LIMITS as L, PlanError } from '../plan/plan-model';

const m2 = (n: number): string => n.toFixed(2);

export function errorMessage(error: PlanError | undefined): string {
  switch (error?.code) {
    case 'self-intersection':
      return "Walls can't cross each other.";
    case 'wall-too-short':
      return `Walls must be at least ${m2(L.wallLengthMin)} m long.`;
    case 'angle-too-sharp':
      return `That corner is too sharp. Keep it between ${L.angleDeg.min}° and ${L.angleDeg.max}°.`;
    case 'walls-too-close':
      return `Walls must stay at least ${m2(L.clearance)} m apart.`;
    case 'too-many-corners':
      return `A room can have up to ${L.corners.max} corners.`;
    case 'too-few-corners':
      return `A room needs at least ${L.corners.min} corners.`;
    case 'too-large':
      return `The room can be at most ${L.bboxMax} m across.`;
    case 'area-out-of-range':
      return `The floor area must be ${L.area.min} to ${L.area.max} m².`;
    case 'height-out-of-range':
      return `Use ${m2(L.height.min)} to ${m2(L.height.max)} m.`;
    case 'ceiling-too-low':
      return 'Doors and windows set the lowest height. Raise the ceiling or make them smaller.';
    case 'opening-does-not-fit':
      return error.subject === 'opening'
        ? "Doesn't fit on this wall."
        : 'Too short for its door or window.';
    case 'openings-overlap':
      return 'Too close to another door or window. Leave at least 5 cm.';
    case 'too-many-openings':
      return `A room can have up to ${L.maxOpenings} doors and windows.`;
    case 'opening-size-out-of-range':
      return 'That size is outside the allowed range.';
    default:
      return "That change isn't possible.";
  }
}
