import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rectangleToPlan } from '../plan/plan-edit';
import { DEFAULT_DESIGN, STORAGE_KEY, STORAGE_KEY_V2 } from './design-defaults';
import { activeProject } from './storage-fixtures';
import { DesignState, sanitizeDesign } from './design-state';

function create(): DesignState {
  TestBed.resetTestingModule();
  return TestBed.inject(DesignState);
}

describe('colour fields in sanitizeDesign', () => {
  it('treats the new fields as hostile input', () => {
    const d = sanitizeDesign({
      skirtingColor: '#FFF',
      doorColor: 5,
      simpleWallColors: ['#AABBCC', 7, '#12345g', 'x'.repeat(1_000_000), '#111111', '#222222'],
    });
    expect(d.skirtingColor).toBeNull();
    expect(d.doorColor).toBeNull();
    expect(d.simpleWallColors).toEqual(['#aabbcc', null, null, null]);
  });

  it('pads short arrays and ignores non-arrays', () => {
    expect(sanitizeDesign({ simpleWallColors: ['#aabbcc'] }).simpleWallColors).toEqual([
      '#aabbcc',
      null,
      null,
      null,
    ]);
    for (const bad of [{}, 'abcd', 5, null]) {
      expect(sanitizeDesign({ simpleWallColors: bad }).simpleWallColors).toEqual([
        null,
        null,
        null,
        null,
      ]);
    }
  });

  it('keeps any valid custom colour', () => {
    expect(sanitizeDesign({ skirtingColor: '#0a1B2c' }).skirtingColor).toBe('#0a1b2c');
  });
});

describe('storage v3', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('migrates v2 without colours and never writes v2', () => {
    const text = JSON.stringify({ wallColor: '#112233', angle: 20 });
    localStorage.setItem(STORAGE_KEY_V2, text);
    const s = create();
    expect(s.wallColor()).toBe('#112233');
    expect(s.angle()).toBe(20);
    expect(s.skirtingColor()).toBeNull();
    expect(s.doorColor()).toBeNull();
    expect(s.hasAccentWalls()).toBe(false);
    s.setAngle(30);
    s.flush();
    expect(localStorage.getItem(STORAGE_KEY_V2)).toBe(text);
    expect(activeProject().angle).toBe(30);
  });

  it('v3 wins over v2', () => {
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify({ angle: 20 }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ angle: 40 }));
    expect(create().angle()).toBe(40);
  });

  it('colours survive a reload', () => {
    const s = create();
    s.setSurfaceColor({ kind: 'wall', id: 's1' }, '#445566');
    s.setSurfaceColor({ kind: 'skirting' }, '#101010');
    s.setMode('custom');
    s.setSurfaceColor({ kind: 'wall', id: s.roomShape().wallIds[2] }, '#778899');
    s.flush();
    const again = create();
    expect(again.skirtingColor()).toBe('#101010');
    expect(Object.values(again.paint().walls)).toContain('#778899');
    expect(again.plan()!.walls[1].color).toBe('#445566'); // simple colours became plan colours
  });
});

describe('DesignState colouring', () => {
  beforeEach(() => localStorage.clear());

  it('switching to custom copies the simple wall colours into the plan', () => {
    const s = create();
    s.setSurfaceColor({ kind: 'wall', id: 's0' }, '#aa0000');
    s.setMode('custom');
    expect(s.plan()!.walls[0].color).toBe('#aa0000');
    expect(s.startingPlan().walls[0].color).toBe('#aa0000');
    expect(s.hasAccentWalls()).toBe(true);
  });

  it('All walls clears only the active mode; paint tracks it', () => {
    const s = create();
    s.setSurfaceColor({ kind: 'wall', id: 's0' }, '#aa0000');
    s.setMode('custom');
    s.setSurfaceColor({ kind: 'walls' }, '#00aa00');
    expect(s.hasAccentWalls()).toBe(false);
    s.setMode('simple');
    expect(s.hasAccentWalls()).toBe(true); // simple overrides untouched
    s.setSurfaceColor({ kind: 'walls' }, '#00aa00');
    expect(s.hasAccentWalls()).toBe(false);
    expect(s.paint().walls['s0']).toBe('#00aa00');
  });

  it('a colour change keeps the same roomShape', () => {
    const s = create();
    const shape = s.roomShape();
    s.setSurfaceColor({ kind: 'wall', id: 's0' }, '#aa0000');
    expect(s.roomShape()).toBe(shape);
  });

  it('reset strips plan colours and keeps the shape; undo restores them', () => {
    const s = create();
    s.setMode('custom');
    const id = s.roomShape().wallIds[0];
    s.setSurfaceColor({ kind: 'wall', id }, '#aa0000');
    const walls = s.plan()!.walls.length;
    s.reset();
    expect(s.plan()!.walls).toHaveLength(walls);
    expect(s.plan()!.walls.some((w) => w.color)).toBe(false);
    expect(s.simpleRoom()).toEqual(DEFAULT_DESIGN.room);
    s.undo();
    expect(s.plan()!.walls[0].color).toBe('#aa0000');
  });

  it('setPlan keeps colours', () => {
    const s = create();
    s.setMode('custom');
    s.setPlan(rectangleToPlan({ length: 5, width: 4, height: 2.7 }, ['#aa0000', null, null, null]));
    expect(s.paint().walls['w5']).toBe('#aa0000');
  });
});
