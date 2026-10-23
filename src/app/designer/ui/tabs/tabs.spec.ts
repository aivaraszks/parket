import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { DesignState } from '../../state/design-state';
import { PlanEditorLauncher } from '../plan-editor-launcher';
import { FloorTab } from './floor-tab';
import { LightTab } from './light-tab';
import { RoomTab } from './room-tab';
import { SurfacesTab } from './surfaces-tab';

function setup<T>(component: Type<T>) {
  localStorage.clear();
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(component);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const state = TestBed.inject(DesignState);
  const labels = (): string[] =>
    Array.from(el.querySelectorAll('label.label')).map((l) => l.textContent!.trim());
  const range = (label: string): HTMLInputElement => {
    const l = Array.from(el.querySelectorAll('label.label')).find(
      (x) => x.textContent!.trim() === label,
    )!;
    return el.querySelector<HTMLInputElement>(`#${l.getAttribute('for')}`)!;
  };
  const setRange = (label: string, value: number): void => {
    const input = range(label);
    input.value = String(value);
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  return { fixture, el, state, labels, range, setRange };
}

describe('RoomTab', () => {
  it('has a heading and the three size fields', () => {
    const { el, labels } = setup(RoomTab);
    expect(el.querySelector('h2')?.textContent).toBe('Room');
    expect(labels()).toEqual(['Length', 'Width', 'Ceiling height']);
    expect(el.querySelectorAll('fieldset').length).toBe(1);
    expect(el.querySelector('legend')?.textContent).toBe('Room');
  });

  it('updates the room from the sliders', () => {
    const { state, setRange } = setup(RoomTab);
    setRange('Length', 7);
    setRange('Width', 6);
    setRange('Ceiling height', 3);
    expect(state.simpleRoom()).toEqual({ length: 7, width: 6, height: 3 });
  });
});

describe('SurfacesTab', () => {
  it('has a swatch group for walls and one for the ceiling', () => {
    const { el } = setup(SurfacesTab);
    const legends = Array.from(el.querySelectorAll('legend')).map((l) => l.textContent);
    expect(legends).toEqual(['Wall colour', 'Ceiling colour']);
    expect(el.querySelector('input[aria-label="Custom wall colour"]')).not.toBeNull();
    expect(el.querySelector('input[aria-label="Custom ceiling colour"]')).not.toBeNull();
  });

  it('sets the wall and ceiling colour', () => {
    const { fixture, el, state } = setup(SurfacesTab);
    const [walls, ceiling] = Array.from(el.querySelectorAll('fieldset'));
    const pick = (group: Element, name: string): void => {
      group.querySelector<HTMLInputElement>(`input[aria-label="${name}"]`)!.click();
      fixture.detectChanges();
    };
    pick(walls, 'Sage');
    pick(ceiling, 'Charcoal');
    expect(state.wallColor()).toBe('#b5bfa5');
    expect(state.ceilingColor()).toBe('#3d3a38');
  });
});

describe('FloorTab', () => {
  it('has the wood, plank, angle and finish controls', () => {
    const { el, labels } = setup(FloorTab);
    expect(el.querySelector('h2')?.textContent).toBe('Floor');
    expect(labels()).toEqual(['Plank length', 'Plank width', 'Planks per block', 'Angle']);
    expect(el.textContent).toContain('1 = classic herringbone');
    const legends = Array.from(el.querySelectorAll('legend')).map((l) => l.textContent);
    expect(legends).toEqual(['Wood', 'Finish']);
    expect(el.textContent).toContain('Pattern: Herringbone');
  });

  it('updates species, plank, angle and finish', () => {
    const { fixture, el, state, labels, setRange } = setup(FloorTab);
    const [length, width, , angle] = labels();
    el.querySelector<HTMLInputElement>('input[type=radio][value=walnut]')!.click();
    el.querySelector<HTMLInputElement>('input[type=radio][value=gloss]')!.click();
    setRange(length, 800);
    setRange(width, 120);
    setRange(angle, 45);
    fixture.detectChanges();
    expect(state.species()).toBe('walnut');
    expect(state.finish()).toBe('gloss');
    expect(state.plank()).toEqual({ length: 800, width: 120 });
    expect(state.angle()).toBe(45);
  });

  it('sets planks per block and says when the plank size was adjusted', () => {
    const { fixture, el, state, setRange } = setup(FloorTab);
    setRange('Planks per block', 4);
    expect(state.planksPerBlock()).toBe(4);
    expect(state.plank()).toEqual({ length: 600, width: 75 });
    expect(el.querySelector('[role=status]')?.textContent).toContain('width set to 75 mm');
    setRange('Planks per block', 2);
    fixture.detectChanges();
    expect(el.querySelector('[role=status]')).toBeNull();
  });
});

describe('LightTab', () => {
  it('has the sunlight switch and three sliders', () => {
    const { el, labels } = setup(LightTab);
    expect(el.querySelector('h2')?.textContent).toBe('Light');
    expect(el.querySelector('input[role=switch]')).not.toBeNull();
    expect(labels()).toEqual(['Sun direction', 'Sun height', 'Brightness']);
    expect(el.querySelectorAll('fieldset').length).toBe(0);
  });

  it('allows the full circle for the sun direction', () => {
    const { range } = setup(LightTab);
    expect(range('Sun direction').min).toBe('0');
    expect(range('Sun direction').max).toBe('359');
  });

  it('updates the sun and disables the sliders when it is off', () => {
    const { fixture, el, state, range, setRange } = setup(LightTab);
    setRange('Sun direction', 200);
    setRange('Sun height', 50);
    setRange('Brightness', 1.5);
    expect(state.sun()).toEqual({ on: true, azimuth: 200, elevation: 50, intensity: 1.5 });

    el.querySelector<HTMLInputElement>('input[role=switch]')!.click();
    fixture.detectChanges();
    expect(state.sun().on).toBe(false);
    expect(range('Sun direction').disabled).toBe(true);
    expect(el.textContent).toContain('Turn sunlight on to adjust it.');
  });
});

describe('RoomTab mode toggle', () => {
  const launcher = { open: vi.fn(), close: vi.fn(), closed: vi.fn() };

  function setupMode() {
    localStorage.clear();
    launcher.open.mockClear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: PlanEditorLauncher, useValue: launcher }],
    });
    const fixture = TestBed.createComponent(RoomTab);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const radio = (value: string) =>
      el.querySelector<HTMLInputElement>(`input[type=radio][value=${value}]`)!;
    return { fixture, el, state: TestBed.inject(DesignState), radio };
  }

  it('offers Simple rectangle and Custom shape, simple selected', () => {
    const { el, radio } = setupMode();
    expect(Array.from(el.querySelectorAll('.face')).map((f) => f.textContent)).toEqual([
      'Simple rectangle',
      'Custom shape',
    ]);
    expect(radio('simple').checked).toBe(true);
    expect(el.textContent).toContain('Both rooms are saved.');
  });

  it('opens the editor on the first switch to Custom and shows the summary card', () => {
    const { fixture, el, state, radio } = setupMode();
    radio('custom').click();
    fixture.detectChanges();
    expect(state.mode()).toBe('custom');
    expect(launcher.open).toHaveBeenCalledTimes(1);
    expect(
      Array.from(el.querySelectorAll('label.label')).map((l) => l.textContent!.trim()),
    ).toEqual(['Ceiling height']);
    const text = el.textContent!.replace(/\s+/g, ' ');
    expect(text).toContain('4 corners · 20.00 m²');
    expect(text).toContain('No doors · 1 window');
    expect(text).toContain('Doors and windows are set in the shape editor.');
  });

  it('only flips the mode on later switches and Edit shape opens the editor', () => {
    const { fixture, el, state, radio } = setupMode();
    radio('custom').click();
    radio('simple').click();
    radio('custom').click();
    fixture.detectChanges();
    expect(launcher.open).toHaveBeenCalledTimes(1);
    el.querySelector<HTMLButtonElement>('[data-edit-shape]')!.click();
    expect(launcher.open).toHaveBeenCalledTimes(2);
    expect(state.mode()).toBe('custom');
  });

  it('sets the ceiling height of the active mode', () => {
    const { fixture, state, radio, el } = setupMode();
    radio('custom').click();
    fixture.detectChanges();
    const range = el.querySelector<HTMLInputElement>('input[type=range]')!;
    range.value = '3';
    range.dispatchEvent(new Event('input'));
    expect(state.roomHeight()).toBe(3);
    expect(state.simpleRoom().height).toBe(2.7);
  });
});

