// Procedural grain atlas painted on a 2D canvas. Ported from docs/design/generate-parquet.mjs
// (wavy grain lines, cathedral arches, pores, flecks, rare knots), one cell per plank variant.
import { Species } from '../state/species';
import { createRandom, hashSeed } from './random';

export const ATLAS_COLUMNS = 2;
export const ATLAS_ROWS = 6;
export const VARIANT_COUNT = ATLAS_COLUMNS * ATLAS_ROWS;
/** Cell aspect (length : width). Planks with a smaller ratio use part of the cell length. */
export const CELL_ASPECT = 6;

export interface AtlasSize {
  width: number;
  height: number;
}

export interface UvRect {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}

export function atlasSize(lowMemory: boolean): AtlasSize {
  return lowMemory ? { width: 1024, height: 512 } : { width: 2048, height: 1024 };
}

/**
 * UV rectangle of a variant for planks of the given length : width ratio. The rectangle is
 * inset by a few texels so mipmapping does not bleed neighbouring cells into the plank.
 * v1 > v0 means the plank's width axis runs along atlas rows top to bottom in canvas space.
 */
export function variantUv(variant: number, size: AtlasSize, ratio: number): UvRect {
  const cellW = size.width / ATLAS_COLUMNS;
  const cellH = size.height / ATLAS_ROWS;
  const col = variant % ATLAS_COLUMNS;
  const row = Math.floor(variant / ATLAS_COLUMNS) % ATLAS_ROWS;
  const inset = (size.width / 2048) * 4;
  const usable = Math.min(1, Math.max(0.15, ratio / CELL_ASPECT));
  const x0 = col * cellW + inset;
  const x1 = x0 + (cellW - 2 * inset) * usable;
  // Canvas rows run top to bottom; texture v runs bottom to top (flipY), so flip here.
  const yTop = row * cellH + inset;
  const yBottom = (row + 1) * cellH - inset;
  return {
    u0: x0 / size.width,
    u1: x1 / size.width,
    v0: 1 - yBottom / size.height,
    v1: 1 - yTop / size.height,
  };
}

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l * 100];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s * 100, l * 100];
}

function hashString(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = (Math.imul(h, 31) + text.charCodeAt(i)) | 0;
  }
  return h;
}

function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
}

/** Paint the whole atlas for a species onto the canvas (resizing it if needed). */
export function paintAtlas(canvas: HTMLCanvasElement, species: Species, size: AtlasSize): void {
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('2D canvas is not available.');
  }
  const cellW = size.width / ATLAS_COLUMNS;
  const cellH = size.height / ATLAS_ROWS;
  const speciesSeed = hashString(species.id);
  for (let index = 0; index < VARIANT_COUNT; index++) {
    const col = index % ATLAS_COLUMNS;
    const row = Math.floor(index / ATLAS_COLUMNS);
    ctx.save();
    ctx.translate(col * cellW, row * cellH);
    paintCell(ctx, cellW, cellH, species, index, createRandom(hashSeed(speciesSeed, index, 7)));
    ctx.restore();
  }
}

