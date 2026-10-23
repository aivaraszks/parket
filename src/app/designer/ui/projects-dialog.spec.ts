import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SceneCommands } from '../scene/scene-commands';
import { ColouringState } from '../state/colouring-state';
import { DesignState } from '../state/design-state';
import { ProjectIndex } from '../state/project-index';
import { ProjectMeta } from '../state/project-meta';
import { Projects } from '../state/projects';
import { ColourAnnouncer } from './colour-announcer';
import { ProjectsDialog } from './projects-dialog';
import { Toasts } from './toasts';

const NOW = Date.now();
const meta = (id: string, name: string, updatedAt: number): ProjectMeta => ({
  id,
  name,
  createdAt: 1,
  updatedAt,
});

describe('ProjectsDialog', () => {
  const list = signal<ProjectMeta[]>([]);
  const activeId = signal('pkitchen1');
  const atLimit = signal(false);
  const projects = {
    atLimit,
    create: vi.fn(),
    switchTo: vi.fn(),
    rename: vi.fn(),
    duplicate: vi.fn(),
    remove: vi.fn(),
  };

  const plan = signal<unknown>(null);
  const design = {
    activeId,
    plan,
    reset: vi.fn(),
    undo: vi.fn(),
    canUndo: () => true,
    dismissUndo: vi.fn(),
  };
  const scene = { setPreset: vi.fn() };

  beforeEach(() => {
    plan.set(null);
    design.reset.mockReset();
    design.undo.mockReset();
    scene.setPreset.mockReset();
    list.set([
      meta('pmyroom01', 'My room', NOW - 3 * 86_400_000),
      meta('pkitchen1', 'Kitchen', NOW),
      meta('phall0001', 'Hall', NOW - 86_400_000),
    ]);
    activeId.set('pkitchen1');
    atLimit.set(false);
    projects.create.mockReset().mockReturnValue({ ok: true, id: 'pkitchen1' });
    projects.switchTo.mockReset().mockReturnValue({ ok: true, id: 'x' });
    projects.rename.mockReset().mockImplementation((id: string, name: string) => {
      list.update((l) => l.map((p) => (p.id === id ? { ...p, name } : p)));
      return { ok: true, id };
    });
    projects.duplicate.mockReset().mockReturnValue({ ok: true, id: 'pkitchen1' });
    projects.remove.mockReset().mockReturnValue({ ok: true, id: 'pmyroom01' });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: Projects, useValue: projects },
        { provide: ProjectIndex, useValue: { projects: list } },
        { provide: DesignState, useValue: design },
        { provide: SceneCommands, useValue: scene },
      ],
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  async function setup() {
    const chip = document.createElement('button');
    chip.setAttribute('data-trigger', 'projects');
    document.body.appendChild(chip);
    chip.focus();
    const fixture = TestBed.createComponent(ProjectsDialog);
    document.body.appendChild(fixture.nativeElement);
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const flush = async () => {
      await new Promise((r) => setTimeout(r, 0));
      fixture.detectChanges();
      await fixture.whenStable();
    };
    const q = (sel: string) => el.querySelector<HTMLElement>(sel)!;
    const key = (k: string, target: EventTarget = document.activeElement ?? document) =>
      target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    return { fixture, el, flush, q, closed, chip, key };
  }

  it('is a labelled modal dialog with a count and rows by recent edit', async () => {
    const { el, q } = await setup();
    const dialog = q('[role=dialog]');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(el.querySelector('#' + dialog.getAttribute('aria-labelledby'))?.textContent).toBe(
      'Projects',
    );
    expect(q('.count').textContent).toContain('3 of 50 projects');
    const names = Array.from(el.querySelectorAll('.row .name')).map((n) => n.textContent);
    expect(names).toEqual(['Kitchen', 'Hall', 'My room']);
  });

  it('marks the current row for assistive tech and focuses it', async () => {
    const { q, flush } = await setup();
    await flush();
    const current = q('[aria-current="true"]');
    expect(current.textContent?.replace(/\s+/g, ' ').trim()).toBe('Kitchen Edited today · Current');
    expect(document.activeElement).toBe(current);
    expect(q('.row:not([aria-current])').textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Hall Edited yesterday',
    );
  });

  it('opens a project and closes; the current row only closes', async () => {
    const { el, q, closed } = await setup();
    const hall = Array.from(el.querySelectorAll<HTMLElement>('.row')).find((r) =>
      r.textContent?.includes('Hall'),
    )!;
    hall.click();
    expect(projects.switchTo).toHaveBeenCalledWith('phall0001');
    expect(closed).toHaveBeenCalledTimes(1);
    q('[aria-current="true"]').click();
    expect(projects.switchTo).toHaveBeenCalledTimes(1);
    expect(closed).toHaveBeenCalledTimes(2);
  });

  it('New project creates, toasts and closes; at the limit it does nothing', async () => {
    const { q, closed, fixture } = await setup();
    q('[data-new]').click();
    expect(projects.create).toHaveBeenCalledTimes(1);
    expect(TestBed.inject(Toasts).current()?.text).toBe('Created “Kitchen”.');
    expect(closed).toHaveBeenCalledTimes(1);

    atLimit.set(true);
    fixture.detectChanges();
    const button = q('[data-new]');
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(q('#' + button.getAttribute('aria-describedby')).textContent).toContain(
      'Limit reached. Delete a project to add more.',
    );
    button.click();
    expect(projects.create).toHaveBeenCalledTimes(1);
  });

  it('opens the row menu on More and moves with the arrow keys', async () => {
    const { q, el, flush, key } = await setup();
    const more = q('[data-more="phall0001"]');
    expect(more.getAttribute('aria-label')).toBe('More actions for Hall');
    more.click();
    await flush();
    expect(more.getAttribute('aria-expanded')).toBe('true');
    const items = Array.from(el.querySelectorAll<HTMLElement>('.menu .item'));
    expect(items.map((i) => i.textContent?.trim())).toEqual(['Rename', 'Duplicate', 'Delete']);
    expect(document.activeElement).toBe(items[0]);
    key('ArrowDown');
    expect(document.activeElement).toBe(items[1]);
    key('ArrowUp');
    key('ArrowUp');
    expect(document.activeElement).toBe(items[2]);
  });

  it('renders the menu inside the dialog as a menu of menuitems, linked from More', async () => {
    const { q, flush } = await setup();
    const more = q('[data-more="phall0001"]');
    more.click();
    await flush();
    const menu = q('[role=dialog] [role=menu]');
    expect(menu).not.toBeNull();
    expect(more.getAttribute('aria-controls')).toBe(menu.id);
    expect(menu.querySelectorAll('[role=menuitem]').length).toBe(3);
  });

  it('Tab in the menu closes it and moves on from its More button', async () => {
    const { q, flush, key } = await setup();
    const more = q('[data-more="phall0001"]');
    more.click();
    await flush();
    key('Tab');
    await flush();
    expect(q('.menu')).toBeNull();
    expect(document.activeElement).toBe(more);
  });

  it('after a delete, focus goes to the toast Undo button, else the Projects chip', async () => {
    const { fixture, q, flush, chip } = await setup();
    const undo = document.createElement('button');
    undo.className = 'toast';
    const inner = document.createElement('button');
    inner.className = 'action';
    undo.appendChild(inner);
    document.body.appendChild(undo);
    q('[data-more="pmyroom01"]').click();
    await flush();
    vi.useFakeTimers();
    q('.menu .danger').click();
    fixture.destroy();
    vi.runAllTimers();
    expect(document.activeElement).toBe(inner);
    vi.useRealTimers();
    expect(chip).toBeTruthy();
  });

  describe('Reset to defaults', () => {
    it('is in the current row menu only, between Duplicate and Delete', async () => {
      const { el, q, flush } = await setup();
      q('[data-more="pkitchen1"]').click();
      await flush();
      const labels = () =>
        Array.from(el.querySelectorAll('.menu .item')).map((i) => i.textContent?.trim());
      expect(labels()).toEqual(['Rename', 'Duplicate', 'Reset to defaults', 'Delete']);
      q('[data-more="phall0001"]').click();
      await flush();
      expect(labels()).toEqual(['Rename', 'Duplicate', 'Delete']);
    });

    it('resets, returns to the Corner view, offers Undo and closes', async () => {
      const { q, flush, closed } = await setup();
      q('[data-more="pkitchen1"]').click();
      await flush();
      q('.menu .item:nth-child(3)').click();
      expect(design.reset).toHaveBeenCalledTimes(1);
      expect(scene.setPreset).toHaveBeenCalledWith('corner');
      const toasts = TestBed.inject(Toasts);
      expect(toasts.current()?.text).toBe('Design reset.');
      expect(toasts.current()?.action?.label).toBe('Undo');
      expect(TestBed.inject(ColourAnnouncer).message()).toBe('Design reset.');
      expect(closed).toHaveBeenCalledTimes(1);
      toasts.runAction();
      expect(design.undo).toHaveBeenCalledTimes(1);
    });

    it('returns the Colour selection to "All walls" when Colour is open', async () => {
      const colouring = TestBed.inject(ColouringState);
      colouring.setColourOpen(true);
      colouring.select({ kind: 'wall', id: 's2' }, 'list');
      const { q, flush } = await setup();
      q('[data-more="pkitchen1"]').click();
      await flush();
      q('.menu .item:nth-child(3)').click();
      expect(colouring.selected()).toEqual({ kind: 'walls' });
    });

    it('leaves the selection alone when Colour is closed', async () => {
      const colouring = TestBed.inject(ColouringState);
      const { q, flush } = await setup();
      q('[data-more="pkitchen1"]').click();
      await flush();
      q('.menu .item:nth-child(3)').click();
      expect(colouring.selected()).toBeNull();
    });

    it('notes that the room shape is kept when a plan exists', async () => {
      plan.set({});
      const { q, flush } = await setup();
      q('[data-more="pkitchen1"]').click();
      await flush();
      q('.menu .item:nth-child(3)').click();
      expect(TestBed.inject(Toasts).current()?.text).toBe('Design reset. Your room shape is kept.');
    });

    it('moves focus to the toast Undo button, else the Projects chip', async () => {
      const { fixture, q, flush, chip } = await setup();
      const toast = document.createElement('div');
      toast.className = 'toast';
      const action = document.createElement('button');
      action.className = 'action';
      toast.appendChild(action);
      document.body.appendChild(toast);
      q('[data-more="pkitchen1"]').click();
      await flush();
      vi.useFakeTimers();
      q('.menu .item:nth-child(3)').click();
      fixture.destroy();
      vi.runAllTimers();
      expect(document.activeElement).toBe(action);
      toast.remove();
      chip.blur();
      vi.useRealTimers();
    });
  });

  it('Escape closes the menu first (focus back on More), then the dialog', async () => {
    const { q, flush, key, closed } = await setup();
    const more = q('[data-more="phall0001"]');
    more.click();
    await flush();
    key('Escape');
    await flush();
    expect(q('.menu')).toBeNull();
    expect(document.activeElement).toBe(more);
    expect(closed).not.toHaveBeenCalled();
    key('Escape');
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('Duplicate and Delete go through Projects and close the dialog', async () => {
    const { q, flush, closed } = await setup();
    q('[data-more="phall0001"]').click();
    await flush();
    q('.menu .item:nth-child(2)').click();
    expect(projects.duplicate).toHaveBeenCalledWith('phall0001');
    expect(TestBed.inject(Toasts).current()?.text).toBe('Duplicated as “Kitchen”.');
    expect(closed).toHaveBeenCalledTimes(1);

    q('[data-more="pmyroom01"]').click();
    await flush();
    q('.menu .danger').click();
    expect(projects.remove).toHaveBeenCalledWith('pmyroom01');
    expect(TestBed.inject(ColourAnnouncer).message()).toBe('Deleted My room.');
    expect(closed).toHaveBeenCalledTimes(2);
  });

  it('Duplicate is aria-disabled at the limit and does nothing', async () => {
    atLimit.set(true);
    const { q, flush } = await setup();
    q('[data-more="phall0001"]').click();
    await flush();
    const duplicate = q('.menu .item:nth-child(2)');
    expect(duplicate.getAttribute('aria-disabled')).toBe('true');
    expect(duplicate.textContent).toContain('Limit reached');
    duplicate.click();
    expect(projects.duplicate).not.toHaveBeenCalled();
  });

  describe('rename', () => {
    async function startRename() {
      const ctx = await setup();
      ctx.q('[data-more="phall0001"]').click();
      await ctx.flush();
      ctx.q('.menu .item').click();
      await ctx.flush();
      const field = ctx.q('input[aria-label="Project name"]') as HTMLInputElement;
      return { ...ctx, field };
    }

    it('shows a labelled field with its helper, focused with the text selected', async () => {
      const { field, el } = await startRename();
      expect(document.activeElement).toBe(field);
      expect(field.value).toBe('Hall');
      expect(field.maxLength).toBe(40);
      expect(el.querySelector('#' + field.getAttribute('aria-describedby'))?.textContent).toBe(
        '1 to 40 characters',
      );
      expect(field.selectionStart).toBe(0);
      expect(field.selectionEnd).toBe(4);
    });

    it('Enter saves, announces and returns focus to More; the dialog stays open', async () => {
      const { field, flush, q, key, closed } = await startRename();
      field.value = '  Hallway ';
      key('Enter', field);
      await flush();
      expect(projects.rename).toHaveBeenCalledWith('phall0001', 'Hallway');
      expect(TestBed.inject(ColourAnnouncer).message()).toBe('Renamed to Hallway.');
      expect(q('input[aria-label="Project name"]')).toBeNull();
      expect(document.activeElement).toBe(q('[data-more="phall0001"]'));
      expect(closed).not.toHaveBeenCalled();
    });

    it('Escape cancels and keeps the old name', async () => {
      const { field, flush, q, key, closed } = await startRename();
      field.value = 'Changed';
      key('Escape', field);
      await flush();
      expect(projects.rename).not.toHaveBeenCalled();
      expect(q('input[aria-label="Project name"]')).toBeNull();
      expect(document.activeElement).toBe(q('[data-more="phall0001"]'));
      expect(closed).not.toHaveBeenCalled();
    });

    it('an empty value reverts silently with "Name unchanged."', async () => {
      const { field, flush, key } = await startRename();
      field.value = '   ';
      key('Enter', field);
      await flush();
      expect(projects.rename).not.toHaveBeenCalled();
      expect(TestBed.inject(ColourAnnouncer).message()).toBe('Name unchanged.');
    });

    it('leaving the field saves it', async () => {
      const { field, flush } = await startRename();
      field.value = 'Corridor';
      field.dispatchEvent(new FocusEvent('blur'));
      await flush();
      expect(projects.rename).toHaveBeenCalledWith('phall0001', 'Corridor');
    });
  });

  it('keeps Tab inside the dialog and closes on Escape and the scrim', async () => {
    const { el, q, closed } = await setup();
    const items = Array.from(el.querySelectorAll<HTMLElement>('button'));
    items[items.length - 1].focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(items[0]);
    q('.scrim').click();
    expect(closed).toHaveBeenCalledTimes(1);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(closed).toHaveBeenCalledTimes(2);
  });

  it('returns focus to the Projects chip when destroyed', async () => {
    const { fixture, chip } = await setup();
    vi.useFakeTimers();
    chip.blur();
    fixture.destroy();
    vi.runAllTimers();
    expect(document.activeElement).toBe(chip);
    vi.useRealTimers();
  });
});