describe('LightTab window hints', () => {
  const launcher = { open: vi.fn(), close: vi.fn(), closed: vi.fn() };

  function setupLight() {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: PlanEditorLauncher, useValue: launcher }],
    });
    const fixture = TestBed.createComponent(LightTab);
    fixture.detectChanges();
    return {
      fixture,
      el: fixture.nativeElement as HTMLElement,
      state: TestBed.inject(DesignState),
    };
  }

  it('warns when the sun is behind the walls', () => {
    const { fixture, el, state } = setupLight();
    expect(el.textContent).not.toContain('behind the walls');
    state.setSun({ azimuth: 0 });
    fixture.detectChanges();
    expect(el.textContent).toContain('The sun is behind the walls. Turn it towards a window.');
  });

  it('hides the hints when the sun is off', () => {
    const { fixture, el, state } = setupLight();
    state.setSun({ azimuth: 0, on: false });
    fixture.detectChanges();
    expect(el.textContent).not.toContain('behind the walls');
  });

  it('says a custom room has no windows and offers Edit shape', () => {
    const { fixture, el, state } = setupLight();
    state.setMode('custom');
    const plan = structuredClone(state.plan()!);
    plan.openings = [];
    state.setPlan(plan);
    fixture.detectChanges();
    expect(el.textContent).toContain('This room has no windows. Add one in the shape editor.');
    el.querySelector<HTMLButtonElement>('[data-edit-shape]')!.click();
    expect(launcher.open).toHaveBeenCalled();
  });
});
