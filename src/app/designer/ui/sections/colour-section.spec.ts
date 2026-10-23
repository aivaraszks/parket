import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { opening, planFromPoints, RECT } from '../../plan/plan-fixtures';
import { ColouringState, HIGHLIGHT_FADE_MS } from '../../state/colouring-state';
import { DesignState } from '../../state/design-state';
import { ColourAnnouncer } from '../colour-announcer';
import { ColourConfirm } from '../colour-confirm';
import { Toasts } from '../toasts';
import { ColourSection } from './colour-section';

function setup() {
  localStorage.clear();
  TestBed.resetTestingModule();
  const state = TestBed.inject(DesignState);
  const colouring = TestBed.inject(ColouringState);
  colouring.setColourOpen(true);
  const fixture = TestBed.createComponent(ColourSection);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const q = (sel: string) => el.querySelector<HTMLInputElement>(sel)!;
  const chip = (label: string): HTMLInputElement =>
    Array.from(el.querySelectorAll<HTMLElement>('app-surface-list label.item'))
      .find((l) => {
        const input = l.querySelector('input')!;
        return (input.getAttribute('aria-label') ?? l.textContent!.trim()) === label;
      })!
      .querySelector('input')!;
  const choose = (label: string): void => {
    chip(label).click();
    fixture.detectChanges();
  };
  const swatch = (name: string): HTMLInputElement =>
    q(`app-swatch-group input[aria-label="${name}"]`);
  const pick = (name: string): void => {
    swatch(name).click();
    fixture.detectChanges();
  };
  return { fixture, el, state, colouring, q, chip, choose, swatch, pick };
}

