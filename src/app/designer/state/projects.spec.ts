import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toasts } from '../ui/toasts';
import { PERSIST_DEBOUNCE_MS } from './design-defaults';
import { DesignState } from './design-state';
import { ProjectIndex } from './project-index';
import { MAX_PROJECTS, PROJECT_KEY_PREFIX, PROJECTS_INDEX_KEY, projectKey } from './project-meta';
import { Projects } from './projects';
import { activeProject, storedIndex } from './storage-fixtures';

interface Env {
  design: DesignState;
  projects: Projects;
  index: ProjectIndex;
  toasts: Toasts;
}

function boot(): Env {
  TestBed.resetTestingModule();
  return {
    design: TestBed.inject(DesignState),
    projects: TestBed.inject(Projects),
    index: TestBed.inject(ProjectIndex),
    toasts: TestBed.inject(Toasts),
  };
}

const names = (e: Env) => e.index.projects().map((p) => p.name);
const idOf = (e: Env, name: string) => e.index.projects().find((p) => p.name === name)!.id;

/** Make writes to keys matching `test` throw, like a full quota. */
function failWrites(test: (key: string) => boolean) {
  const original = Storage.prototype.setItem;
  return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
    this: Storage,
    key: string,
    value: string,
  ) {
    if (test(key)) {
      throw new DOMException('full', 'QuotaExceededError');
    }
    original.call(this, key, value);
  });
}

