import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DesignState } from '../state/design-state';
import { PlanEditorLauncher } from '../ui/plan-editor-launcher';
import { Toasts } from '../ui/toasts';
import { PlanEditor } from './plan-editor';

// The default 5 x 4 m rectangle in an 800 x 600 canvas is fitted at 130 px per metre,
// centred on (2.5, 2): plan (x, y) is on screen at (400 + (x - 2.5) * 130, 300 + (y - 2) * 130).
const px = (x: number): number => 400 + (x - 2.5) * 130;
const py = (y: number): number => 300 + (y - 2) * 130;

describe('PlanEditor', () => {
  const launcher = { open: vi.fn(), close: vi.fn(), closed: vi.fn() };
  let fixture: ComponentFixture<PlanEditor>;
  let el: HTMLElement;
  let state: DesignState;

  beforeEach(async () => {
    localStorage.clear();
    launcher.close.mockClear();
    TestBed.configureTestingModule({
      providers: [{ provide: PlanEditorLauncher, useValue: launcher }],
    });
    state = TestBed.inject(DesignState);
    state.setMode('custom');
    fixture = TestBed.createComponent(PlanEditor);
    el = fixture.nativeElement as HTMLElement;
    await settle();
  });

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function pointer(
    type: string,
    target: Element,
    x: number,
    y: number,
    options: { id?: number; kind?: string; alt?: boolean } = {},
  ): void {
    const event = new MouseEvent(type, {
      bubbles: true,
      clientX: x,
      clientY: y,
      button: 0,
      altKey: options.alt ?? false,
    });
    Object.defineProperty(event, 'pointerId', { value: options.id ?? 1 });
    Object.defineProperty(event, 'pointerType', { value: options.kind ?? 'mouse' });
    target.dispatchEvent(event);
  }

  async function drag(target: Element, from: [number, number], to: [number, number]) {
    const svg = el.querySelector('svg.plan')!;
    pointer('pointerdown', target, from[0], from[1]);
    pointer('pointermove', svg, (from[0] + to[0]) / 2, (from[1] + to[1]) / 2);
    pointer('pointermove', svg, to[0], to[1]);
    await settle();
    pointer('pointerup', svg, to[0], to[1]);
    await settle();
  }

  const hit = (kind: string, id: string): Element =>
    el.querySelector(`.hits [data-kind=${kind}][data-id=${id}]`)!;
  const stop = (kind: string, id: string): HTMLElement =>
    el.querySelector<HTMLElement>(`.focus-layer [data-kind=${kind}][data-id=${id}]`)!;
  const action = (name: string): HTMLButtonElement =>
    el.querySelector<HTMLButtonElement>(`[data-action=${name}]`)!;
  const corner = (id: string) => state.plan()!.vertices.find((v) => v.id === id)!;
  const key = async (target: Element, k: string, init: KeyboardEventInit = {}) => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...init }));
    await settle();
  };
  const title = (): string => el.querySelector('#plan-form-title')!.textContent!.trim();
  const status = (): string => el.querySelector('.status')!.textContent!.trim();
  const live = (): string => el.querySelector('[aria-live=polite]')!.textContent!.trim();

  describe('structure and accessibility', () => {
    it('is a modal dialog labelled by its title, with focus on the title', () => {
      expect(el.getAttribute('role')).toBe('dialog');
      expect(el.getAttribute('aria-modal')).toBe('true');
      const heading = el.querySelector('#plan-editor-title')!;
      expect(el.getAttribute('aria-labelledby')).toBe('plan-editor-title');
      expect(heading.textContent).toBe('Room shape');
      expect(document.title).toBe('Room shape - Parket');
    });

    it('names the plan group and shows area and wall count', () => {
      const plan = el.querySelector('svg.plan')!;
      expect(plan.getAttribute('role')).toBe('group');
      expect(plan.getAttribute('aria-label')).toBe('Room plan, 4 corners, 20.00 square metres');
      expect(status()).toBe('20.00 m² · 4 walls');
    });

    it('has one focus stop per corner, wall and opening in reading order', () => {
      const labels = Array.from(el.querySelectorAll('.focus-layer [role=button]')).map((s) =>
        s.getAttribute('aria-label'),
      );
      expect(labels).toEqual([
        'Corner 1, x 0.00 metres, y 0.00 metres',
        'Wall 1, 5.00 metres, 1 window',
        'Window on wall 1, 1.75 metres wide',
        'Corner 2, x 5.00 metres, y 0.00 metres',
        'Wall 2, 4.00 metres',
        'Corner 3, x 5.00 metres, y 4.00 metres',
        'Wall 3, 5.00 metres',
        'Corner 4, x 0.00 metres, y 4.00 metres',
        'Wall 4, 4.00 metres',
      ]);
      for (const s of Array.from(el.querySelectorAll('.focus-layer [role=button]'))) {
        expect(s.getAttribute('tabindex')).toBe('0');
        expect(s.getAttribute('aria-pressed')).toBe('false');
      }
      expect(el.querySelector('.hits')!.getAttribute('aria-hidden')).toBe('true');
    });

    it('describes the plan by the first-use hint until it is dismissed', () => {
      const plan = el.querySelector('svg.plan')!;
      const hint = el.querySelector('app-plan-canvas .hint')!;
      expect(plan.getAttribute('aria-describedby')).toBe(hint.id);
      el.querySelector<HTMLButtonElement>('.hint-close')!.click();
      fixture.detectChanges();
      expect(el.querySelector('app-plan-canvas .hint')).toBeNull();
      expect(plan.getAttribute('aria-describedby')).toBeNull();
      expect(localStorage.getItem('parket.plan-hint.v1')).not.toBeNull();
    });

    it('keeps focus in the plan when the hint is closed', () => {
      const close = el.querySelector<HTMLButtonElement>('.hint-close')!;
      expect(close.getAttribute('aria-label')).toBe('Close hint');
      close.click();
      expect(document.activeElement).toBe(el.querySelector('svg.plan'));
    });

    it('zooms and fits with + - 0 while a corner has focus', async () => {
      const before = el.querySelector('.grid.major')!.getAttribute('d');
      await key(stop('corner', 'v1'), '+');
      expect(el.querySelector('.grid.major')!.getAttribute('d')).not.toBe(before);
      await key(stop('corner', 'v1'), '0');
      expect(el.querySelector('.grid.major')!.getAttribute('d')).toBe(before);
    });

    it('tabs from the title to Done', () => {
      const bar = Array.from(el.querySelectorAll('.bar > *')).map((n) => n.tagName);
      expect(bar.slice(0, 2)).toEqual(['H2', 'BUTTON']);
    });

    it('keeps a persistent polite live region and a status chip region', () => {
      expect(el.querySelector('[aria-live=polite]')).not.toBeNull();
      expect(el.querySelector('.chip-region')!.getAttribute('role')).toBe('status');
    });

    it('gives the toolbar buttons names and keeps Undo and Redo visible but disabled', () => {
      expect(action('undo').disabled).toBe(true);
      expect(action('redo').disabled).toBe(true);
      expect(el.querySelector('[aria-label="Zoom in"]')).not.toBeNull();
      expect(el.querySelector('[aria-label="Zoom out"]')).not.toBeNull();
      const snap = el.querySelector<HTMLInputElement>('input[role=switch]')!;
      expect(snap.checked).toBe(true);
      expect(el.querySelector(`#${snap.getAttribute('aria-describedby')}`)!.textContent).toBe(
        'Snaps to a 10 cm grid and 90° corners.',
      );
    });
  });

  describe('selection', () => {
    it('selects on tap and deselects on a tap on empty space', async () => {
      pointer('pointerdown', hit('corner', 'v1'), px(0), py(0));
      pointer('pointerup', el.querySelector('svg.plan')!, px(0), py(0));
      await settle();
      expect(title()).toBe('Corner 1');
      expect(stop('corner', 'v1').getAttribute('aria-pressed')).toBe('true');
      expect(live()).toContain('Corner 1, x 0.00 metres, y 0.00 metres selected');
      expect(el.querySelector('.badge-text')!.textContent!.trim()).toBe('Corner 1');

      const svg = el.querySelector('svg.plan')!;
      pointer('pointerdown', svg, 20, 580);
      pointer('pointerup', svg, 20, 580);
      await settle();
      expect(title()).toBe('Room shape');
    });

    it('selects a focused item', async () => {
      stop('wall', 'w6').dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      await settle();
      expect(title()).toBe('Wall 2 · 4.00 m');
    });

    it('does not move anything for a tap below the drag threshold', async () => {
      const svg = el.querySelector('svg.plan')!;
      pointer('pointerdown', hit('corner', 'v1'), px(0), py(0));
      pointer('pointermove', svg, px(0) + 3, py(0));
      pointer('pointerup', svg, px(0) + 3, py(0));
      await settle();
      expect(corner('v1').x).toBe(0);
      expect(action('undo').disabled).toBe(true);
    });
  });

  describe('dragging', () => {
    it('moves a corner with snapping and commits one undo step on release', async () => {
      const setPlan = vi.spyOn(state, 'setPlan');
      await drag(hit('corner', 'v1'), [px(0), py(0)], [px(1) + 3, py(0.5) + 2]);
      expect(corner('v1')).toMatchObject({ x: 1, y: 0.5 });
      expect(setPlan).toHaveBeenCalledTimes(1);
      expect(action('undo').disabled).toBe(false);
      expect(live()).toContain('Moved corner 1.');

      action('undo').click();
      await settle();
      expect(corner('v1')).toMatchObject({ x: 0, y: 0 });
      expect(live()).toContain('Undone: moved corner 1.');
      expect(action('redo').disabled).toBe(false);
      action('redo').click();
      await settle();
      expect(corner('v1')).toMatchObject({ x: 1, y: 0.5 });
    });

    it('does not snap while Alt is held, or with Snap off', async () => {
      const svg = el.querySelector('svg.plan')!;
      pointer('pointerdown', hit('corner', 'v1'), px(0), py(0));
      pointer('pointermove', svg, px(0.43), py(0.27), { alt: true });
      pointer('pointerup', svg, px(0.43), py(0.27));
      await settle();
      expect(corner('v1').x).toBeCloseTo(0.43, 2);
      expect(corner('v1').y).toBeCloseTo(0.27, 2);
    });

    it('refuses an invalid position: the shape stays, a reason shows, no undo step', async () => {
      const svg = el.querySelector('svg.plan')!;
      pointer('pointerdown', hit('corner', 'v1'), px(0), py(0));
      pointer('pointermove', svg, px(6), py(2));
      await settle();
      expect(el.querySelector('.chip')!.textContent!.trim().length).toBeGreaterThan(10);
      expect(el.querySelector('.ghost')).not.toBeNull();
      pointer('pointerup', svg, px(6), py(2));
      await settle();
      expect(corner('v1')).toMatchObject({ x: 0, y: 0 });
      expect(action('undo').disabled).toBe(true);
    });

    it('moves a wall across itself, its neighbours following', async () => {
      await drag(hit('wall', 'w6'), [px(5), py(2)], [px(5.5), py(2)]);
      expect(corner('v2').x).toBe(5.5);
      expect(corner('v3').x).toBe(5.5);
      expect(corner('v1').x).toBe(0);
      expect(live()).toContain('Moved wall 2.');
    });

    it('slides a window along its wall and stops at the corner margin', async () => {
      const opening = () => state.plan()!.openings[0];
      const start = opening().offset;
      await drag(hit('opening', 'o9'), [px(2.5), py(0)], [px(2.5) + 65, py(0)]);
      expect(opening().offset).toBeCloseTo(start + 0.5, 2);
      await drag(hit('opening', 'o9'), [px(3), py(0)], [px(30), py(0)]);
      expect(opening().offset + opening().width).toBeCloseTo(5 - 0.05, 2);
    });

    it('pans on empty space and zooms with the wheel', async () => {
      const svg = el.querySelector('svg.plan')!;
      const before = el.querySelector('.fill')!.getAttribute('points');
      pointer('pointerdown', svg, 20, 580);
      pointer('pointermove', svg, 60, 560);
      pointer('pointerup', svg, 60, 560);
      await settle();
      expect(el.querySelector('.fill')!.getAttribute('points')).not.toBe(before);
      expect(action('undo').disabled).toBe(true);

      const afterPan = el.querySelector('.fill')!.getAttribute('points');
      svg.dispatchEvent(
        new WheelEvent('wheel', { deltaY: -200, clientX: 400, clientY: 300, bubbles: true }),
      );
      await settle();
      expect(el.querySelector('.fill')!.getAttribute('points')).not.toBe(afterPan);
    });

    it('pinch-zooms with two touches and cancels a drag when the second finger lands', async () => {
      const svg = el.querySelector('svg.plan')!;
      const before = el.querySelector('.fill')!.getAttribute('points');
      pointer('pointerdown', svg, 300, 300, { id: 1, kind: 'touch' });
      pointer('pointerdown', svg, 500, 300, { id: 2, kind: 'touch' });
      pointer('pointermove', svg, 700, 300, { id: 2, kind: 'touch' });
      await settle();
      expect(el.querySelector('.fill')!.getAttribute('points')).not.toBe(before);
      pointer('pointerup', svg, 700, 300, { id: 2, kind: 'touch' });
      pointer('pointerup', svg, 300, 300, { id: 1, kind: 'touch' });
      await settle();
      expect(action('undo').disabled).toBe(true);
    });

    it('uses a larger drag threshold for touch', async () => {
      const svg = el.querySelector('svg.plan')!;
      pointer('pointerdown', hit('corner', 'v1'), px(0), py(0), { kind: 'touch' });
      pointer('pointermove', svg, px(0) + 6, py(0), { kind: 'touch' });
      pointer('pointerup', svg, px(0) + 6, py(0), { kind: 'touch' });
      await settle();
      expect(corner('v1').x).toBe(0);
    });
  });

  describe('adding and removing', () => {
    it('adds a corner at the wall midpoint when the + is tapped, and selects it', async () => {
      const svg = el.querySelector('svg.plan')!;
      const plus = hit('plus', 'w6');
      pointer('pointerdown', plus, 0, 0);
      pointer('pointerup', svg, 0, 0);
      await settle();
      expect(state.plan()!.vertices.length).toBe(5);
      expect(title()).toBe('Corner 3');
      expect(corner('v10')).toMatchObject({ x: 5, y: 2 });
      expect(live()).toContain('Added corner. 5 corners, 20.00 square metres');
    });

    it('adds a corner on a wall with a window in the free part, never inside the window', async () => {
      const svg = el.querySelector('svg.plan')!;
      pointer('pointerdown', hit('plus', 'w5'), 0, 0);
      pointer('pointerup', svg, 0, 0);
      await settle();
      expect(state.plan()!.vertices.length).toBe(5);
      expect(corner('v10').x).toBeLessThan(1.625);
    });

    it('shows the + on long walls', async () => {
      expect(el.querySelectorAll('.hits [data-kind=plus]').length).toBe(4);
    });
  });

  describe('keyboard', () => {
    it('nudges a corner by 0.1 m and 0.01 m with Shift, one undo step per run', async () => {
      await key(stop('corner', 'v1'), 'ArrowRight');
      await key(stop('corner', 'v1'), 'ArrowRight');
      await key(stop('corner', 'v1'), 'ArrowDown', { shiftKey: true });
      expect(corner('v1')).toMatchObject({ x: 0.2, y: 0.01 });
      action('undo').click();
      await settle();
      expect(corner('v1')).toMatchObject({ x: 0, y: 0 });
      expect(action('undo').disabled).toBe(true);
    });

    it('pushes a wall out with the arrow that points out, pulls with the opposite', async () => {
      await key(stop('wall', 'w6'), 'ArrowRight');
      expect(corner('v2').x).toBeCloseTo(5.1, 3);
      await key(stop('wall', 'w6'), 'ArrowLeft');
      await key(stop('wall', 'w6'), 'ArrowLeft');
      expect(corner('v2').x).toBeCloseTo(4.9, 3);
      const before = state.plan();
      await key(stop('wall', 'w6'), 'ArrowUp');
      expect(state.plan()).toBe(before);
    });

    it('slides an opening with the arrows', async () => {
      const start = state.plan()!.openings[0].offset;
      await key(stop('opening', 'o9'), 'ArrowRight');
      expect(state.plan()!.openings[0].offset).toBeCloseTo(start + 0.1, 3);
    });

    it('deletes a corner and an opening with Delete, but not a wall', async () => {
      await key(stop('wall', 'w5'), 'Delete');
      expect(state.plan()!.walls.length).toBe(4);
      await key(stop('opening', 'o9'), 'Delete');
      expect(state.plan()!.openings.length).toBe(0);
      await key(stop('corner', 'v1'), 'Delete');
      expect(state.plan()!.vertices.length).toBe(3);
      expect(live()).toContain('Deleted corner. 3 corners');
      await key(stop('corner', 'v2'), 'Backspace');
      expect(state.plan()!.vertices.length).toBe(3);
      expect(el.querySelector('.chip')!.textContent).toContain('A room needs at least 3 corners.');
    });

    it('pans, zooms and fits from the plan itself', async () => {
      const svg = el.querySelector('svg.plan')!;
      const points = () => el.querySelector('.fill')!.getAttribute('points');
      const fitted = points();
      await key(svg, 'ArrowLeft');
      expect(points()).not.toBe(fitted);
      await key(svg, '0');
      expect(points()).toBe(fitted);
      await key(svg, '+');
      expect(points()).not.toBe(fitted);
      await key(svg, '-');
      expect(points()).toBe(fitted);
    });

    it('undoes and redoes with Ctrl+Z and Ctrl+Shift+Z', async () => {
      await key(stop('corner', 'v1'), 'ArrowRight');
      await key(el, 'z', { ctrlKey: true });
      expect(corner('v1').x).toBe(0);
      await key(el, 'z', { ctrlKey: true, shiftKey: true });
      expect(corner('v1').x).toBe(0.1);
      await key(el, 'z', { metaKey: true });
      await key(el, 'y', { ctrlKey: true });
      expect(corner('v1').x).toBe(0.1);
    });

    it('Escape deselects first, then closes', async () => {
      stop('wall', 'w6').dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      await settle();
      await key(el, 'Escape');
      expect(title()).toBe('Room shape');
      expect(launcher.close).not.toHaveBeenCalled();
      await key(el, 'Escape');
      expect(launcher.close).toHaveBeenCalledTimes(1);
    });

    it('Done closes the editor', () => {
      action('done').click();
      expect(launcher.close).toHaveBeenCalledTimes(1);
    });
  });

  describe('panel', () => {
    async function select(kind: string, id: string): Promise<void> {
      stop(kind, id).dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      await settle();
    }

    const field = (name: string): HTMLInputElement =>
      el.querySelector<HTMLInputElement>(`app-number-field[data-field=${name}] input`)!;
    const fieldText = (name: string): string =>
      el.querySelector(`app-number-field[data-field=${name}]`)!.textContent!.replace(/\s+/g, ' ');

    async function type(name: string, value: string): Promise<void> {
      const input = field(name);
      input.value = value;
      input.dispatchEvent(new Event('input'));
      input.dispatchEvent(new Event('blur'));
      await settle();
    }

    it('lists walls and corners and selects from the lists', async () => {
      const rows = Array.from(el.querySelectorAll('.list .row-btn')).map((r) =>
        r.textContent!.replace(/\s+/g, ' ').trim(),
      );
      expect(rows[0]).toContain('Wall 1 · 5.00 m');
      expect(rows).toContain('Corner 3 · 5.00, 4.00');
      const wallRow = Array.from(el.querySelectorAll<HTMLButtonElement>('.list .row-btn')).find(
        (r) => r.textContent!.includes('Wall 3'),
      )!;
      wallRow.click();
      await settle();
      expect(title()).toBe('Wall 3 · 5.00 m');
      expect(wallRow.getAttribute('aria-pressed')).toBe('true');
    });

    it('commits a typed wall length, keeping the chosen end', async () => {
      await select('wall', 'w6');
      await type('length', '3');
      expect(corner('v3').y).toBe(3);
      expect(corner('v2').y).toBe(0);
      expect(field('length').value).toBe('3.00');
      expect(live()).toContain('Changed wall length.');
    });

    it('reverts a refused value and shows the reason under the field', async () => {
      await select('corner', 'v1');
      await type('x', '6');
      expect(corner('v1').x).toBe(0);
      expect(field('x').value).toBe('0.00');
      expect(fieldText('x')).toContain("Walls can't cross each other.");
      expect(field('x').getAttribute('aria-invalid')).toBe('true');
      expect(action('undo').disabled).toBe(true);
      await type('x', '0.5');
      expect(corner('v1').x).toBe(0.5);
      expect(fieldText('x')).not.toContain("Walls can't");
    });

    it('refuses an out-of-range typed value with the range', async () => {
      await select('wall', 'w6');
      await type('length', '0.1');
      expect(fieldText('length')).toContain('Use 0.30 m or more');
      expect(live()).toContain('Use 0.30 m or more');
      expect(field('length').value).toBe('4.00');
    });

    it('accepts a comma decimal and does not cap the wall length at the box size', async () => {
      await select('wall', 'w6');
      expect(field('length').type).toBe('text');
      await type('length', '4,5');
      expect(corner('v3').y).toBeCloseTo(4.5, 3);
      await type('length', '4e1');
      expect(fieldText('length')).toContain('Use 0.30 m or more');
    });

    it('moves focus to the form title when Edit details is pressed', async () => {
      action('details').click();
      await settle();
      expect(document.activeElement).toBe(el.querySelector('#plan-form-title'));
      expect(live()).toContain('Details open');
    });

    it('keeps Start over reachable while something is selected', async () => {
      await select('corner', 'v1');
      expect(el.querySelectorAll('[data-action=start-over]').length).toBe(1);
    });

    it('keeps the Start over Undo from touching a reopened editor', async () => {
      action('start-over').click();
      await settle();
      const toasts = TestBed.inject(Toasts);
      expect(toasts.current()).not.toBeNull();
      fixture.destroy();
      TestBed.tick();
      expect(toasts.current()).toBeNull();
    });

    it('moves a wall with Pull in and Push out', async () => {
      await select('wall', 'w6');
      action('push-out').click();
      await settle();
      expect(corner('v2').x).toBeCloseTo(5.1, 3);
      action('pull-in').click();
      await settle();
      expect(corner('v2').x).toBeCloseTo(5, 3);
    });

    it('adds a corner, a door and a window from the wall form', async () => {
      await select('wall', 'w6');
      action('add-corner').click();
      await settle();
      expect(state.plan()!.vertices.length).toBe(5);

      await select('wall', 'w8');
      action('add-door').click();
      await settle();
      expect(title()).toBe('Door on wall 5');
      expect(state.plan()!.openings.filter((o) => o.kind === 'door').length).toBe(1);
      expect(document.activeElement).toBe(field('width'));
    });

    it('edits a window: the last edited of height above floor and gap stays fixed', async () => {
      await select('opening', 'o9');
      expect(title()).toBe('Window on wall 1');
      expect(fieldText('sill')).toContain('Fixed');
      expect(fieldText('gap')).not.toContain('Fixed');
      await type('gap', '0.5');
      const o = state.plan()!.openings[0];
      expect(o.anchor).toBe('ceiling');
      expect(o.sill).toBeCloseTo(2.7 - 0.5 - o.height, 3);
      expect(fieldText('gap')).toContain('Fixed');
      expect(fieldText('sill')).not.toContain('Fixed');
    });

    it('refuses a window that does not fit with the opening wording', async () => {
      await select('opening', 'o9');
      await type('position', '4.9');
      expect(fieldText('position')).toContain("Doesn't fit on this wall.");
    });

    it('refuses a door width outside the limits', async () => {
      await select('wall', 'w8');
      action('add-door').click();
      await settle();
      await type('width', '0.4');
      expect(fieldText('width')).toContain('Use 0.60 to 2.40 m');
      expect(field('width').value).toBe('0.90');
    });

    it('deletes an opening with its button and focuses the plan', async () => {
      await select('opening', 'o9');
      action('delete').click();
      await settle();
      expect(state.plan()!.openings.length).toBe(0);
      expect(document.activeElement).toBe(el.querySelector('svg.plan'));
    });

    it('disables Delete corner at three corners with its hint', async () => {
      await select('corner', 'v1');
      action('delete').click();
      await settle();
      await select('corner', 'v2');
      expect(action('delete').disabled).toBe(true);
      expect(el.textContent).toContain('A room needs at least 3 corners.');
    });

    it('sets the ceiling height from the Room form', async () => {
      expect(fieldText('height')).toContain('Lowest possible: 2.35 m');
      await type('height', '3');
      expect(state.roomHeight()).toBe(3);
      await type('height', '9');
      expect(fieldText('height')).toContain('Use 2.35 to 4.00 m');
      expect(field('height').value).toBe('3.00');
    });

    it('starts over with an undo toast, also undoable from the toolbar', async () => {
      await drag(hit('corner', 'v1'), [px(0), py(0)], [px(1), py(1)]);
      expect(corner('v1').x).toBe(1);
      state.setRoomLength(6);
      await key(el, 'Escape');
      action('start-over').click();
      await settle();
      expect(state.plan()!.vertices.find((v) => v.id === 'v2')!.x).toBe(6);
      expect(live()).toContain('Started over.');
      const toasts = TestBed.inject(Toasts);
      expect(toasts.current()?.text).toBe('Started over.');
      toasts.runAction();
      await settle();
      expect(corner('v1').x).toBe(1);
      expect(corner('v2').x).toBe(5);
    });

    it('drops the Start over toast once another edit is made', async () => {
      action('start-over').click();
      await settle();
      const toasts = TestBed.inject(Toasts);
      expect(toasts.current()).not.toBeNull();
      await key(stop('corner', 'v1'), 'ArrowRight');
      TestBed.tick();
      expect(toasts.current()).toBeNull();
    });

    it('expands the phone panel with its handle and Edit details', async () => {
      const handle = el.querySelector<HTMLButtonElement>('button.handle')!;
      expect(handle.getAttribute('aria-label')).toBe('Shape controls');
      expect(handle.getAttribute('aria-expanded')).toBe('false');
      handle.click();
      await settle();
      expect(handle.getAttribute('aria-expanded')).toBe('true');
      expect(el.classList.contains('panel-expanded')).toBe(true);
      handle.click();
      await settle();
      action('details').click();
      await settle();
      expect(el.classList.contains('panel-expanded')).toBe(true);
    });
  });

  it('commits to the design state, so the 3D room follows', async () => {
    await key(stop('corner', 'v1'), 'ArrowRight', { shiftKey: true });
    expect(state.roomShape().outline[0].x).toBeGreaterThan(-2.5);
  });

  it('tells launcher it closed when destroyed', () => {
    fixture.destroy();
    expect(launcher.closed).toHaveBeenCalled();
  });
});
