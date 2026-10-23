// Pure project constants and types. Dependency-free on purpose: the landing page imports
// `project-summary.ts`, which imports this file, so nothing here may pull in designer code.

/** Index of all projects: `{ activeId, projects }` as JSON (plan P1). */
export const PROJECTS_INDEX_KEY = 'parket.projects.v1';
/** Prefix of the per-project keys: `parket.project.<id>` holds that project's `Design` as JSON. */
export const PROJECT_KEY_PREFIX = 'parket.project.';
/** At most this many projects; New, Duplicate and Add-shared are refused at the limit (plan Q4). */
export const MAX_PROJECTS = 50;
/** Longest project name, in characters. */
export const MAX_PROJECT_NAME_LENGTH = 40;
/** Ids are `p` plus 8 base36 characters. Always check with this before using an id in a key. */
export const PROJECT_ID_PATTERN = /^p[0-9a-z]{8}$/;

/**
 * Pre-projects design keys, newest first. Read-only migration sources, never written again.
 * Duplicated here on purpose (see `STORAGE_KEY*` in design-defaults) so the landing page can
 * peek at them without importing designer code; a spec keeps the two in sync.
 */
export const LEGACY_DESIGN_KEYS: readonly string[] = [
  'parket.design.v3',
  'parket.design.v2',
  'parket.design.v1',
];

/** Name of the project made from pre-projects data (plan Q2). */
export const MIGRATED_PROJECT_NAME = 'My room';
/** Name used for a shared design that carries no name. */
export const SHARED_PROJECT_NAME = 'Shared design';

export interface ProjectMeta {
  readonly id: string;
  readonly name: string;
  /** Epoch milliseconds. */
  readonly createdAt: number;
  /** Epoch milliseconds; bumped at most once per autosave flush. */
  readonly updatedAt: number;
}

/** What `parket.projects.v1` holds. Array order = creation order (newest last); the UI sorts by `updatedAt`. */
export interface ProjectIndexData {
  readonly activeId: string;
  readonly projects: readonly ProjectMeta[];
}

export function projectKey(id: string): string {
  return PROJECT_KEY_PREFIX + id;
}

export function isProjectId(value: unknown): value is string {
  return typeof value === 'string' && PROJECT_ID_PATTERN.test(value);
}

/**
 * Trim, strip control characters and cut to `MAX_PROJECT_NAME_LENGTH`. Returns `null` for
 * anything that is not a string or ends up empty; the caller then picks a "Project N" name.
 */
export function sanitizeProjectName(raw: unknown): string | null {
  if (typeof raw !== 'string') {
    return null;
  }
  const clean = raw.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim();
  const cut = Array.from(clean).slice(0, MAX_PROJECT_NAME_LENGTH).join('').trim();
  return cut || null;
}