function paintCell(
  ctx: CanvasRenderingContext2D,
  cw: number,
  ch: number,
  species: Species,
  index: number,
  r: () => number,
): void {
  const base = hexToHsl(species.bases[index % species.bases.length]);
  const hue = base[0] + (r() - 0.5) * 4;
  const sat = base[1] + (r() - 0.5) * 8;
  const light = base[2] + (r() - 0.5) * 6;
  ctx.fillStyle = `hsl(${hue.toFixed(1)} ${sat.toFixed(1)}% ${light.toFixed(1)}%)`;
  ctx.fillRect(0, 0, cw, ch);

  // Keep a plain border so mipmaps do not bleed grain across cells.
  const pad = Math.max(3, ch * 0.025);
  ctx.save();
  ctx.beginPath();
  ctx.rect(pad, pad, cw - 2 * pad, ch - 2 * pad);
  ctx.clip();

  const strength = species.grainStrength / 0.8;
  const px = ch / 170; // 1 at the full-size atlas (about 1.7 px per mm)

  // Slow colour drift along the plank.
  for (let i = 0; i < 5; i++) {
    const y = r() * ch;
    const h = ch * (0.15 + r() * 0.4);
    const gradient = ctx.createLinearGradient(0, y - h, 0, y + h);
    const dark = r() < 0.5;
    const colour = dark ? species.grain : '#fff2d0';
    const alpha = (dark ? 0.07 : 0.06) * (0.5 + r());
    gradient.addColorStop(0, withAlpha(colour, 0));
    gradient.addColorStop(0.5, withAlpha(colour, alpha));
    gradient.addColorStop(1, withAlpha(colour, 0));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, y - h, cw, 2 * h);
  }

  // Wavy growth lines in three weights.
  const widths = [0.7 * px, 1.2 * px, 2 * px];
  const alphas = [0.28, 0.34, 0.4];
  const paths = [new Path2D(), new Path2D(), new Path2D()];
  const lines = 15 + Math.floor(r() * 8);
  const lam = cw * (0.5 + r() * 0.9);
  const phi = r() * 6.28;
  const amp0 = (0.7 + r() * 1.9) * (ch / 30);
  const steps = Math.round(cw / 12);
  for (let i = 0; i < lines; i++) {
    const y0 = ((i + 0.5 + (r() - 0.5) * 0.9) / lines) * ch;
    const amp = amp0 * (0.7 + r() * 0.6);
    const ph = phi + (y0 / ch) * 1.6 + r() * 0.5;
    const a = r() < 0.4 ? r() * 0.4 : 0;
    const b = r() < 0.4 ? 1 - r() * 0.4 : 1;
    const path = paths[Math.floor(r() * 3)];
    for (let j = Math.floor(a * steps); j <= Math.floor(b * steps); j++) {
      const x = (j / steps) * cw;
      const y =
        y0 +
        amp * Math.sin((6.283 * x) / lam + ph) +
        amp * 0.45 * Math.sin((6.283 * x) / (lam * 0.37) + ph * 2.3);
      if (j === Math.floor(a * steps)) path.moveTo(x, y);
      else path.lineTo(x, y);
    }
  }
  ctx.lineJoin = 'round';
  ctx.strokeStyle = species.grain;
  for (let i = 0; i < 3; i++) {
    ctx.globalAlpha = Math.min(1, alphas[i] * strength);
    ctx.lineWidth = widths[i];
    ctx.stroke(paths[i]);
  }

  // Fine fibres.
  ctx.globalAlpha = 0.1 * strength;
  ctx.lineWidth = 0.6 * px;
  ctx.beginPath();
  for (let i = 0; i < 90; i++) {
    const x = r() * cw;
    const y = r() * ch;
    ctx.moveTo(x, y);
    ctx.lineTo(x + (20 + r() * 90) * px, y + (r() - 0.5) * 2 * px);
  }
  ctx.stroke();

  // Cathedral arches opening toward -x.
  const arches = r() < 0.9 ? 1 + Math.floor(r() * 2) : 0;
  if (arches > 0) {
    ctx.globalAlpha = 0.34 * strength;
    ctx.lineWidth = 1.2 * px;
    ctx.beginPath();
    for (let k = 0; k < arches; k++) {
      const xa = (0.15 + r() * 0.55) * cw;
      const yc = (0.2 + r() * 0.6) * ch;
      const rings = 4 + Math.floor(r() * 3);
      for (let q = 0; q < rings; q++) {
        const h = ch * (0.18 + q * 0.17);
        const w = ((14 + q * 16) / 150) * cw;
        for (let s = -6; s <= 6; s++) {
          const t = s / 6;
          const x = xa + w * (1 - Math.pow(Math.abs(t), 1.5));
          const y = yc + t * h;
          if (s === -6) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      }
    }
    ctx.stroke();
  }

  // Pores (dark) and medullary flecks (light).
  ctx.lineCap = 'round';
  ctx.globalAlpha = 0.4 * strength;
  ctx.strokeStyle = species.grain;
  ctx.lineWidth = 1.6 * px;
  ctx.beginPath();
  for (let i = 0; i < 170; i++) {
    const x = r() * cw;
    const y = r() * ch;
    ctx.moveTo(x, y);
    ctx.lineTo(x + (1 + r() * 3) * px, y + 0.2 * px);
  }
  ctx.stroke();
  ctx.globalAlpha = 0.3;
  ctx.strokeStyle = '#f3d29a';
  ctx.lineWidth = 1.2 * px;
  ctx.beginPath();
  for (let i = 0; i < 40; i++) {
    const x = r() * cw;
    const y = r() * ch;
    ctx.moveTo(x, y);
    ctx.lineTo(x + (10 + r() * 30) * px, y + 0.5 * px);
  }
  ctx.stroke();

  // The occasional knot.
  if (r() < 0.12) {
    const kx = (0.2 + r() * 0.6) * cw;
    const ky = (0.3 + r() * 0.4) * ch;
    const rx = (3.5 + r() * 2.5) * (ch / 30) * 0.9;
    const ry = (2.5 + r() * 1.5) * (ch / 30) * 0.9;
    ctx.strokeStyle = species.grain;
    ctx.lineWidth = 1.4 * px;
    for (const [scale, alpha] of [
      [2.4, 0.3],
      [1.5, 0.4],
    ]) {
      ctx.globalAlpha = alpha * strength;
      ctx.beginPath();
      ctx.ellipse(kx, ky, rx * scale, ry * scale * 0.9, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = withAlpha(species.grain, 1);
    ctx.beginPath();
    ctx.ellipse(kx, ky, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
