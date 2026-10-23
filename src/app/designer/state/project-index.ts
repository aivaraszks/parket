import { computed, DestroyRef, inject, Service, signal } from '@angular/core';
import { Design } from './design-defaults';
import { PROJECTS_INDEX_KEY, ProjectIndexData } from './project-meta';
import {
  getStorage,
  loadProjects,
  readIndex,
  readProject,
  removeProject,
  writeIndex,
  writeProject,
  writeProjectAndIndex,
  WriteResult,
} from './project-storage';

/**
 * The project index signal and its I/O (plan P1, P4). Root service; `DesignState` and `Projects`
 * inject it. It loads (and, once, migrates) everything at construction.
 *
 * Without usable storage it keeps the designs of all projects in memory, so every project action
 * still works until the tab closes (plan P2). A failed write sets `saveError` and keeps the
 * in-memory design; the next successful write clears it.
 */
@Service()
export class ProjectIndex {
  /** Null when storage is unavailable. */
  readonly storage = getStorage();

  private readonly loaded = loadProjects(this.storage, Date.now());
  /** In-memory designs, used only when `storage` is null. */
  private readonly memory = new Map<string, Design>();
  private readonly data = signal<ProjectIndexData>(this.loaded.index);
  private readonly _saveError = signal(false);

  /** The active project's design as loaded at startup; `DesignState` takes it once. */
  readonly initialDesign: Design = this.loaded.design;
  /** All projects in creation order (newest last); the UI sorts by `updatedAt`. */
  readonly projects = computed(() => this.data().projects);
  readonly activeId = computed(() => this.data().activeId);
  /** True when storage works; false = in-memory only (show the one-time "can't be saved" toast). */
  readonly persisted = signal(this.loaded.persisted).asReadonly();
  /** True while the last index or project write failed (quota). Cleared by the next success. */
  readonly saveError = this._saveError.asReadonly();

  constructor() {
    if (this.storage === null) {
      this.memory.set(this.loaded.index.activeId, this.loaded.design);
    }
    // Another tab changed the list: refresh it, keep our active project (last write wins).
    const onStorage = (event: StorageEvent): void => {
      if (event.key === PROJECTS_INDEX_KEY && this.storage) {
        this.refreshFromStorage(this.storage);
      }
    };
    globalThis.addEventListener?.('storage', onStorage);
    inject(DestroyRef).onDestroy(() => globalThis.removeEventListener?.('storage', onStorage));
  }

  /**
   * Replace the whole index. With `write` the index is saved first and only committed when that
   * succeeds (a failure changes nothing); without it only memory changes (also used for a storage
   * event refresh).
   */
  set(index: ProjectIndexData, write = true): WriteResult {
    if (write && this.storage) {
      const result = this.track(writeIndex(this.storage, index));
      if (!result.ok) {
        return result;
      }
    }
    this.data.set(index);
    return { ok: true };
  }

  /**
   * Set `updatedAt` of a project to `now` and save the index (at most once per autosave flush).
   * Memory is updated even when the write fails.
   */
  touch(id: string, now: number): void {
    const current = this.data();
    if (!current.projects.some((p) => p.id === id)) {
      return;
    }
    const next = {
      ...current,
      projects: current.projects.map((p) => (p.id === id ? { ...p, updatedAt: now } : p)),
    };
    this.data.set(next);
    if (this.storage) {
      this.track(writeIndex(this.storage, next));
    }
  }

  /**
   * Add a NEW project: its design and the index with it are saved together (project key first,
   * rolled back when the index write fails) and committed only on success.
   */
  addProject(id: string, design: Design, next: ProjectIndexData): WriteResult {
    if (this.storage) {
      const result = this.track(writeProjectAndIndex(this.storage, id, design, next));
      if (!result.ok) {
        return result;
      }
    } else {
      this.memory.set(id, structuredClone(design));
    }
    this.data.set(next);
    return { ok: true };
  }

  /** The stored design of a project; null when unknown. */
  readDesign(id: string): Design | null {
    if (this.storage) {
      return readProject(this.storage, id);
    }
    const design = this.memory.get(id);
    return design ? structuredClone(design) : null;
  }

  /** Save a project's design (autosave). */
  writeDesign(id: string, design: Design): WriteResult {
    if (this.storage) {
      return this.track(writeProject(this.storage, id, design));
    }
    this.memory.set(id, structuredClone(design));
    return { ok: true };
  }

  /** Delete a project's stored design (frees quota). */
  removeDesign(id: string): void {
    if (this.storage) {
      removeProject(this.storage, id);
    } else {
      this.memory.delete(id);
    }
  }

  private track(result: WriteResult): WriteResult {
    this._saveError.set(!result.ok);
    return result;
  }

  private refreshFromStorage(storage: Storage): void {
    const fresh = readIndex(storage);
    if (!fresh) {
      return;
    }
    const current = this.data();
    const mine = current.projects.find((p) => p.id === current.activeId);
    // Our open project must stay listed even if the other tab deleted it.
    const projects =
      mine && !fresh.projects.some((p) => p.id === mine.id)
        ? [...fresh.projects, mine]
        : fresh.projects;
    this.data.set({ activeId: current.activeId, projects });
  }
}
