import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { moveVertex, NO_SNAP } from '../plan/plan-edit';
import { validatePlan } from '../plan/plan-validate';
import { DesignState } from '../state/design-state';
import { EditorSession } from './editor-session';

describe('EditorSession history', () => {
  let state: DesignState;
  let session: EditorSession;

  const open = (): EditorSession => {
    const s = TestBed.runInInjectionContext(() => new EditorSession());
    return s;
  };
  const vertex = (id: string, plan = session.plan()) => plan.vertices.find((v) => v.id === id)!;

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    TestBed.resetTestingModule();
    state = TestBed.inject(DesignState);
    state.setMode('custom');
    session = open();
  });
  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('starts empty and each accepted edit is one undo step', () => {
    expect(session.canUndo()).toBe(false);
    expect(session.canRedo()).toBe(false);
    session.setCorner('v2', { x: 6, y: 0 });
    session.addOpeningTo('w6', 'door');
    expect(session.canUndo()).toBe(true);
    session.undo();
    expect(session.plan().openings.some((o) => o.kind === 'door')).toBe(false);
    session.undo();
    expect(vertex('v2').x).toBe(5);
    expect(session.canUndo()).toBe(false);
    expect(session.canRedo()).toBe(true);
  });

  it('a refused edit adds no step and no storage change', () => {
    const before = state.plan();
    expect(session.setCorner('v2', { x: 0.1, y: 0 })).toBe(false);
    expect(session.canUndo()).toBe(false);
    expect(state.plan()).toBe(before);
    expect(session.chip()).not.toBeNull();
  });

  it('undo and redo write through to the design state every time', () => {
    session.setCorner('v2', { x: 6, y: 0 });
    expect(state.plan()!.vertices[1].x).toBe(6);
    session.undo();
    expect(state.plan()!.vertices[1].x).toBe(5);
    session.redo();
    expect(state.plan()!.vertices[1].x).toBe(6);
  });

  it('a new edit after an undo drops the redo branch', () => {
    session.setCorner('v2', { x: 6, y: 0 });
    session.undo();
    session.setCorner('v2', { x: 7, y: 0 });
    expect(session.canRedo()).toBe(false);
    session.redo();
    expect(vertex('v2').x).toBe(7);
  });

  it('undo and redo with nothing to do are harmless', () => {
    session.undo();
    session.redo();
    expect(session.canUndo()).toBe(false);
    expect(session.plan()).toBe(state.plan());
  });

  it('undo across a simple/custom switch restores the plan without changing the mode', () => {
    session.setCorner('v2', { x: 6, y: 0 });
    session.setCorner('v3', { x: 6, y: 5 });
    state.setMode('simple');
    expect(state.floorArea()).toBeCloseTo(20, 9); // the simple room is untouched

    session.undo();
    expect(state.mode()).toBe('simple');
    expect(state.plan()!.vertices[2].y).toBe(4);
    expect(state.floorArea()).toBeCloseTo(20, 9);

    state.setMode('custom');
    expect(state.floorArea()).toBeCloseTo(22, 9); // v2 moved, v3 not (undone)
    session.redo();
    expect(state.floorArea()).toBeCloseTo(27, 9);
    expect(validatePlan(state.plan()!)).toEqual([]);
  });

  it('keeps both rooms through repeated switches while undoing and redoing', () => {
    state.setRoomLength(8);
    session.setCorner('v2', { x: 6, y: 0 });
    for (let i = 0; i < 3; i++) {
      state.setMode('simple');
      session.undo();
      state.setMode('custom');
      session.redo();
    }
    expect(state.simpleRoom().length).toBe(8);
    expect(state.plan()!.vertices[1].x).toBe(6);
    expect(state.mode()).toBe('custom');
  });

  it('start over is one undoable step even after mode switches', () => {
    session.setCorner('v2', { x: 6, y: 0 });
    const edited = session.plan();
    state.setMode('simple');
    state.setRoomLength(7);
    state.setMode('custom');
    session.startOver();
    // It restarts from the simple room as it is now.
    expect(session.plan().vertices[1].x).toBe(7);
    session.undo();
    expect(session.plan()).toBe(edited);
    expect(state.plan()).toEqual(edited);
  });

  it('a drag is one step: preview does not touch the history or the state', () => {
    const base = session.plan();
    session.beginGesture();
    const moved = moveVertex(session.plan(), 'v2', { x: 6, y: 0 }, NO_SNAP);
    if (!moved.ok) throw new Error('refused');
    session.previewGesture(moved.plan);
    expect(session.canUndo()).toBe(false);
    expect(state.plan()!.vertices[1].x).toBe(5);
    session.endGesture('moved corner');
    expect(state.plan()!.vertices[1].x).toBe(6);
    session.undo();
    expect(session.plan()).toBe(base);
    expect(session.canUndo()).toBe(false);
  });

  it('a cancelled drag restores the plan and adds nothing', () => {
    const base = session.plan();
    session.beginGesture();
    const moved = moveVertex(session.plan(), 'v2', { x: 6, y: 0 }, NO_SNAP);
    if (!moved.ok) throw new Error('refused');
    session.previewGesture(moved.plan);
    session.cancelGesture();
    expect(session.plan()).toBe(base);
    expect(session.canUndo()).toBe(false);
    expect(session.gestureActive).toBe(false);
  });

  it('a drag that ends where it began adds no step', () => {
    session.beginGesture();
    session.endGesture('moved corner');
    expect(session.canUndo()).toBe(false);
  });

  it('arrow-key runs coalesce into one step within a second, but not after a pause', () => {
    session.setCorner('v1', { x: 0.1, y: 0 }, { coalesceKey: 'v1' });
    session.setCorner('v1', { x: 0.2, y: 0 }, { coalesceKey: 'v1' });
    session.undo();
    expect(vertex('v1').x).toBe(0);
    expect(session.canUndo()).toBe(false);

    session.redo();
    vi.advanceTimersByTime(2000);
    session.setCorner('v1', { x: 0.3, y: 0 }, { coalesceKey: 'v1' });
    session.undo();
    expect(vertex('v1').x).toBe(0.2);
  });

  it('an undo breaks a coalescing run', () => {
    session.setCorner('v1', { x: 0.1, y: 0 }, { coalesceKey: 'v1' });
    session.undo();
    session.setCorner('v1', { x: 0.2, y: 0 }, { coalesceKey: 'v1' });
    session.undo();
    expect(vertex('v1').x).toBe(0);
  });

  it('keeps at most 50 steps', () => {
    for (let i = 1; i <= 60; i++) {
      session.setCorner('v1', { x: i % 2 ? 0.1 : 0, y: 0 });
    }
    let steps = 0;
    while (session.canUndo()) {
      session.undo();
      steps++;
    }
    expect(steps).toBe(50);
  });

  it('undo and redo announce themselves in the live region', () => {
    session.setCorner('v2', { x: 6, y: 0 });
    session.undo();
    expect(session.message()).toMatch(/^Undone: /);
    session.redo();
    expect(session.message()).toMatch(/^Redone: /);
  });

  it('removing an opening is undoable and brings it back with its id', () => {
    session.addOpeningTo('w6', 'window');
    const added = session.plan().openings.at(-1)!;
    session.deleteOpening(added.id);
    expect(session.plan().openings.find((o) => o.id === added.id)).toBeUndefined();
    session.undo();
    expect(session.plan().openings.find((o) => o.id === added.id)).toEqual(added);
  });

  it('a selection that no longer exists after undo selects nothing', () => {
    session.addCorner('w6');
    const id = session.selection()!.id;
    expect(session.selected()).not.toBeNull();
    session.undo();
    expect(session.selection()!.id).toBe(id);
    expect(session.selected()).toBeNull();
  });

  it('a reopened editor starts from the saved plan with an empty history', () => {
    session.setCorner('v2', { x: 6, y: 0 });
    const reopened = open();
    expect(reopened.canUndo()).toBe(false);
    expect(reopened.plan()).toBe(state.plan());
  });

  it('after a Reset design (which keeps the plan) a reopened editor shows the kept plan', () => {
    session.setCorner('v2', { x: 6, y: 0 });
    state.reset();
    expect(state.mode()).toBe('simple');
    const reopened = open();
    expect(reopened.plan().vertices[1].x).toBe(6);
  });
});
