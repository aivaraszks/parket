import { TestBed } from '@angular/core/testing';
import { SceneCommands } from '../../scene/scene-commands';
import { DesignState } from '../../state/design-state';
import { Toasts } from '../toasts';
import { EstimateTab } from './estimate-tab';

describe('EstimateTab', () => {
  const scene = { setPreset: vi.fn(), zoom: vi.fn(), exportPng: vi.fn(), status: () => 'ready' };

  beforeEach(() => {
    localStorage.clear();
    scene.setPreset.mockClear();
    TestBed.configureTestingModule({ providers: [{ provide: SceneCommands, useValue: scene }] });
  });

  function setup() {
    const fixture = TestBed.createComponent(EstimateTab);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el, state: TestBed.inject(DesignState), toasts: TestBed.inject(Toasts) };
  }

  it('lists the results for the default room', () => {
    const { el } = setup();
    const text = el.textContent!.replace(/\s+/g, ' ');
    expect(text).toContain('Floor area20.00 m²');
    expect(text).toContain('Planks needed (no waste)334');
    expect(text).toContain('Area to buy (incl. waste)22.40 m²');
    expect(text).toContain('Planks to buy (incl. waste)374');
  });

  it('changes the waste allowance through the slider field', () => {
    const { fixture, el, state } = setup();
    const range = el.querySelector<HTMLInputElement>('input[type=range]')!;
    range.value = '20';
    range.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(state.wastePercent()).toBe(20);
    expect(el.textContent).toContain('Area to buy (incl. waste)24.00 m²');
  });

  it('resets without a dialog, returns to the Corner view and offers Undo', () => {
    const { fixture, el, state, toasts } = setup();
    state.setRoomLength(8);
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('button.btn')!.click();
    fixture.detectChanges();
    expect(state.simpleRoom().length).toBe(5);
    expect(scene.setPreset).toHaveBeenCalledWith('corner');
    expect(toasts.current()?.text).toBe('Design reset.');
    expect(toasts.current()?.action?.label).toBe('Undo');

    toasts.runAction();
    expect(state.simpleRoom().length).toBe(8);
    expect(toasts.current()).toBeNull();
  });

  it('shows the skirting length and the polygon wording', () => {
    const { el } = setup();
    const text = el.textContent!.replace(/\s+/g, ' ');
    expect(text).toContain('Skirting length');
    expect(text).toContain('Walls minus doors');
    expect(text).toContain('18.0 m');
    expect(text).toContain('Estimate for the floor area of your room.');
    expect(text).not.toContain('rectangular');
  });

  it('notes that the custom shape is kept only when one exists', () => {
    const { fixture, el, state } = setup();
    expect(el.textContent).not.toContain('Your custom shape is kept.');
    state.setMode('custom');
    fixture.detectChanges();
    expect(el.textContent).toContain('Your custom shape is kept.');
    el.querySelector<HTMLButtonElement>('button.btn')!.click();
    fixture.detectChanges();
    expect(state.mode()).toBe('simple');
    expect(state.plan()).not.toBeNull();
  });

  it('drops the Undo toast when the design is edited afterwards', () => {
    const { fixture, el, state, toasts } = setup();
    el.querySelector<HTMLButtonElement>('button.btn')!.click();
    fixture.detectChanges();
    state.setRoomWidth(6);
    fixture.detectChanges();
    expect(toasts.current()).toBeNull();
  });

  it('drops the Undo toast on an edit even after the Estimate tab is gone', () => {
    const { fixture, el, state, toasts } = setup();
    el.querySelector<HTMLButtonElement>('button.btn')!.click();
    fixture.detectChanges();
    fixture.destroy();
    state.setRoomWidth(6);
    TestBed.tick();
    expect(toasts.current()).toBeNull();
  });
});
