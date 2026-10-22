// Generates public/parquet.svg: seamless golden-oak herringbone tile.
// Planks are 1:5, laid at +-45 degrees (zigzag spine vertical), each with its own
// wavy grain paths, cathedral arches, pores and the occasional knot.
// Run from repo root: node docs/design/generate-parquet.mjs
import { writeFileSync, mkdirSync } from 'node:fs';

const C = 30; // plank width in px
const L = 5; // plank length in widths (1:5)
const K = 2; // tile = K plank-lengths wide ...
const M = 10; // ... and M cells tall (K*L == M keeps it square)
const SQ = Math.SQRT2;
const WT = SQ * L * K * C; // tile width px
const HT = SQ * M * C; // tile height px
const LC = L * C; // plank length px
const G = 0.5; // seam inset

const mod = (a, n) => ((a % n) + n) % n;
const f = (n) => String(Math.round(n * 10) / 10);
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hsl(h, s, l) {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const g = (n) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${g(0)}${g(8)}${g(4)}`;
}
// golden oak: #c58a4a #b97c3e #d39a5a #a86c34 as [h, s, l]
const bases = [
  [31, 52, 54],
  [30, 50, 49],
  [31, 61, 60],
  [29, 52, 43],
];
const GRAIN = '#6b3f1c';

// Plank origin (cell units, pre-rotation) for horizontal / vertical planks.
const planks = [];
for (let n = -80; n < 80; n++) {
  for (let m = -12; m < 12; m++) {
    planks.push({ t: 'h', x: n + 2 * L * m, y: n });
    planks.push({ t: 'v', x: n + 2 * L - 1 + 2 * L * m, y: n });
  }
}
const rot = (x, y) => [((x - y) / SQ) * C, ((x + y) / SQ) * C];

function grain(r) {
  const lines = [[], [], []];
  const styles = [
    { w: 0.45, o: 0.28 },
    { w: 0.8, o: 0.34 },
    { w: 1.3, o: 0.4 },
  ];
  const n = 11 + Math.floor(r() * 6);
  const lam = 100 + r() * 160;
  const phi = r() * 6.28;
  const A0 = 0.7 + r() * 1.9;
  const steps = Math.round(LC / 9);
  for (let i = 0; i < n; i++) {
    const y0 = ((i + 0.5 + (r() - 0.5) * 0.9) / n) * C;
    const amp = A0 * (0.7 + r() * 0.6);
    const ph = phi + (y0 / C) * 1.6 + r() * 0.5;
    const a = r() < 0.4 ? r() * 0.4 : 0;
    const b = r() < 0.4 ? 1 - r() * 0.4 : 1;
    let d = '';
    for (let j = Math.floor(a * steps); j <= Math.floor(b * steps); j++) {
      const x = (j / steps) * LC;
      const y =
        y0 +
        amp * Math.sin((6.283 * x) / lam + ph) +
        amp * 0.45 * Math.sin((6.283 * x) / (lam * 0.37) + ph * 2.3);
      d += `${d ? 'L' : 'M'}${f(x)} ${f(y)}`;
    }
    lines[Math.floor(r() * 3)].push(d);
  }
  let out = lines
    .map((ds, i) =>
      ds.length
        ? `<path d="${ds.join('')}" fill="none" stroke="${GRAIN}" stroke-width="${styles[i].w}" stroke-opacity="${styles[i].o}" stroke-linejoin="round"/>`
        : '',
    )
    .join('');

  // cathedral arches: nested U shapes opening toward -x
  const arches = r() < 0.9 ? 1 + Math.floor(r() * 2) : 0;
  let ad = '';
  for (let k = 0; k < arches; k++) {
    const xa = (0.15 + r() * 0.55) * LC;
    const yc = (0.2 + r() * 0.6) * C;
    const rings = 4 + Math.floor(r() * 3);
    for (let q = 0; q < rings; q++) {
      const h = C * (0.18 + q * 0.17);
      const w = 14 + q * 16;
      for (let s = -6; s <= 6; s++) {
        const t = s / 6;
        const x = xa + w * (1 - Math.pow(Math.abs(t), 1.5));
        const y = yc + t * h;
        ad += `${s === -6 ? 'M' : 'L'}${f(x)} ${f(y)}`;
      }
    }
  }
  if (ad)
    out += `<path d="${ad}" fill="none" stroke="${GRAIN}" stroke-width="0.7" stroke-opacity="0.34" stroke-linejoin="round"/>`;

  // pores (dark) and medullary flecks (light)
  let pores = '';
  for (let i = 0; i < 28; i++) pores += `M${f(r() * LC)} ${f(r() * C)}l.7 .1`;
  out += `<path d="${pores}" stroke="#4a2810" stroke-width="0.9" stroke-opacity="0.4" stroke-linecap="round"/>`;
  let flecks = '';
  for (let i = 0; i < 8; i++) flecks += `M${f(r() * LC)} ${f(r() * C)}l${f(3 + r() * 5)} .3`;
  out += `<path d="${flecks}" stroke="#f3d29a" stroke-width="0.7" stroke-opacity="0.3" stroke-linecap="round"/>`;

  // occasional knot
  if (r() < 0.09) {
    const kx = (0.2 + r() * 0.6) * LC;
    const ky = (0.3 + r() * 0.4) * C;
    const rx = 3.5 + r() * 2.5;
    const ry = 2.5 + r() * 1.5;
    out += `<ellipse cx="${f(kx)}" cy="${f(ky)}" rx="${f(rx * 2.4)}" ry="${f(ry * 2.2)}" fill="none" stroke="${GRAIN}" stroke-opacity="0.3" stroke-width="0.8"/>`;
    out += `<ellipse cx="${f(kx)}" cy="${f(ky)}" rx="${f(rx * 1.5)}" ry="${f(ry * 1.5)}" fill="none" stroke="${GRAIN}" stroke-opacity="0.4" stroke-width="0.8"/>`;
    out += `<ellipse cx="${f(kx)}" cy="${f(ky)}" rx="${f(rx)}" ry="${f(ry)}" fill="#4b2a12" fill-opacity="0.75"/>`;
  }
  return out;
}

// soft bevel: highlight edges facing the top-left light, shadow edges facing away
function bevel(angleDeg) {
  const a = (angleDeg * Math.PI) / 180;
  const edges = [
    { n: [0, -1], d: `M${G} ${G}H${LC - G}` },
    { n: [0, 1], d: `M${G} ${C - G}H${LC - G}` },
    { n: [-1, 0], d: `M${G} ${G}V${C - G}` },
    { n: [1, 0], d: `M${LC - G} ${G}V${C - G}` },
  ];
  let out = '';
  for (const e of edges) {
    const nx = e.n[0] * Math.cos(a) - e.n[1] * Math.sin(a);
    const ny = e.n[0] * Math.sin(a) + e.n[1] * Math.cos(a);
    const dot = (-nx - ny) / SQ;
    if (dot > 0.3)
      out += `<path d="${e.d}" stroke="#fff1cf" stroke-opacity="0.26" stroke-width="0.9" fill="none"/>`;
    else if (dot < -0.3)
      out += `<path d="${e.d}" stroke="#3a1c06" stroke-opacity="0.3" stroke-width="0.9" fill="none"/>`;
  }
  return out;
}

const defs =
  `<defs>` +
  `<clipPath id="pc"><rect x="${G}" y="${G}" width="${LC - 2 * G}" height="${C - 2 * G}" rx="0.8"/></clipPath>` +
  `<linearGradient id="cx" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a1c06" stop-opacity="0.12"/><stop offset="0.5" stop-color="#fff2d0" stop-opacity="0.07"/><stop offset="1" stop-color="#3a1c06" stop-opacity="0.12"/></linearGradient>` +
  `</defs>`;
const bevH = bevel(45);
const bevV = bevel(135);

let out = '';
let count = 0;
for (const p of planks) {
  const ox = p.t === 'h' ? p.x : p.x + 1;
  const [px, py] = rot(ox, p.y);
  const ang = p.t === 'h' ? 45 : 135;
  // bounding box of the rotated plank
  const w = p.t === 'h' ? L : 1;
  const h = p.t === 'h' ? 1 : L;
  const xs = [],
    ys = [];
  for (const [cx, cy] of [
    [p.x, p.y],
    [p.x + w, p.y],
    [p.x, p.y + h],
    [p.x + w, p.y + h],
  ]) {
    const [a, b] = rot(cx, cy);
    xs.push(a);
    ys.push(b);
  }
  if (Math.min(...xs) >= WT || Math.max(...xs) <= 0 || Math.min(...ys) >= HT || Math.max(...ys) <= 0) continue;

  // identity modulo the tile's lattice so edge-crossing planks match on the other side
  const u = mod(p.x - p.y, 2 * L * K);
  const s = mod(p.x + p.y, 2 * M);
  const r = rng(u * 1013 + s * 37 + (p.t === 'h' ? 5 : 11));
  const b = bases[Math.floor(r() * bases.length)];
  const col = hsl(b[0] + (r() - 0.5) * 4, b[1] + (r() - 0.5) * 8, b[2] + (r() - 0.5) * 6);
  out +=
    `<g transform="translate(${f(px)} ${f(py)}) rotate(${ang})">` +
    `<rect x="${G}" y="${G}" width="${LC - 2 * G}" height="${C - 2 * G}" rx="0.8" fill="${col}"/>` +
    `<g clip-path="url(#pc)">${grain(r)}<rect width="${LC}" height="${C}" fill="url(#cx)"/></g>` +
    (p.t === 'h' ? bevH : bevV) +
    `</g>`;
  count++;
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(WT)} ${f(HT)}" width="${f(WT)}" height="${f(HT)}">${defs}<rect width="${f(WT)}" height="${f(HT)}" fill="#6a3f1b"/>${out}</svg>`;
mkdirSync('public', { recursive: true });
writeFileSync('public/parquet.svg', svg);
console.log(`public/parquet.svg ${Math.round(svg.length / 1024)} KB, ${count} planks`);
