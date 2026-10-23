import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clampToLimit,
  DEFAULT_DESIGN,
  LIMITS,
  PERSIST_DEBOUNCE_MS,
  STORAGE_KEY,
} from './design-defaults';
import { DesignState, sanitizeDesign } from './design-state';
import { rectangleToPlan } from '../plan/plan-edit';
import { STORAGE_KEY_V1 } from './design-defaults';

function create(): DesignState {
  TestBed.resetTestingModule();
  return TestBed.inject(DesignState);
}

describe('clampToLimit', () => {
  it('clamps, snaps and rejects non-numbers', () => {
    expect(clampToLimit(99, LIMITS.roomLength, 5)).toBe(12);
    expect(clampToLimit(-1, LIMITS.roomLength, 5)).toBe(2);
    expect(clampToLimit(4.567, LIMITS.roomLength, 5)).toBe(4.57);
    expect(clampToLimit(603, LIMITS.plankLength, 600)).toBe(600);
    expect(clampToLimit(0.30000000000000004, LIMITS.sunIntensity, 1)).toBe(0.3);
    expect(clampToLimit(NaN, LIMITS.angle, 7)).toBe(7);
    expect(clampToLimit('3', LIMITS.angle, 7)).toBe(7);
  });
});

describe('DesignState', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('starts with the plan defaults', () => {
    const s = create();
    expect(s.simpleRoom()).toEqual({ length: 5, width: 4, height: 2.7 });
    expect(s.plank()).toEqual({ length: 600, width: 100 });
    expect(s.wastePercent()).toBe(12);
    expect(s.angle()).toBe(0);
    expect(s.finish()).toBe('satin');
    expect(s.sun()).toEqual({ on: true, azimuth: 135, elevation: 35, intensity: 1 });
    expect(s.floorArea()).toBe(20);
    expect(s.planksNet()).toBe(334);
    expect(s.planksWithWaste()).toBe(374);
    expect(s.areaWithWaste()).toBeCloseTo(22.4, 10);
  });

  it('clamps setters to limits', () => {
    const s = create();
    s.setRoomLength(50);
    s.setRoomWidth(0);
    s.setRoomHeight(10);
    s.setAngle(500);
    s.setWastePercent(-5);
    s.setSun({ azimuth: 999, elevation: 0, intensity: 9 });
    s.setSun({ azimuth: 10 });
    expect(s.sun().azimuth).toBe(10);
    s.setSun({ azimuth: 999 });
    expect(s.simpleRoom()).toEqual({ length: 12, width: 2, height: 4 });
    expect(s.angle()).toBe(179);
    expect(s.wastePercent()).toBe(0);
    expect(s.sun()).toEqual({ on: true, azimuth: 359, elevation: 10, intensity: 2 });
  });

  it('ignores invalid values', () => {
    const s = create();
    s.setRoomLength(NaN);
    s.setWallColor('red');
    s.setFinish('shiny' as never);
    s.setSpecies('Bad Id!');
    expect(s.simpleRoom().length).toBe(5);
    expect(s.wallColor()).toBe('#efe9df');
    expect(s.finish()).toBe('satin');
    expect(s.species()).toBe('golden-oak');
  });

  it('enforces plank length >= 2 x width without touching the other value', () => {
    const s = create();
    s.setPlankLength(150);
    expect(s.plank()).toEqual({ length: 300, width: 100 });
    s.setPlankWidth(200);
    expect(s.plank()).toEqual({ length: 300, width: 150 });
    s.setPlankLength(300);
    s.setPlankWidth(50);
    s.setPlankLength(300);
    expect(s.plank().length).toBe(300);
    expect(s.plankLengthMin()).toBe(300);
    expect(s.plankWidthMax()).toBe(150);
  });

  it('defaults planks per block to 1 and clamps it to 1-10', () => {
    const s = create();
    expect(s.planksPerBlock()).toBe(1);
    s.setPlanksPerBlock(4);
    expect(s.planksPerBlock()).toBe(4);
    s.setPlanksPerBlock(99);
    expect(s.planksPerBlock()).toBe(10);
    s.setPlanksPerBlock(-2);
    expect(s.planksPerBlock()).toBe(1);
    s.setPlanksPerBlock(NaN);
    expect(s.planksPerBlock()).toBe(1);
  });

  it('shrinks the width, then raises the length, when planks per block no longer fit', () => {
    const s = create(); // 600 x 100
    s.setPlanksPerBlock(3);
    expect(s.plank()).toEqual({ length: 600, width: 100 });
    s.setPlanksPerBlock(4);
    expect(s.plank()).toEqual({ length: 600, width: 75 });
    s.setPlanksPerBlock(10);
    expect(s.plank()).toEqual({ length: 800, width: 40 });
    s.setPlanksPerBlock(1);
    expect(s.plank()).toEqual({ length: 800, width: 40 });
  });

  it('accounts for planks per block in the dynamic ranges and setters', () => {
    const s = create();
    s.setPlanksPerBlock(4); // 600 x 75
    expect(s.plankLengthMin()).toBe(600);
    expect(s.plankWidthMax()).toBe(75);
    s.setPlankWidth(200);
    expect(s.plank().width).toBe(75);
    s.setPlankLength(300);
    expect(s.plank().length).toBe(600);
    s.setPlankWidth(40);
    expect(s.plankLengthMin()).toBe(320);
    expect(s.plankWidthMax()).toBe(75);
  });

  it('allows a plank width of 40 mm', () => {
    const s = create();
    s.setPlankWidth(40);
    expect(s.plank().width).toBe(40);
  });

  it('keeps planks per block in the layout key and persists it', () => {
    const s = create();
    const key = s.placementsKey();
    s.setPlanksPerBlock(4);
    expect(s.placementsKey()).not.toBe(key);
    s.flush();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).planksPerBlock).toBe(4);
    expect(create().planksPerBlock()).toBe(4);
  });

  it('loads a design saved before planks per block existed with the value 1', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ species: 'golden-oak', plank: { length: 900, width: 120 }, angle: 33 }),
    );
    const s = create();
    expect(s.planksPerBlock()).toBe(1);
    expect(s.plank()).toEqual({ length: 900, width: 120 });
    expect(s.angle()).toBe(33);
  });

  it('repairs a stored combination that breaks the block rule', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ plank: { length: 400, width: 100 }, planksPerBlock: 10 }),
    );
    const s = create();
    expect(s.plank().length).toBeGreaterThanOrEqual(2 * s.planksPerBlock() * s.plank().width);
    expect(s.plank().width).toBeGreaterThanOrEqual(40);
    expect(create().planksPerBlock()).toBeGreaterThanOrEqual(1);
  });

  it('updates the placements key only for layout inputs', () => {
    const s = create();
    const key = s.placementsKey();
    s.setFinish('gloss');
    s.setWallColor('#ffffff');
    expect(s.placementsKey()).toBe(key);
    s.setAngle(30);
    expect(s.placementsKey()).not.toBe(key);
  });

  it('persists with a debounce and restores (round trip)', () => {
    const s = create();
    s.setRoomLength(7.25);
    s.setAngle(33);
    s.setSpecies('walnut');
    s.setSun({ on: false });
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS - 1);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    vi.advanceTimersByTime(1);
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();

    const restored = create();
    expect(restored.simpleRoom().length).toBe(7.25);
    expect(restored.angle()).toBe(33);
    expect(restored.species()).toBe('walnut');
    expect(restored.sun().on).toBe(false);
  });

  it('writes only once for a burst of changes', () => {
    const s = create();
    const spy = vi.spyOn(Storage.prototype, 'setItem');
    for (let i = 0; i < 50; i++) s.setAngle(i);
    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('flush writes immediately', () => {
    const s = create();
    s.setAngle(12);
    s.flush();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).angle).toBe(12);
  });

  it('falls back to defaults on corrupt storage', () => {
    for (const bad of ['{not json', 'null', '42', '"text"', '[]']) {
      localStorage.setItem(STORAGE_KEY, bad);
      expect(create().simpleRoom()).toEqual(DEFAULT_DESIGN.room);
    }
  });

  it('repairs invalid fields individually when loading', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        room: { length: 99, width: 'x', height: 3 },
        wallColor: 'javascript:alert(1)',
        species: '<img>',
        plank: { length: 400, width: 200 },
        angle: -40,
        finish: 'wet',
        sun: { on: 'yes', azimuth: 90 },
        wastePercent: 5,
        pattern: 'zigzag',
      }),
    );
    const s = create();
    expect(s.simpleRoom()).toEqual({ length: 12, width: 4, height: 3 });
    expect(s.wallColor()).toBe('#efe9df');
    expect(s.species()).toBe('golden-oak');
    expect(s.plank()).toEqual({ length: 400, width: 200 });
    expect(s.angle()).toBe(0);
    expect(s.sun()).toEqual({ on: true, azimuth: 90, elevation: 35, intensity: 1 });
  });

  it('survives storage that throws', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    const s = create();
    expect(s.simpleRoom()).toEqual(DEFAULT_DESIGN.room);
    s.setAngle(10);
    expect(() => vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS)).not.toThrow();
    expect(s.angle()).toBe(10);
    get.mockRestore();
    set.mockRestore();
  });

  it('rejects an invalid pattern and non-hex colours, normalises hex case', () => {
    const s = create();
    s.setPattern('zigzag' as never);
    expect(s.pattern()).toBe('herringbone');
    s.setCeilingColor('#12345');
    s.setCeilingColor('#ABCDEF');
    expect(s.ceilingColor()).toBe('#abcdef');
  });

  it('clamps plank values at the extremes and snaps to steps', () => {
    const s = create();
    s.setPlankLength(99999);
    expect(s.plank().length).toBe(LIMITS.plankLength.max);
    s.setPlankWidth(99999);
    expect(s.plank().width).toBe(s.plankWidthMax());
    s.setPlankLength(0);
    expect(s.plank().length).toBe(s.plankLengthMin());
    expect(s.plank().length).toBeGreaterThanOrEqual(2 * s.plank().width);
    s.setPlankWidth(-3);
    expect(s.plank().width).toBe(LIMITS.plankWidth.min);
    s.setPlankLength(NaN);
    expect(Number.isFinite(s.plank().length)).toBe(true);
  });

  it('never leaves length < 2 x width, whatever the order of edits', () => {
    const s = create();
    const values = [0, 50, 137, 300, 601, 1200, 5000];
    for (const a of values) {
      for (const b of values) {
        s.setPlankWidth(a);
        s.setPlankLength(b);
        expect(s.plank().length).toBeGreaterThanOrEqual(2 * s.plank().width);
        s.setPlankLength(a);
        s.setPlankWidth(b);
        expect(s.plank().length).toBeGreaterThanOrEqual(2 * s.plank().width);
      }
    }
  });

  it('repairs a stored plank that breaks the 2x rule', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ plank: { length: 300, width: 200 } }));
    const p = create().plank();
    expect(p.length).toBe(300);
    expect(p.width).toBeLessThanOrEqual(150);
  });

  it('updates the estimate when room, plank or waste change', () => {
    const s = create();
    s.setRoomLength(10);
    expect(s.floorArea()).toBe(40);
    s.setWastePercent(0);
    expect(s.planksWithWaste()).toBe(s.planksNet());
    s.setPlankWidth(50);
    expect(s.planksNet()).toBeGreaterThan(667);
  });

  it('undo without a reset does nothing, and reset twice keeps the latest snapshot', () => {
    const s = create();
    s.setAngle(40);
    s.undo();
    expect(s.angle()).toBe(40);
    s.reset();
    s.reset();
    s.undo();
    expect(s.angle()).toBe(0);
  });

  it('restores all fields through a persistence round trip', () => {
    const s = create();
    s.setRoomWidth(3.5);
    s.setRoomHeight(3);
    s.setWallColor('#112233');
    s.setCeilingColor('#445566');
    s.setPlankLength(900);
    s.setPlankWidth(120);
    s.setFinish('gloss');
    s.setWastePercent(20);
    s.setSun({ azimuth: 200, elevation: 20, intensity: 1.5 });
    s.flush();
    const r = create();
    expect(r.simpleRoom()).toEqual(s.simpleRoom());
    expect(r.wallColor()).toBe('#112233');
    expect(r.ceilingColor()).toBe('#445566');
    expect(r.plank()).toEqual({ length: 900, width: 120 });
    expect(r.finish()).toBe('gloss');
    expect(r.wastePercent()).toBe(20);
    expect(r.sun()).toEqual(s.sun());
  });

  describe('reset and undo', () => {
    it('resets to defaults and undoes', () => {
      const s = create();
      s.setRoomLength(9);
      s.setAngle(80);
      expect(s.canUndo()).toBe(false);
      s.reset();
      expect(s.simpleRoom()).toEqual(DEFAULT_DESIGN.room);
      expect(s.angle()).toBe(0);
      expect(s.canUndo()).toBe(true);
      s.undo();
      expect(s.simpleRoom().length).toBe(9);
      expect(s.angle()).toBe(80);
      expect(s.canUndo()).toBe(false);
    });

    it('persists the reset and the undo', () => {
      const s = create();
      s.setAngle(80);
      s.reset();
      vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS);
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).angle).toBe(0);
      s.undo();
      vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS);
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).angle).toBe(80);
    });

    it('drops the buffer on dismiss or a new edit', () => {
      const s = create();
      s.setAngle(80);
      s.reset();
      s.dismissUndo();
      expect(s.canUndo()).toBe(false);
      s.undo();
      expect(s.angle()).toBe(0);

      s.setAngle(10);
      s.reset();
      s.setAngle(5);
      expect(s.canUndo()).toBe(false);
    });
  });
});

