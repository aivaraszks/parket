import { luminance, SurfaceRef } from '../plan/paint';

/** Selection tint (docs/design/components/colouring.md section 5); `--highlight-color`. */
export const HIGHLIGHT_COLOR = '#ffb454';
/** Emissive intensity for All walls / All doors on a light surface (low so colour can be judged). */
export const HIGHLIGHT_INTENSITY = 0.18;
/** Emissive intensity for one wall, door, the skirting or the ceiling on a light surface. */
export const HIGHLIGHT_INTENSITY_SINGLE = 0.26;
/** Share of the intensity kept on a black surface; it rises linearly up to a mid-light colour. */
export const HIGHLIGHT_DARK_SHARE = 0.45;
/** Surfaces at or above this luminance get the full intensity. */
export const HIGHLIGHT_FULL_LUMINANCE = 0.35;

/** The tint is scaled down on dark colours so a charcoal wall stays charcoal, not brown. */
export function highlightIntensity(ref: SurfaceRef, hex = '#ffffff'): number {
  const base =
    ref.kind === 'walls' || ref.kind === 'doors' ? HIGHLIGHT_INTENSITY : HIGHLIGHT_INTENSITY_SINGLE;
  const light = Math.min(1, luminance(hex) / HIGHLIGHT_FULL_LUMINANCE);
  return base * (HIGHLIGHT_DARK_SHARE + (1 - HIGHLIGHT_DARK_SHARE) * light);
}