describe('Projects', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  describe('startup', () => {
    it('starts with one project, "Project 1", that is active', () => {
      const e = boot();
      expect(names(e)).toEqual(['Project 1']);
      expect(e.design.activeId()).toBe(e.index.activeId());
      expect(e.projects.atLimit()).toBe(false);
    });

    it('shows a one-time toast when storage is unavailable and still works in memory', () => {
      vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(() => {
        throw new Error('blocked');
      });
      const e = boot();
      expect(e.index.persisted()).toBe(false);
      expect(e.toasts.current()?.text).toBe("Projects can't be saved in this browser.");
      e.design.setAngle(40);
      expect(e.projects.create().ok).toBe(true);
      expect(e.design.angle()).toBe(0);
      expect(e.projects.switchTo(e.index.projects()[0].id).ok).toBe(true);
      expect(e.design.angle()).toBe(40);
    });
  });

  describe('naming', () => {
    it('create fills the smallest free "Project N"', () => {
      const e = boot();
      e.projects.create();
      e.projects.create();
      expect(names(e)).toEqual(['Project 1', 'Project 2', 'Project 3']);
      e.projects.remove(idOf(e, 'Project 2'));
      e.projects.create();
      expect(names(e)).toEqual(['Project 1', 'Project 3', 'Project 2']);
    });

    it('duplicate names the copy "copy", then "copy 2"', () => {
      const e = boot();
      e.projects.rename(e.index.activeId(), 'Kitchen');
      e.projects.duplicate();
      expect(e.index.projects().at(-1)!.name).toBe('Kitchen copy');
      e.projects.duplicate(idOf(e, 'Kitchen'));
      expect(names(e)).toEqual(['Kitchen', 'Kitchen copy', 'Kitchen copy 2']);
    });

    it('keeps copy names within 40 characters', () => {
      const e = boot();
      e.projects.rename(e.index.activeId(), 'x'.repeat(40));
      e.projects.duplicate();
      const copy = e.index.projects().at(-1)!.name;
      expect(copy).toHaveLength(40);
      expect(copy.endsWith(' copy')).toBe(true);
    });

    it('shared designs use the name, "Shared design", and " 2", " 3" on collisions', () => {
      const e = boot();
      const design = e.design.snapshot();
      e.projects.addShared('Hall', design);
      e.projects.addShared('Hall', design);
      e.projects.addShared('Hall', design);
      e.projects.addShared(null, design);
      e.projects.addShared('  ', design);
      expect(names(e)).toEqual([
        'Project 1',
        'Hall',
        'Hall 2',
        'Hall 3',
        'Shared design',
        'Shared design 2',
      ]);
    });

    it('rename sanitises, ignores empty and allows duplicates', () => {
      const e = boot();
      const id = e.index.activeId();
      e.projects.rename(id, '  Hall\u0000  ');
      expect(names(e)).toEqual(['Hall']);
      e.projects.rename(id, '   ');
      expect(names(e)).toEqual(['Hall']);
      e.projects.create();
      e.projects.rename(e.index.activeId(), 'Hall');
      expect(names(e)).toEqual(['Hall', 'Hall']);
      expect(e.projects.rename('pnotthere1', 'x')).toEqual({
        ok: false,
        reason: 'unknown-project',
      });
      expect(storedIndex()!.projects[0].name).toBe('Hall');
    });
  });

  describe('switching', () => {
    it('open flushes the previous project and clears the reset undo', () => {
      const e = boot();
      const first = e.index.activeId();
      e.design.setAngle(77);
      e.design.reset();
      expect(e.design.canUndo()).toBe(true);
      e.design.setAngle(66);
      e.design.reset();
      e.projects.create();
      expect(e.design.canUndo()).toBe(false);
      expect(JSON.parse(localStorage.getItem(projectKey(first))!).angle).toBe(0);
      e.projects.switchTo(first);
      expect(e.design.angle()).toBe(0);
    });

    it('flushes pending edits before switching and restores them later', () => {
      const e = boot();
      const first = e.index.activeId();
      e.design.setAngle(77);
      e.projects.create();
      expect(JSON.parse(localStorage.getItem(projectKey(first))!).angle).toBe(77);
      expect(e.design.angle()).toBe(0);
      e.projects.switchTo(first);
      expect(e.design.angle()).toBe(77);
      expect(storedIndex()!.activeId).toBe(first);
    });

    it('reset affects only the active project', () => {
      const e = boot();
      const first = e.index.activeId();
      e.design.setAngle(77);
      e.projects.create();
      e.design.setAngle(20);
      e.design.reset();
      e.projects.switchTo(first);
      expect(e.design.angle()).toBe(77);
    });

    it('refuses unknown ids and survives a missing project key', () => {
      const e = boot();
      expect(e.projects.switchTo('pnotthere1')).toEqual({ ok: false, reason: 'unknown-project' });
      e.projects.create();
      const first = e.index.projects()[0].id;
      localStorage.removeItem(projectKey(first));
      expect(e.projects.switchTo(first).ok).toBe(true);
      expect(e.design.angle()).toBe(0);
    });

    it('bumps updatedAt once per flush with edits, not on a plain page hide', () => {
      const e = boot();
      const id = e.index.activeId();
      const at = () => e.index.projects().find((p) => p.id === id)!.updatedAt;
      vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
      window.dispatchEvent(new Event('pagehide'));
      expect(at()).toBeLessThan(new Date('2030-01-01').getTime());
      e.design.setAngle(5);
      e.design.setAngle(6);
      vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS);
      expect(at()).toBeGreaterThanOrEqual(new Date('2030-01-01').getTime());
    });
  });

  describe('duplicate', () => {
    it('copies the current design and switches to the copy', () => {
      const e = boot();
      e.design.setAngle(33);
      e.design.setSpecies('walnut');
      e.projects.duplicate();
      expect(e.design.angle()).toBe(33);
      expect(e.design.species()).toBe('walnut');
      expect(e.index.activeId()).toBe(e.index.projects().at(-1)!.id);
      expect(activeProject().angle).toBe(33);
    });

    it('duplicates another project from storage', () => {
      const e = boot();
      e.design.setAngle(33);
      e.projects.create();
      e.projects.duplicate(e.index.projects()[0].id);
      expect(e.design.angle()).toBe(33);
    });
  });

  describe('limit', () => {
    it('refuses create, duplicate and addShared at 50 projects', () => {
      const e = boot();
      while (!e.projects.atLimit()) {
        e.projects.create();
      }
      expect(e.index.projects()).toHaveLength(MAX_PROJECTS);
      expect(e.projects.create()).toEqual({ ok: false, reason: 'limit' });
      expect(e.projects.duplicate()).toEqual({ ok: false, reason: 'limit' });
      expect(e.projects.addShared('x', e.design.snapshot())).toEqual({
        ok: false,
        reason: 'limit',
      });
      expect(e.toasts.current()?.kind).toBe('error');
      expect(e.index.projects()).toHaveLength(MAX_PROJECTS);
    });
  });

  describe('delete and undo', () => {
    it('deleting a non-active project keeps the active one and offers Undo', () => {
      const e = boot();
      e.projects.rename(e.index.activeId(), 'Kitchen');
      e.projects.create();
      const active = e.index.activeId();
      const kitchen = idOf(e, 'Kitchen');
      expect(e.projects.remove(kitchen).ok).toBe(true);
      expect(names(e)).toEqual(['Project 1']);
      expect(e.index.activeId()).toBe(active);
      expect(localStorage.getItem(projectKey(kitchen))).toBeNull();
      expect(e.toasts.current()?.text).toBe('Deleted “Kitchen”.');
      expect(e.toasts.current()?.action?.label).toBe('Undo');
    });

    it('deleting the active project activates the most recently updated other one', () => {
      const e = boot();
      e.projects.create();
      e.projects.create();
      const [a, b, c] = e.index.projects().map((p) => p.id);
      e.design.setAngle(1);
      vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS);
      e.projects.switchTo(a);
      vi.setSystemTime(Date.now() + 1000);
      e.design.setAngle(12);
      vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS);
      e.projects.switchTo(c);
      e.projects.remove(c);
      expect(e.index.activeId()).toBe(a);
      expect(e.design.angle()).toBe(12);
      expect(b).toBeDefined();
    });

    it('Undo restores position, design and active state', () => {
      const e = boot();
      e.projects.create();
      e.projects.create();
      const mid = e.index.projects()[1].id;
      e.projects.switchTo(mid);
      e.design.setAngle(45);
      e.projects.remove(mid);
      expect(names(e)).toEqual(['Project 1', 'Project 3']);
      e.toasts.runAction();
      expect(names(e)).toEqual(['Project 1', 'Project 2', 'Project 3']);
      expect(e.index.activeId()).toBe(mid);
      expect(e.design.angle()).toBe(45);
      expect(storedIndex()!.activeId).toBe(mid);
      expect(JSON.parse(localStorage.getItem(projectKey(mid))!).angle).toBe(45);
    });

    it('Undo of a non-active project leaves the active one alone', () => {
      const e = boot();
      const first = e.index.activeId();
      e.projects.create();
      const active = e.index.activeId();
      e.projects.remove(first);
      e.toasts.runAction();
      expect(e.index.activeId()).toBe(active);
      expect(e.index.projects()[0].id).toBe(first);
    });

    it('deleting the last project makes a fresh "Project 1", and Undo brings the old one back', () => {
      const e = boot();
      const old = e.index.activeId();
      e.projects.rename(old, 'Only');
      e.design.setAngle(20);
      e.projects.remove(old);
      expect(names(e)).toEqual(['Project 1']);
      expect(e.index.activeId()).not.toBe(old);
      expect(e.design.angle()).toBe(0);
      e.toasts.runAction();
      expect(names(e)).toEqual(['Only']);
      expect(e.index.activeId()).toBe(old);
      expect(e.design.angle()).toBe(20);
    });

    it('a newer delete makes the older one final', () => {
      const e = boot();
      e.projects.create();
      e.projects.create();
      const [a, b] = e.index.projects().map((p) => p.id);
      e.projects.remove(a);
      e.projects.remove(b);
      expect(e.toasts.current()?.text).toContain('Project 2');
      e.toasts.runAction();
      expect(names(e)).toEqual(['Project 2', 'Project 3']);
      expect(e.index.projects().some((p) => p.id === a)).toBe(false);
    });

    it('does not autosave a deleted project back', () => {
      const e = boot();
      const first = e.index.activeId();
      e.projects.create();
      e.design.setAngle(9);
      e.projects.switchTo(first);
      e.projects.remove(first);
      vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS * 2);
      window.dispatchEvent(new Event('pagehide'));
      expect(localStorage.getItem(projectKey(first))).toBeNull();
      expect(
        Object.keys(localStorage).filter((k) => k.startsWith(PROJECT_KEY_PREFIX)),
      ).toHaveLength(1);
    });
  });

  describe('delete after a failed autosave', () => {
    it('does not write the deleted active project back', () => {
      const e = boot();
      e.projects.create();
      const doomed = e.index.activeId();
      const spy = failWrites((k) => k.startsWith(PROJECT_KEY_PREFIX));
      e.design.setAngle(33);
      vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS);
      expect(e.design.hasUnsaved()).toBe(true);
      spy.mockRestore();
      expect(e.projects.remove(doomed).ok).toBe(true);
      vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS * 2);
      window.dispatchEvent(new Event('pagehide'));
      expect(localStorage.getItem(projectKey(doomed))).toBeNull();
      expect(e.design.hasUnsaved()).toBe(false);
    });

    it('refuses to switch away from unsaved edits and says why', () => {
      const e = boot();
      const first = e.index.activeId();
      e.projects.create();
      failWrites((k) => k.startsWith(PROJECT_KEY_PREFIX));
      e.design.setAngle(44);
      expect(e.projects.switchTo(first)).toEqual({ ok: false, reason: 'storage-full' });
      expect(e.design.angle()).toBe(44);
      expect(e.toasts.current()?.kind).toBe('error');
    });
  });

  describe('untouched projects', () => {
    it('knows whether the open project is an untouched "Project N"', () => {
      const e = boot();
      expect(e.projects.isActiveUntouched()).toBe(true);
      e.design.setAngle(5);
      expect(e.projects.isActiveUntouched()).toBe(false);
      e.design.setAngle(0);
      expect(e.projects.isActiveUntouched()).toBe(true);
      e.projects.rename(e.index.activeId(), 'Kitchen');
      expect(e.projects.isActiveUntouched()).toBe(false);
    });

    it('Undo of delete-last also removes the untouched fresh "Project 1"', () => {
      const e = boot();
      const old = e.index.activeId();
      e.projects.rename(old, 'Only');
      e.design.setAngle(20);
      e.projects.remove(old);
      const fresh = e.index.activeId();
      e.toasts.runAction();
      expect(names(e)).toEqual(['Only']);
      expect(localStorage.getItem(projectKey(fresh))).toBeNull();
      expect(e.index.activeId()).toBe(old);
    });

    it('Undo of delete-last keeps the fresh project once it was edited', () => {
      const e = boot();
      const old = e.index.activeId();
      e.projects.remove(old);
      e.design.setAngle(9);
      e.toasts.runAction();
      expect(names(e)).toHaveLength(2);
    });
  });

  describe('storage failures', () => {
    it('a failed autosave shows one toast, keeps the design and recovers', () => {
      const e = boot();
      const spy = failWrites((k) => k.startsWith(PROJECT_KEY_PREFIX));
      e.design.setAngle(10);
      vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS);
      expect(e.index.saveError()).toBe(true);
      expect(e.toasts.current()?.text).toBe('Storage is full. Delete a project to keep saving.');
      e.toasts.dismiss();
      e.design.setAngle(11);
      vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS);
      expect(e.toasts.current()).toBeNull();
      expect(e.design.angle()).toBe(11);
      spy.mockRestore();
      e.design.setAngle(12);
      vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS);
      expect(e.index.saveError()).toBe(false);
      expect(activeProject().angle).toBe(12);
      e.design.setAngle(13);
      failWrites((k) => k.startsWith(PROJECT_KEY_PREFIX));
      vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS);
      expect(e.toasts.current()?.kind).toBe('error');
    });

    it('create changes nothing when the project write fails', () => {
      const e = boot();
      failWrites((k) => k.startsWith(PROJECT_KEY_PREFIX));
      expect(e.projects.create()).toEqual({ ok: false, reason: 'storage-full' });
      expect(names(e)).toEqual(['Project 1']);
      expect(e.toasts.current()?.kind).toBe('error');
    });

    it('an index write failure rolls the new project key back', () => {
      const e = boot();
      const before = Object.keys(localStorage).sort();
      failWrites((k) => k === PROJECTS_INDEX_KEY);
      expect(e.projects.duplicate().ok).toBe(false);
      expect(e.projects.addShared('x', e.design.snapshot()).ok).toBe(false);
      expect(Object.keys(localStorage).sort()).toEqual(before);
      expect(names(e)).toEqual(['Project 1']);
    });

    it('rename and delete change nothing when the index cannot be written', () => {
      const e = boot();
      e.projects.create();
      failWrites((k) => k === PROJECTS_INDEX_KEY);
      const id = e.index.projects()[0].id;
      expect(e.projects.rename(id, 'New').ok).toBe(false);
      expect(e.projects.remove(id).ok).toBe(false);
      expect(names(e)).toEqual(['Project 1', 'Project 2']);
      expect(localStorage.getItem(projectKey(id))).not.toBeNull();
    });
  });

  describe('another tab', () => {
    it('a storage event on the index refreshes the list but keeps the open project', () => {
      const e = boot();
      const mine = e.index.activeId();
      const other = 'pzzzzzzzz';
      localStorage.setItem(projectKey(other), '{}');
      localStorage.setItem(
        PROJECTS_INDEX_KEY,
        JSON.stringify({
          activeId: other,
          projects: [{ id: other, name: 'Remote', createdAt: 1, updatedAt: 2 }],
        }),
      );
      window.dispatchEvent(new StorageEvent('storage', { key: PROJECTS_INDEX_KEY }));
      expect(e.index.activeId()).toBe(mine);
      expect(names(e)).toEqual(['Remote', 'Project 1']);
    });
  });
});