describe('ColourSection', () => {
  beforeEach(() => TestBed.inject(Toasts).dismiss());

  it('shows What and Which rows and the strip for All walls in simple mode', () => {
    const { el, colouring, q } = setup();
    expect(colouring.selected()).toEqual({ kind: 'walls' });
    const what = Array.from(el.querySelectorAll('[aria-label="What to colour"] .face')).map((f) =>
      f.textContent!.trim(),
    );
    expect(what).toEqual(['Walls', 'Ceiling', 'Skirting']);
    const which = Array.from(el.querySelectorAll('[aria-label="Which one"] input')).map((i) =>
      i.getAttribute('aria-label'),
    );
    expect(which).toEqual(['All walls', 'Wall 1, has the window', 'Wall 2', 'Wall 3', 'Wall 4']);
    expect(q('input[aria-label="Custom wall colour"]')).not.toBeNull();
    expect(el.querySelector('h3')).toBeNull();
    expect(el.textContent).not.toContain('Done');
  });

  it('keeps the Which row for ceiling and skirting with a note', () => {
    const { el, choose } = setup();
    choose('Ceiling');
    expect(el.querySelector('app-surface-list .row .note')?.textContent).toBe('Whole ceiling.');
    expect(el.querySelector('[aria-label="Which one"]')).toBeNull();
    choose('Skirting');
    expect(el.querySelector('app-surface-list .row .note')?.textContent).toBe('All skirting.');
  });

  it('choosing a What chip selects All of that group and Which picks one', () => {
    const { colouring, choose } = setup();
    choose('Skirting');
    expect(colouring.selected()).toEqual({ kind: 'skirting' });
    choose('Walls');
    expect(colouring.selected()).toEqual({ kind: 'walls' });
    choose('Wall 2');
    expect(colouring.selected()).toEqual({ kind: 'wall', id: 's1' });
  });

  it('falls back to All walls when the selection is cleared', () => {
    const { fixture, colouring } = setup();
    colouring.clear();
    fixture.detectChanges();
    expect(colouring.selected()).toEqual({ kind: 'walls' });
  });

  it('follows a 3D tap in both rows and announces it', () => {
    const { fixture, colouring, el } = setup();
    colouring.select({ kind: 'wall', id: 's2' }, 'tap');
    fixture.detectChanges();
    const checked = Array.from(el.querySelectorAll<HTMLInputElement>('input[type=radio]:checked'))
      .filter((i) => i.closest('app-surface-list'))
      .map((i) => i.getAttribute('aria-label') ?? i.closest('label')!.textContent!.trim());
    expect(checked).toEqual(['Walls', 'Wall 3']);
    expect(TestBed.inject(ColourAnnouncer).message()).toBe('Wall 3 selected.');
  });

  it('a colour pick starts the highlight fade', () => {
    const { pick, colouring } = setup();
    vi.useFakeTimers();
    try {
      pick('Sage');
      expect(colouring.highlight()).not.toBeNull();
      vi.advanceTimersByTime(HIGHLIGHT_FADE_MS);
      expect(colouring.highlight()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('colours all walls from a palette swatch and announces it', () => {
    const { state, pick } = setup();
    pick('Sage');
    expect(state.wallColor()).toBe('#b5bfa5');
    expect(TestBed.inject(ColourAnnouncer).message()).toBe('All walls: Sage.');
  });

  it('selecting in the list shows the palette of that surface', () => {
    const { el, colouring, choose, state, pick } = setup();
    choose('Ceiling');
    expect(colouring.selected()).toEqual({ kind: 'ceiling' });
    expect(el.querySelector('legend')?.textContent).toBe('Colour for the ceiling');
    pick('Charcoal');
    expect(state.ceilingColor()).toBe('#3d3a38');
  });

  it('gives one wall its own colour and "Same as other walls" takes it away', () => {
    const { fixture, el, state, choose, pick, q } = setup();
    choose('Wall 3');
    expect(q('input[data-default]').checked).toBe(true);
    expect(el.textContent).toContain('Wall 3 is the same as other walls.');
    pick('Navy');
    expect(state.paint().walls['s2']).toBe('#34445a');
    expect(state.paint().walls['s1']).toBe(state.wallColor());
    expect(q('input[data-default]').checked).toBe(false);
    expect(el.textContent).toContain('Wall 3 is Navy.');
    q('input[data-default]').click();
    fixture.detectChanges();
    expect(state.paint().walls['s2']).toBe(state.wallColor());
  });

  it('the skirting default swatch is "Match walls"', () => {
    const { el, state, choose, pick, q, fixture } = setup();
    choose('Skirting');
    expect(el.textContent).toContain('Match walls');
    expect(el.textContent).toContain('Skirting matches the walls.');
    pick('Black');
    expect(state.skirtingColor()).toBe('#1d1c1b');
    q('input[data-default]').click();
    fixture.detectChanges();
    expect(state.skirtingColor()).toBeNull();
  });

  it('shows a custom colour as a hex readout', () => {
    const { fixture, el, state, choose } = setup();
    choose('Ceiling');
    state.setSurfaceColor({ kind: 'ceiling' }, '#a1b2c3');
    fixture.detectChanges();
    expect(el.textContent).toContain('Custom: #a1b2c3');
  });

  it('asks before changing all walls when a wall has its own colour', () => {
    const { fixture, state, choose, pick, swatch } = setup();
    choose('Wall 2');
    pick('Navy');
    choose('All walls');
    const before = state.wallColor();
    pick('Sage');
    const confirm = TestBed.inject(ColourConfirm);
    expect(confirm.pending()?.body).toBe('Wall 2 has its own colour. It will become this colour.');
    expect(state.wallColor()).toBe(before);
    // The swatch shows the old value again while the question is open.
    expect(swatch('Sage').checked).toBe(false);

    confirm.cancel();
    expect(state.wallColor()).toBe(before);
    expect(state.paint().walls['s1']).toBe('#34445a');

    pick('Sage');
    confirm.confirm();
    fixture.detectChanges();
    expect(state.wallColor()).toBe('#b5bfa5');
    expect(state.hasAccentWalls()).toBe(false);
    expect(TestBed.inject(Toasts).current()?.text).toBe('All walls changed.');

    TestBed.inject(Toasts).runAction();
    expect(state.wallColor()).toBe(before);
    expect(state.paint().walls['s1']).toBe('#34445a');
  });

  it('counts the accent walls when there are more than three', () => {
    const { state, choose, pick } = setup();
    for (const w of ['Wall 1, has the window', 'Wall 2', 'Wall 3', 'Wall 4']) {
      choose(w);
      pick('Navy');
    }
    choose('All walls');
    pick('Sage');
    expect(TestBed.inject(ColourConfirm).pending()?.body).toBe(
      '4 walls have their own colours. They will all become this colour.',
    );
    expect(state.wallColor()).not.toBe('#b5bfa5');
  });

  it('lists doors in a custom shape and paints a door and its group', () => {
    const { fixture, el, state, choose, pick, q } = setup();
    const plan = planFromPoints(RECT);
    plan.openings = [
      opening({ id: 'o1', wallId: plan.walls[0].id, kind: 'door', sill: 0, height: 2 }),
      opening({ id: 'o2', wallId: plan.walls[2].id, kind: 'door', sill: 0, height: 2 }),
    ];
    plan.nextId = 20;
    state.setMode('custom');
    state.setPlan(plan);
    fixture.detectChanges();
    const what = Array.from(el.querySelectorAll('[aria-label="What to colour"] .face')).map((f) =>
      f.textContent!.trim(),
    );
    expect(what).toEqual(['Walls', 'Doors', 'Ceiling', 'Skirting']);
    choose('Doors');
    choose('Door 2');
    expect(el.textContent).toContain('Paints the door and its frame.');
    expect(el.textContent).toContain('Door 2 is automatic.');
    pick('Walnut');
    expect(state.paint().doors['o2']).toBe('#5e3a1f');
    expect(state.paint().doors['o1']).not.toBe('#5e3a1f');
    choose('All doors');
    pick('Black');
    expect(state.doorColor()).toBe('#1d1c1b');
    expect(state.paint().doors['o2']).toBe('#1d1c1b');
    expect(q('input[aria-label="Custom colour for all doors"]')).not.toBeNull();
  });

  it('starts sentences with a capital in the value line and the announcement', () => {
    const { fixture, el, choose, pick } = setup();
    choose('Ceiling');
    pick('Sand');
    expect(TestBed.inject(ColourAnnouncer).message()).toBe('Ceiling: Sand.');
    expect(el.querySelector('.lines p:last-child')!.textContent).toBe('Ceiling is Sand.');
    fixture.detectChanges();
  });
});
