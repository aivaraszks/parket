import { planFromPoints } from '../plan/plan-fixtures';
import { Plan } from '../plan/plan-model';
import { DEFAULT_DESIGN, Design } from '../state/design-defaults';
import { sanitizeDesign } from '../state/design-state';
import {
  decodeShare,
  encodeShare,
  MAX_DATA_CHARS,
  MAX_LINK_CHARS,
  shareUrl,
  ShareTooLarge,
} from './share-codec';

/** 32 corners on a circle and 32 windows: the largest plan the editor allows. */
function worstCaseDesign(): Design {
  const points = Array.from({ length: 32 }, (_, i) => {
    const a = (i / 32) * 2 * Math.PI;
    return {
      x: Math.round(6000 * Math.cos(a)) / 1000 || 0,
      y: Math.round(6000 * Math.sin(a)) / 1000 || 0,
    };
  });
  const base = planFromPoints(points, 2.8);
  const plan: Plan = {
    ...base,
    openings: base.walls.map((wall, i) => ({
      id: `o${100 + i}`,
      wallId: wall.id,
      kind: 'window',
      offset: 0.3,
      width: 0.5,
      height: 1.2,
      sill: 0.9,
      anchor: 'floor',
    })),
    nextId: 200,
  };
  const hex = (i: number): string => `#${((i * 7919) % 0xffffff).toString(16).padStart(6, '0')}`;
  return sanitizeDesign({
    ...DEFAULT_DESIGN,
    mode: 'custom',
    plan,
    wallColor: '#a1b2c3',
    ceilingColor: '#fafafa',
    skirtingColor: '#123456',
    doorColor: '#654321',
    simpleWallColors: [hex(1), hex(2), hex(3), hex(4)],
    finish: 'gloss',
    angle: 33,
    wastePercent: 12,
  });
}

/** Builds a `1.<data>` token from arbitrary text, bypassing `encodeShare`. */
async function tokenFor(text: string, version = '1'): Promise<string> {
  const cs = new CompressionStream('deflate-raw');
  const writer = cs.writable.getWriter();
  void writer.write(new TextEncoder().encode(text));
  void writer.close();
  const chunks: Uint8Array[] = [];
  const reader = cs.readable.getReader();
  for (let r = await reader.read(); !r.done; r = await reader.read()) {
    chunks.push(r.value);
  }
  const bytes = Uint8Array.from(chunks.flatMap((c) => [...c]));
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  const data = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${version}.${data}`;
}

describe('share codec', () => {
  it('round-trips a simple design with its name', async () => {
    const design = sanitizeDesign({ ...DEFAULT_DESIGN, wallColor: '#112233', finish: 'matte' });
    const result = await decodeShare(await encodeShare(design, 'Kitchen'));
    expect(result).toEqual({ ok: true, name: 'Kitchen', design });
  });

  it('round-trips the worst-case custom design under the link limit', async () => {
    const design = worstCaseDesign();
    expect(design.mode).toBe('custom');
    expect(design.plan?.vertices.length).toBe(32);
    expect(design.plan?.openings.length).toBe(32);
    const token = await encodeShare(design, 'N'.repeat(40));
    expect(token.length).toBeLessThanOrEqual(MAX_LINK_CHARS);
    const result = await decodeShare(token);
    expect(result).toEqual({ ok: true, name: 'N'.repeat(40), design });
  });

  it('builds the link at the site root and replaces an old hash', () => {
    expect(shareUrl('https://x.test/parket/', '1.abc')).toBe('https://x.test/parket/#s=1.abc');
    expect(shareUrl('https://x.test/parket/#s=old', '1.abc')).toBe(
      'https://x.test/parket/#s=1.abc',
    );
  });

  it('refuses to encode a link that is too long', async () => {
    const huge = sanitizeDesign(DEFAULT_DESIGN);
    // Incompressible name-less padding: unknown keys survive JSON but cannot beat deflate, so
    // force the limit with random-looking species text instead.
    let seed = 1;
    const noise = Array.from({ length: 12000 }, () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return String.fromCharCode(33 + (seed % 90));
    }).join('');
    const bloated = { ...huge, species: noise } as Design;
    await expect(encodeShare(bloated, 'x')).rejects.toBeInstanceOf(ShareTooLarge);
  });

  describe('rejects hostile input', () => {
    it('an unknown (newer) version', async () => {
      expect(await decodeShare(await tokenFor('{}', '2'))).toEqual({
        ok: false,
        reason: 'newer-version',
      });
    });

    it('a malformed version', async () => {
      expect(await decodeShare('x.abc')).toEqual({ ok: false, reason: 'invalid' });
      expect(await decodeShare('abc')).toEqual({ ok: false, reason: 'invalid' });
      expect(await decodeShare('')).toEqual({ ok: false, reason: 'invalid' });
    });

    it('characters outside base64url', async () => {
      expect(await decodeShare('1.ab+/=')).toEqual({ ok: false, reason: 'invalid' });
      expect(await decodeShare('1.<script>')).toEqual({ ok: false, reason: 'invalid' });
      expect(await decodeShare('1.')).toEqual({ ok: false, reason: 'invalid' });
    });

    it('more than the allowed characters, before decoding', async () => {
      expect(await decodeShare('1.' + 'A'.repeat(MAX_DATA_CHARS))).toEqual({
        ok: false,
        reason: 'too-large',
      });
    });

    it('a deflate bomb over 64 KB of output', async () => {
      const token = await tokenFor('{"n":"x","d":{},"pad":"' + 'a'.repeat(200_000) + '"}');
      expect(token.length).toBeLessThan(MAX_DATA_CHARS);
      expect(await decodeShare(token)).toEqual({ ok: false, reason: 'too-large' });
    });

    it('data that is not deflate', async () => {
      expect(await decodeShare('1.AAAAAAAA')).toEqual({ ok: false, reason: 'invalid' });
      expect(await decodeShare('1.A')).toEqual({ ok: false, reason: 'invalid' });
    });

    it('non-JSON, a JSON array, scalars and a missing design', async () => {
      for (const text of ['not json', '[1,2]', '42', 'null', '{"n":"x"}', '{"d":[]}', '{"d":3}']) {
        expect(await decodeShare(await tokenFor(text))).toEqual({ ok: false, reason: 'invalid' });
      }
    });
  });

  it('sanitises a valid object with hostile fields', async () => {
    const hostile = {
      n: '<img src=x onerror=alert(1)>\u0007' + 'z'.repeat(100),
      d: {
        mode: 'custom',
        plan: { vertices: [{ id: 'v1', x: 'a', y: 0 }] },
        wallColor: 'url(javascript:1)',
        species: { toString: 1 },
        room: { length: 1e9, width: -5, height: 'tall' },
        __proto__: { polluted: true },
      },
    };
    const result = await decodeShare(await tokenFor(JSON.stringify(hostile)));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.name).not.toMatch(/[\u0000-\u001f]/);
      expect(Array.from(result.name ?? '').length).toBeLessThanOrEqual(40);
      expect(result.design.mode).toBe('simple');
      expect(result.design.plan).toBeNull();
      expect(result.design.wallColor).toBe(DEFAULT_DESIGN.wallColor);
      expect(result.design.room.length).toBeLessThan(1000);
      expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    }
  });

  it('gives a null name when the payload has none', async () => {
    const result = await decodeShare(await tokenFor('{"d":{}}'));
    expect(result.ok && result.name).toBeNull();
  });
});
