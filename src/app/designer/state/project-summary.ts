import {
  isProjectId,
  LEGACY_DESIGN_KEYS,
  MAX_PROJECTS,
  MIGRATED_PROJECT_NAME,
  PROJECTS_INDEX_KEY,
  projectKey,
  sanitizeProjectName,
} from './project-meta';

export interface ProjectSummary {
  /** Name of the active project. */
  readonly activeName: string;
  /** Number of projects (1 to `MAX_PROJECTS`). */
  readonly count: number;
}

function time(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

/** Same rules as the full reader: bad entries dropped, entries without a project key skipped, unknown active = most recently updated. */
function fromIndex(storage: Storage, text: string | null | undefined): ProjectSummary | null {
  const raw: unknown = text ? JSON.parse(text) : null;
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const { activeId, projects } = raw as { activeId?: unknown; projects?: unknown };
  if (!Array.isArray(projects)) {
    return null;
  }
  const seen = new Set<string>();
  const found: { id: string; name: string; updatedAt: number }[] = [];
  for (const entry of projects) {
    if (seen.size >= MAX_PROJECTS) {
      break;
    }
    const id: unknown = entry?.id;
    if (isProjectId(id) && !seen.has(id)) {
      seen.add(id);
      if (storage.getItem(projectKey(id)) !== null) {
        const createdAt = time(entry.createdAt);
        found.push({
          id,
          name: sanitizeProjectName(entry.name) ?? `Project ${seen.size}`,
          updatedAt: entry.updatedAt === undefined ? createdAt : time(entry.updatedAt),
        });
      }
    }
  }
  if (found.length === 0) {
    return null;
  }
  const active =
    found.find((p) => p.id === activeId) ??
    found.reduce((best, p) => (p.updatedAt >= best.updatedAt ? p : best));
  return { activeName: active.name, count: found.length };
}

/** Same rule as the migration: the first legacy key whose text parses as JSON becomes "My room". */
function fromLegacy(storage: Storage): ProjectSummary | null {
  for (const key of LEGACY_DESIGN_KEYS) {
    try {
      const text = storage.getItem(key);
      if (text) {
        JSON.parse(text);
        return { activeName: MIGRATED_PROJECT_NAME, count: 1 };
      }
    } catch {
      // Corrupt: try the next older key, as the migration does.
    }
  }
  return null;
}

/**
 * Read-only peek at the project index for the landing page ("Continue <name>", project count).
 * Tiny and dependency-free (no Angular, no designer code), so the landing chunk stays small.
 * Before the designer first runs with projects, a pre-projects design (v3/v2/v1) counts as one
 * project named "My room". Returns `null` when storage is unavailable or holds nothing (first
 * visit). Never throws and never writes.
 */
export function readProjectSummary(): ProjectSummary | null {
  try {
    const storage = globalThis.localStorage;
    if (!storage) {
      return null;
    }
    let indexed: ProjectSummary | null = null;
    try {
      indexed = fromIndex(storage, storage.getItem(PROJECTS_INDEX_KEY));
    } catch {
      // Corrupt index: fall through to the legacy keys, as the migration does.
    }
    return indexed ?? fromLegacy(storage);
  } catch {
    return null;
  }
}
