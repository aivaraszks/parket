// The P7 contract: pure, no Angular.
//
// Link format: `<baseURI>#s=1.<data>` where `<data>` = base64url(deflate-raw(utf8(JSON))), no
// padding, and the JSON is `{ "n": name, "d": Design }`. Everything decoded is hostile input.

import { Design } from '../state/design-defaults';
import { sanitizeDesign } from '../state/design-sanitize';
import { sanitizeProjectName } from '../state/project-meta';

/** Payload version written by `encodeShare`; a decoder rejects any other as `newer-version`. */
export const SHARE_VERSION = 1;
/** `encodeShare` refuses a token longer than this (the whole link must stay shareable). */
export const MAX_LINK_CHARS = 8000;
/** `decodeShare` rejects input longer than this before doing any work. */
export const MAX_DATA_CHARS = 16000;
/** `decodeShare` aborts decompression past this many output bytes (zip-bomb guard). */
export const MAX_DECODED_BYTES = 64 * 1024;
/** The URL fragment prefix: the link ends in `#s=<token>`. */
export const SHARE_HASH_PREFIX = 's=';

/** Thrown by `encodeShare` when the token would exceed `MAX_LINK_CHARS`. */
export class ShareTooLarge extends Error {
  constructor() {
    super('This design is too big to share as a link.');
    this.name = 'ShareTooLarge';
  }
}

export type DecodeFailure = 'invalid' | 'too-large' | 'newer-version' | 'unsupported';

export type DecodeResult =
  | {
      readonly ok: true;
      /** Sanitised project name, or null when the payload has none. */
      readonly name: string | null;
      /** Passed through `sanitizeDesign`. */
      readonly design: Design;
    }
  | { readonly ok: false; readonly reason: DecodeFailure };

const BASE64URL = /^[A-Za-z0-9_-]*$/;
const VERSION = /^\d{1,6}$/;

class TooLarge extends Error {}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The input must already be checked against `BASE64URL`; throws on an impossible length. */
function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  if (text.length % 4 === 1) {
    throw new Error('bad length');
  }
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function hasStreams(): boolean {
  return typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
}

/**
 * Pipes `bytes` through a (de)compression stream and collects the output, aborting as soon as it
 * passes `max` bytes. Written against the stream objects only (no Blob), so it also runs in tests.
 */
async function pipe(
  transform: CompressionStream | DecompressionStream,
  bytes: Uint8Array<ArrayBuffer>,
  max: number,
): Promise<Uint8Array> {
  const writer = transform.writable.getWriter();
  // Not awaited: a full pipe would wait for the reader below. Bad input surfaces from `read()`.
  writer.write(bytes).catch(() => undefined);
  writer.close().catch(() => undefined);
  const reader = transform.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.length;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      throw new TooLarge();
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

/** The `1.<data>` token for a design and project name. Throws `ShareTooLarge`. */
export async function encodeShare(design: Design, name: string): Promise<string> {
  const json = JSON.stringify({ n: sanitizeProjectName(name) ?? '', d: design });
  const packed = await pipe(
    new CompressionStream('deflate-raw'),
    new TextEncoder().encode(json),
    MAX_DECODED_BYTES,
  );
  const token = `${SHARE_VERSION}.${toBase64Url(packed)}`;
  if (token.length > MAX_LINK_CHARS) {
    throw new ShareTooLarge();
  }
  return token;
}

/** `fragment` is whatever follows `#s=`. Never throws; failures come back as `{ ok: false }`. */
export async function decodeShare(fragment: string): Promise<DecodeResult> {
  const fail = (reason: DecodeFailure): DecodeResult => ({ ok: false, reason });
  // Size and shape checks come first, before any decoding work.
  if (typeof fragment !== 'string') {
    return fail('invalid');
  }
  if (fragment.length > MAX_DATA_CHARS) {
    return fail('too-large');
  }
  const dot = fragment.indexOf('.');
  const version = dot < 0 ? '' : fragment.slice(0, dot);
  const data = dot < 0 ? '' : fragment.slice(dot + 1);
  if (!VERSION.test(version)) {
    return fail('invalid');
  }
  if (Number(version) !== SHARE_VERSION) {
    return fail(Number(version) > SHARE_VERSION ? 'newer-version' : 'invalid');
  }
  if (!data || !BASE64URL.test(data)) {
    return fail('invalid');
  }
  if (!hasStreams()) {
    return fail('unsupported');
  }
  try {
    const bytes = await pipe(
      new DecompressionStream('deflate-raw'),
      fromBase64Url(data),
      MAX_DECODED_BYTES,
    );
    const raw: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      return fail('invalid');
    }
    const { n, d } = raw as { n?: unknown; d?: unknown };
    if (typeof d !== 'object' || d === null || Array.isArray(d)) {
      return fail('invalid');
    }
    return { ok: true, name: sanitizeProjectName(n), design: sanitizeDesign(d) };
  } catch (error) {
    return fail(error instanceof TooLarge ? 'too-large' : 'invalid');
  }
}

/** `<baseUri without any hash>#s=<token>`. */
export function shareUrl(baseUri: string, token: string): string {
  const hash = baseUri.indexOf('#');
  const base = hash < 0 ? baseUri : baseUri.slice(0, hash);
  return `${base}#${SHARE_HASH_PREFIX}${token}`;
}
