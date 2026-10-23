// Pure, Angular-free functions over a `Storage` (plan P1-P3).
// Every function takes the storage as a parameter so tests can pass a fake (also one that throws).

import { Design, STORAGE_KEY, STORAGE_KEY_V1, STORAGE_KEY_V2 } from './design-defaults';
import { cloneDefaults, isRecord, sanitizeDesign } from './design-sanitize';
import {
  isProjectId,
  MAX_PROJECTS,
  MIGRATED_PROJECT_NAME,
  PROJECT_KEY_PREFIX,
  PROJECTS_INDEX_KEY,
  ProjectIndexData,
  ProjectMeta,
  projectKey,
  sanitizeProjectName,
} from './project-meta';

/** Result of a storage write. `ok: false` = quota or blocked storage; nothing is left half-written. */
export type WriteResult = { readonly ok: true } | { readonly ok: false };

/** What startup loading produced. `persisted` is false when storage is unavailable (in-memory only). */
export interface LoadedProjects {
  readonly index: ProjectIndexData;
  /** The active project's design (sanitised). */
  readonly design: Design;
  readonly persisted: boolean;
}

const OK: WriteResult = { ok: true };
const FAILED: WriteResult = { ok: false };
const ID_CHARS = '0123456789abcdefghijklmnopqrstuvwxyz';

/** `localStorage`, or null when it is missing or blocked (private mode, disabled cookies). */
export function getStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** 252 is the largest multiple of 36 below 256: bytes from 252 up are dropped so every character is equally likely. */
const ID_BYTE_LIMIT = 252;

/** `p` + 8 random base36 characters (crypto.getRandomValues, rejection sampling), re-rolled while in `taken`. */
export function createProjectId(taken: ReadonlySet<string>): string {
  for (;;) {
    let id = 'p';
    while (id.length < 9) {
      for (const byte of globalThis.crypto.getRandomValues(new Uint8Array(8))) {
        if (byte < ID_BYTE_LIMIT && id.length < 9) {
          id += ID_CHARS[byte % 36];
        }
      }
    }
    if (!taken.has(id)) {
      return id;
    }
  }
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

/** The given id if it is in the list, else the most recently updated project (the later one on a tie). */
function resolveActive(projects: readonly ProjectMeta[], activeId: unknown): string {
  if (typeof activeId === 'string' && projects.some((p) => p.id === activeId)) {
    return activeId;
  }
  return projects.reduce((best, p) => (p.updatedAt >= best.updatedAt ? p : best)).id;
}

/** Hostile-input safe: caps at `MAX_PROJECTS`, drops bad/duplicate ids and metadata, fixes names and `activeId`. Null = unusable. */
export function sanitizeIndex(raw: unknown): ProjectIndexData | null {
  if (!isRecord(raw) || !Array.isArray(raw['projects'])) {
    return null;
  }
  const seen = new Set<string>();
  const projects: ProjectMeta[] = [];
  for (const entry of raw['projects'] as unknown[]) {
    if (projects.length >= MAX_PROJECTS) {
      break;
    }
    if (!isRecord(entry) || !isProjectId(entry['id']) || seen.has(entry['id'])) {
      continue;
    }
    seen.add(entry['id']);
    const createdAt = finiteOr(entry['createdAt'], 0);
    projects.push({
      id: entry['id'],
      name: sanitizeProjectName(entry['name']) ?? `Project ${projects.length + 1}`,
      createdAt,
      updatedAt: finiteOr(entry['updatedAt'], createdAt),
    });
  }
  return projects.length === 0
    ? null
    : { activeId: resolveActive(projects, raw['activeId']), projects };
}

/** Reads and sanitises the index; null when absent or unusable. Entries whose project key is missing are dropped. */
export function readIndex(storage: Storage): ProjectIndexData | null {
  try {
    const text = storage.getItem(PROJECTS_INDEX_KEY);
    const index = text ? sanitizeIndex(JSON.parse(text)) : null;
    if (!index) {
      return null;
    }
    const present = index.projects.filter((p) => storage.getItem(projectKey(p.id)) !== null);
    return present.length === 0
      ? null
      : { activeId: resolveActive(present, index.activeId), projects: present };
  } catch {
    return null;
  }
}

/** The project's design (sanitised); null when its key is missing. Corrupt JSON loads as defaults. */
export function readProject(storage: Storage, id: string): Design | null {
  if (!isProjectId(id)) {
    return null;
  }
  try {
    const text = storage.getItem(projectKey(id));
    if (text === null) {
      return null;
    }
    try {
      return sanitizeDesign(JSON.parse(text));
    } catch {
      return cloneDefaults();
    }
  } catch {
    return null;
  }
}

function write(storage: Storage, key: string, value: unknown): WriteResult {
  try {
    storage.setItem(key, JSON.stringify(value));
    return OK;
  } catch {
    return FAILED;
  }
}

export function writeIndex(storage: Storage, index: ProjectIndexData): WriteResult {
  return write(storage, PROJECTS_INDEX_KEY, index);
}

export function writeProject(storage: Storage, id: string, design: Design): WriteResult {
  return isProjectId(id) ? write(storage, projectKey(id), design) : FAILED;
}

/**
 * For a NEW project: writes the project key first, then the index; if either write fails the
 * new key is removed again, so nothing is left half-written. Never use it for an existing
 * project (the rollback would delete it).
 */
export function writeProjectAndIndex(
  storage: Storage,
  id: string,
  design: Design,
  index: ProjectIndexData,
): WriteResult {
  if (!writeProject(storage, id, design).ok || !writeIndex(storage, index).ok) {
    removeProject(storage, id);
    return FAILED;
  }
  return OK;
}

/** Removes the project key. Never throws. */
export function removeProject(storage: Storage, id: string): void {
  try {
    if (isProjectId(id)) {
      storage.removeItem(projectKey(id));
    }
  } catch {
    // At worst the key becomes an orphan that the next startup sweeps.
  }
}

/** Removes `parket.project.*` keys that are not in the index. Never throws. */
export function sweepOrphans(storage: Storage, index: ProjectIndexData): void {
  try {
    const keep = new Set(index.projects.map((p) => projectKey(p.id)));
    const orphans: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith(PROJECT_KEY_PREFIX) && !keep.has(key)) {
        orphans.push(key);
      }
    }
    orphans.forEach((key) => storage.removeItem(key));
  } catch {
    // Best effort.
  }
}

