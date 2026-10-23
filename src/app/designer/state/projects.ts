import { DOCUMENT } from '@angular/common';
import { computed, inject, Service } from '@angular/core';
import { ColourAnnouncer } from '../ui/colour-announcer';
import { restoreFocus } from '../ui/dialog-focus';
import { Toasts } from '../ui/toasts';
import { Design } from './design-defaults';
import { cloneDefaults } from './design-sanitize';
import { DesignState, STORAGE_FULL_MESSAGE } from './design-state';
import { ProjectIndex } from './project-index';
import {
  MAX_PROJECT_NAME_LENGTH,
  MAX_PROJECTS,
  ProjectIndexData,
  ProjectMeta,
  sanitizeProjectName,
  SHARED_PROJECT_NAME,
} from './project-meta';
import { createProjectId, WriteResult } from './project-storage';

/** Why a project operation did nothing. */
export type ProjectsRefusal = 'limit' | 'storage-full' | 'unknown-project';

export type ProjectsResult =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly reason: ProjectsRefusal };

/** How long the delete Undo toast stays (it pauses on hover and focus). */
export const DELETE_UNDO_MS = 8000;

const PROJECT_NAME_PATTERN = /^Project \d+$/;

/** JSON with sorted keys, so two equal designs compare equal whatever their key order. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

/** Cut the base so that base + suffix fits the name limit. */
function withSuffix(base: string, suffix: string): string {
  return Array.from(base)
    .slice(0, MAX_PROJECT_NAME_LENGTH - suffix.length)
    .join('')
    .trimEnd()
    .concat(suffix);
}

/**
 * Orchestrates create, rename, switch, duplicate, delete with undo and add-from-share (plan P5).
 * An operation that fails changes nothing; storage failures show the storage-full toast.
 */
@Service()
export class Projects {
  private readonly designState = inject(DesignState);
  private readonly index = inject(ProjectIndex);
  private readonly toasts = inject(Toasts);
  private readonly announcer = inject(ColourAnnouncer);
  private readonly document = inject(DOCUMENT);

  /** True when the project count is at `MAX_PROJECTS`: New, Duplicate and Add-shared are disabled. */
  readonly atLimit = computed(() => this.index.projects().length >= MAX_PROJECTS);

  /** The open project is a never-edited "Project N" (its design equals the defaults). */
  isActiveUntouched(): boolean {
    return this.isUntouched(this.index.activeId());
  }

  /** New project from the defaults, named "Project N" (smallest unused N); switches to it. */
  create(): ProjectsResult {
    return this.add(this.nextProjectName(), cloneDefaults());
  }

  /** Make `id` the active project (flushes the current one first). */
  switchTo(id: string): ProjectsResult {
    if (!this.find(id)) {
      return { ok: false, reason: 'unknown-project' };
    }
    if (id !== this.index.activeId()) {
      if (!this.flushed()) {
        return this.storageFull();
      }
      this.activate(id);
    }
    return { ok: true, id };
  }

  /** Name is sanitised (1-40 chars); an empty result keeps the old name. Duplicate names are allowed. */
  rename(id: string, name: string): ProjectsResult {
    const meta = this.find(id);
    if (!meta) {
      return { ok: false, reason: 'unknown-project' };
    }
    const clean = sanitizeProjectName(name);
    if (clean && clean !== meta.name) {
      const result = this.index.set({
        ...this.data(),
        projects: this.index.projects().map((p) => (p.id === id ? { ...p, name: clean } : p)),
      });
      if (!result.ok) {
        return this.storageFull();
      }
    }
    return { ok: true, id };
  }

  /** Copy a project (default: the active one) as "<name> copy", "<name> copy 2"...; switches to the copy. */
  duplicate(id: string = this.index.activeId()): ProjectsResult {
    const meta = this.find(id);
    if (!meta) {
      return { ok: false, reason: 'unknown-project' };
    }
    if (!this.flushed()) {
      return this.storageFull();
    }
    const design =
      id === this.index.activeId()
        ? this.designState.snapshot()
        : (this.index.readDesign(id) ?? cloneDefaults());
    const name = this.uniqueName(meta.name, (n) => (n === 1 ? ' copy' : ` copy ${n}`), 1);
    return this.add(name, design);
  }

  /**
   * Delete at once and show the "Deleted <name>." toast with Undo (8 s). Deleting the active
   * project activates the most recently updated other one; deleting the last creates "Project 1".
   */
  remove(id: string): ProjectsResult {
    const projects = this.index.projects();
    const position = projects.findIndex((p) => p.id === id);
    if (position < 0) {
      return { ok: false, reason: 'unknown-project' };
    }
    const meta = projects[position];
    const wasActive = id === this.index.activeId();
    this.designState.flush();
    const design = wasActive
      ? this.designState.snapshot()
      : (this.index.readDesign(id) ?? cloneDefaults());

    const rest = projects.filter((p) => p.id !== id);
    let activeId = this.index.activeId();
    let result: WriteResult;
    let replacement: { id: string; design: Design } | null = null;
    if (rest.length === 0) {
      const fresh = cloneDefaults();
      const freshMeta = this.newMeta('Project 1', new Set());
      activeId = freshMeta.id;
      replacement = { id: freshMeta.id, design: fresh };
      result = this.index.addProject(freshMeta.id, fresh, {
        activeId,
        projects: [freshMeta],
      });
    } else {
      if (wasActive) {
        activeId = rest.reduce((best, p) => (p.updatedAt >= best.updatedAt ? p : best)).id;
      }
      result = this.index.set({ activeId, projects: rest });
    }
    if (!result.ok) {
      return this.storageFull();
    }
    this.index.removeDesign(id);
    if (wasActive) {
      this.designState.open(
        activeId,
        replacement?.design ?? this.index.readDesign(activeId) ?? cloneDefaults(),
        // The deleted project must not be written again by a pending or failed autosave.
        { flush: false },
      );
    }
    const started = replacement ? ' Started a new project.' : '';
    this.toasts.show(`Deleted “${meta.name}”.${started}`, {
      action: {
        label: 'Undo',
        run: () => this.restore(meta, design, position, wasActive, replacement?.id ?? null),
      },
      durationMs: DELETE_UNDO_MS,
    });
    return { ok: true, id };
  }