describe('sanitizeDesign', () => {
  it('returns independent defaults', () => {
    const a = sanitizeDesign(undefined);
    a.room.length = 11;
    expect(DEFAULT_DESIGN.room.length).toBe(5);
    expect(sanitizeDesign(undefined).room.length).toBe(5);
  });

  describe('persistence on leaving the page', () => {
    beforeEach(() => localStorage.clear());

    it('flushes on pagehide', () => {
      const s = create();
      s.setRoomLength(7);
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
      window.dispatchEvent(new Event('pagehide'));
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).room.length).toBe(7);
    });

    it('flushes when the page becomes hidden, not when visible', () => {
      const s = create();
      const state = vi.spyOn(document, 'visibilityState', 'get');
      s.setRoomLength(8);
      state.mockReturnValue('visible');
      document.dispatchEvent(new Event('visibilitychange'));
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
      state.mockReturnValue('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).room.length).toBe(8);
      state.mockRestore();
    });

    it('stops listening once destroyed', () => {
      const s = create();
      TestBed.resetTestingModule();
      localStorage.clear();
      s.setRoomLength(9);
      window.dispatchEvent(new Event('pagehide'));
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });
});

describe('custom room state (v2)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('starts in simple mode with no plan and a 4-corner room shape', () => {
    const s = create();
    expect(s.mode()).toBe('simple');
    expect(s.plan()).toBeNull();
    expect(s.roomShape().outline).toHaveLength(4);
    expect(s.roomShape().openings).toHaveLength(1);
    expect(s.roomHeight()).toBe(2.7);
    expect(s.skirtingLength()).toBeCloseTo(18, 10);
  });

  it('the first switch to custom copies the rectangle, later switches keep both', () => {
    const s = create();
    s.setRoomLength(6);
    s.setMode('custom');
    expect(s.mode()).toBe('custom');
    expect(s.plan()).not.toBeNull();
    expect(s.floorArea()).toBeCloseTo(24, 9);
    expect(s.roomShape().openings.map((o) => o.kind)).toEqual(['window']);
    const plan = s.plan();
    s.setMode('simple');
    s.setRoomLength(8);
    s.setMode('custom');
    expect(s.plan()).toBe(plan);
    expect(s.floorArea()).toBeCloseTo(24, 9);
    s.setMode('bogus' as never);
    expect(s.mode()).toBe('custom');
  });

  it('the room shape is memoised structurally', () => {
    const s = create();
    const shape = s.roomShape();
    s.setAngle(40);
    expect(s.roomShape()).toBe(shape);
    s.setRoomWidth(3);
    expect(s.roomShape()).not.toBe(shape);
  });

  it('setPlan takes valid plans only and drives area and skirting', () => {
    const s = create();
    s.setMode('custom');
    const plan = structuredClone(s.plan()!);
    plan.vertices[1].x = 8; // 8 x 4 = 32 m2
    plan.vertices[2].x = 8;
    plan.openings = [];
    s.setPlan(plan);
    expect(s.floorArea()).toBeCloseTo(32, 9);
    expect(s.skirtingLength()).toBeCloseTo(24, 9);
    const bad = structuredClone(plan);
    bad.vertices[2].x = -3; // bow-tie
    s.setPlan(bad);
    expect(s.floorArea()).toBeCloseTo(32, 9);
  });

  it('subtracts door widths from the skirting', () => {
    const s = create();
    s.setMode('custom');
    const plan = structuredClone(s.plan()!);
    plan.openings.push({
      id: 'o20',
      wallId: 'w7',
      kind: 'door',
      offset: 1,
      width: 0.9,
      height: 2.1,
      sill: 0,
      anchor: 'floor',
    });
    s.setPlan(plan);
    expect(s.skirtingLength()).toBeCloseTo(17.1, 9);
  });

  it('setRoomHeight follows the active mode', () => {
    const s = create();
    s.setMode('custom');
    s.setRoomHeight(3.2);
    expect(s.roomHeight()).toBe(3.2);
    expect(s.plan()!.rooms[0].height).toBe(3.2);
    expect(s.simpleRoom().height).toBe(2.7);
    s.setMode('simple');
    s.setRoomHeight(2.4);
    expect(s.simpleRoom().height).toBe(2.4);
    expect(s.plan()!.rooms[0].height).toBe(3.2);
  });

  it('a height change that does nothing keeps the undo buffer and schedules no write', () => {
    const s = create();
    s.reset();
    s.flush();
    const spy = vi.spyOn(Storage.prototype, 'setItem');
    s.setRoomHeight(s.simpleRoom().height);
    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS);
    expect(s.canUndo()).toBe(true);
    expect(spy).not.toHaveBeenCalled();
    s.setMode('custom');
    expect(s.minRoomHeight()).toBeCloseTo(2.35, 9); // rectangle window: sill 0.9 + 1.4 + 0.05
  });

  it('refuses a too-low custom ceiling and leaves the plan alone', () => {
    const s = create();
    s.setMode('custom');
    const before = s.plan();
    s.setRoomHeight(2.3);
    expect(s.plan()).toBe(before);
    s.setRoomHeight(2.4);
    expect(s.roomHeight()).toBe(2.4);
  });

  it('reset keeps the custom plan, returns to simple mode, and undo restores', () => {
    const s = create();
    s.setMode('custom');
    s.setRoomLength(9);
    const plan = s.plan();
    s.reset();
    expect(s.mode()).toBe('simple');
    expect(s.plan()).toBe(plan);
    expect(s.simpleRoom()).toEqual(DEFAULT_DESIGN.room);
    s.undo();
    expect(s.mode()).toBe('custom');
    expect(s.simpleRoom().length).toBe(9);
  });

  it('persists to the v2 key and round-trips mode and plan', () => {
    const s = create();
    s.setMode('custom');
    s.flush();
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    const r = create();
    expect(r.mode()).toBe('custom');
    expect(r.plan()).toEqual(s.plan());
  });

  it('loads a v1 design unchanged in simple mode and never writes v1', () => {
    const v1 = JSON.stringify({
      room: { length: 7, width: 3, height: 3 },
      angle: 33,
      species: 'walnut',
    });
    localStorage.setItem(STORAGE_KEY_V1, v1);
    const s = create();
    expect(s.simpleRoom()).toEqual({ length: 7, width: 3, height: 3 });
    expect(s.angle()).toBe(33);
    expect(s.species()).toBe('walnut');
    expect(s.mode()).toBe('simple');
    s.setAngle(50);
    s.flush();
    expect(localStorage.getItem(STORAGE_KEY_V1)).toBe(v1);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).angle).toBe(50);
  });

  it('v2 wins over v1', () => {
    localStorage.setItem(STORAGE_KEY_V1, JSON.stringify({ angle: 10 }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ angle: 20 }));
    expect(create().angle()).toBe(20);
  });

  it('a v1 blob claiming custom mode is forced to simple', () => {
    localStorage.setItem(
      STORAGE_KEY_V1,
      JSON.stringify({ mode: 'custom', plan: rectangleToPlan(DEFAULT_DESIGN.room) }),
    );
    const s = create();
    expect(s.mode()).toBe('simple');
    expect(s.plan()).toBeNull();
  });

  it('mode custom with a missing or bad plan falls back to simple', () => {
    for (const plan of [undefined, null, 'x', { vertices: [] }, 42]) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode: 'custom', plan }));
      const s = create();
      expect(s.mode()).toBe('simple');
      expect(s.plan()).toBeNull();
    }
  });

  it('keeps old sun azimuths and allows the full circle', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ sun: { azimuth: 200 } }));
    const s = create();
    expect(s.sun().azimuth).toBe(200);
    s.setSun({ azimuth: 5 });
    expect(s.sun().azimuth).toBe(5);
    s.setSun({ azimuth: 400 });
    expect(s.sun().azimuth).toBe(359);
  });
});