/**
 * The index is unreadable but project keys exist: list them as "Project N" (oldest first is
 * unknown, so sorted by id; `updatedAt` 0). Null when there are none.
 */
export function rebuildIndex(storage: Storage): ProjectIndexData | null {
  try {
    const ids: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      const id = key?.startsWith(PROJECT_KEY_PREFIX) ? key.slice(PROJECT_KEY_PREFIX.length) : null;
      if (isProjectId(id)) {
        ids.push(id);
      }
    }
    const projects = ids
      .sort()
      .slice(0, MAX_PROJECTS)
      .map((id, i) => ({ id, name: `Project ${i + 1}`, createdAt: 0, updatedAt: 0 }));
    return projects.length === 0 ? null : { activeId: resolveActive(projects, null), projects };
  } catch {
    return null;
  }
}

function readLegacy(storage: Storage, key: string): Design | null {
  try {
    const text = storage.getItem(key);
    return text ? sanitizeDesign(JSON.parse(text)) : null;
  } catch {
    return null;
  }
}

/** v3, then v2 (no colours: defaults fill in), then v1 (simple mode, no plan). */
function readLegacyDesign(storage: Storage): Design | null {
  const v3 = readLegacy(storage, STORAGE_KEY);
  if (v3) {
    return v3;
  }
  const v2 = readLegacy(storage, STORAGE_KEY_V2);
  if (v2) {
    return v2;
  }
  const v1 = readLegacy(storage, STORAGE_KEY_V1);
  return v1 ? { ...v1, mode: 'simple', plan: null } : null;
}

/**
 * Startup: reads the index and the active design, or migrates once (v3, v2, v1 become "My room";
 * no data becomes "Project 1"). Legacy keys are left untouched. `storage` null = in-memory only.
 */
export function loadProjects(storage: Storage | null, now: number): LoadedProjects {
  if (storage) {
    const index = readIndex(storage);
    if (index) {
      sweepOrphans(storage, index);
      return {
        index,
        design: readProject(storage, index.activeId) ?? cloneDefaults(),
        persisted: true,
      };
    }
    // An unreadable index must never wipe the projects: rebuild it from their keys, no sweep.
    const rebuilt = rebuildIndex(storage);
    if (rebuilt) {
      return {
        index: rebuilt,
        design: readProject(storage, rebuilt.activeId) ?? cloneDefaults(),
        persisted: writeIndex(storage, rebuilt).ok,
      };
    }
  }
  const legacy = storage ? readLegacyDesign(storage) : null;
  const design = legacy ?? cloneDefaults();
  const id = createProjectId(new Set());
  const name = legacy ? MIGRATED_PROJECT_NAME : 'Project 1';
  const index: ProjectIndexData = {
    activeId: id,
    projects: [{ id, name, createdAt: now, updatedAt: now }],
  };
  const persisted = storage !== null && writeProjectAndIndex(storage, id, design, index).ok;
  if (storage && persisted) {
    sweepOrphans(storage, index);
  }
  return { index, design, persisted };
}