  /**
   * Add a decoded shared design as a new project and switch to it. `name` null = "Shared design";
   * a taken name gets " 2", " 3"... Flushes the current project first.
   */
  addShared(name: string | null, design: Design): ProjectsResult {
    if (this.atLimit()) {
      this.say(`You have ${MAX_PROJECTS} projects. Delete one to add this design.`);
      return { ok: false, reason: 'limit' };
    }
    const base = sanitizeProjectName(name) ?? SHARED_PROJECT_NAME;
    return this.add(
      this.uniqueName(base, (n) => ` ${n}`, 2, true),
      design,
    );
  }

  /** `freshId`: the "Project 1" made when the last project was deleted; dropped again if untouched. */
  private restore(
    meta: ProjectMeta,
    design: Design,
    position: number,
    wasActive: boolean,
    freshId: string | null,
  ): void {
    const dropFresh = freshId !== null && this.isUntouched(freshId);
    if (this.atLimit() && !dropFresh) {
      this.say(`Can't restore: you already have ${MAX_PROJECTS} projects.`);
      return;
    }
    if (!this.flushed()) {
      this.storageFull();
      return;
    }
    const projects = this.index.projects().filter((p) => !(dropFresh && p.id === freshId));
    projects.splice(Math.min(position, projects.length), 0, meta);
    const next = { activeId: wasActive ? meta.id : this.index.activeId(), projects };
    if (!this.index.addProject(meta.id, design, next).ok) {
      this.storageFull();
      return;
    }
    if (dropFresh) {
      this.index.removeDesign(freshId);
    }
    if (wasActive) {
      this.designState.open(meta.id, design, { flush: !dropFresh });
    }
    const opened = wasActive ? ` Opened ${meta.name}.` : '';
    this.announcer.say(`Restored ${meta.name}.${opened}`);
    // The Undo button that had focus is gone.
    restoreFocus(this.document, ['[data-trigger="projects"]'], null);
  }

  private isUntouched(id: string): boolean {
    const meta = this.find(id);
    return (
      id === this.index.activeId() &&
      !!meta &&
      PROJECT_NAME_PATTERN.test(meta.name) &&
      canonical(this.designState.snapshot()) === canonical(cloneDefaults())
    );
  }

  /** Writes the open project's pending edits; false when they could not be saved (nothing may switch away). */
  private flushed(): boolean {
    this.designState.flush();
    return !this.designState.hasUnsaved() || !this.index.persisted();
  }

  /** Create, save and switch to a new project. */
  private add(name: string, design: Design): ProjectsResult {
    if (this.atLimit()) {
      return { ok: false, reason: 'limit' };
    }
    if (!this.flushed()) {
      return this.storageFull();
    }
    const meta = this.newMeta(name, new Set(this.index.projects().map((p) => p.id)));
    const next: ProjectIndexData = {
      activeId: meta.id,
      projects: [...this.index.projects(), meta],
    };
    if (!this.index.addProject(meta.id, design, next).ok) {
      return this.storageFull();
    }
    this.designState.open(meta.id, design);
    return { ok: true, id: meta.id };
  }

  private activate(id: string): void {
    this.designState.open(id, this.index.readDesign(id) ?? cloneDefaults());
    // A failed index write still switches in memory: the open project is what the user sees.
    const next = { ...this.data(), activeId: id };
    if (!this.index.set(next).ok) {
      this.index.set(next, false);
    }
  }

  private newMeta(name: string, taken: ReadonlySet<string>): ProjectMeta {
    const now = Date.now();
    return { id: createProjectId(taken), name, createdAt: now, updatedAt: now };
  }

  private data(): ProjectIndexData {
    return { activeId: this.index.activeId(), projects: this.index.projects() };
  }

  private find(id: string): ProjectMeta | undefined {
    return this.index.projects().find((p) => p.id === id);
  }

  private nextProjectName(): string {
    const used = new Set(this.index.projects().map((p) => p.name));
    let n = 1;
    while (used.has(`Project ${n}`)) {
      n++;
    }
    return `Project ${n}`;
  }

  /**
   * `base + suffix(n)` for the first n >= `from` that is not taken. With `plainFirst` the plain
   * base is tried before any suffix.
   */
  private uniqueName(
    base: string,
    suffix: (n: number) => string,
    from: number,
    plainFirst = false,
  ): string {
    const used = new Set(this.index.projects().map((p) => p.name));
    if (plainFirst && !used.has(base)) {
      return base;
    }
    for (let n = from; ; n++) {
      const candidate = withSuffix(base, suffix(n));
      if (!used.has(candidate)) {
        return candidate;
      }
    }
  }

  private storageFull(): ProjectsResult {
    this.say(STORAGE_FULL_MESSAGE);
    return { ok: false, reason: 'storage-full' };
  }

  /** An error toast, also announced politely: the toast host is inert while a dialog is open. */
  private say(text: string): void {
    this.toasts.show(text, { kind: 'error' });
    this.announcer.say(text);
  }
}
