// Helpers for specs that look at what the app wrote to localStorage.

import { Design } from './design-defaults';
import { PROJECT_KEY_PREFIX, PROJECTS_INDEX_KEY } from './project-meta';

/** The project index as stored, or null. */
export function storedIndex(): {
  activeId: string;
  projects: { id: string; name: string }[];
} | null {
  const text = localStorage.getItem(PROJECTS_INDEX_KEY);
  return text ? JSON.parse(text) : null;
}

/** The raw JSON text of the active project's design, or null when there is none. */
export function activeProjectText(): string | null {
  const index = storedIndex();
  return index ? localStorage.getItem(PROJECT_KEY_PREFIX + index.activeId) : null;
}

/** The active project's stored design, parsed (throws when there is none). */
export function activeProject(): Design {
  return JSON.parse(activeProjectText()!);
}
