import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { DesignState } from './state/design-state';
import { Designer } from './designer';
import { SceneCommands } from './scene/scene-commands';
import { ColouringState } from './state/colouring-state';
import { ColourAnnouncer } from './ui/colour-announcer';
import { ColourConfirm } from './ui/colour-confirm';
import { Toasts } from './ui/toasts';
import { Viewport } from './viewport/viewport';

@Component({ selector: 'app-viewport', template: '' })
class StubViewport {}

@Component({ selector: 'app-stub-editor', template: '<button>editor</button>' })
class StubEditor {}

describe('Designer', () => {
  const status = signal('ready');
  const scene = { setPreset: vi.fn(), zoom: vi.fn(), exportPng: vi.fn(), status };

  beforeEach(() => {
    localStorage.clear();
    status.set('ready');
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: SceneCommands, useValue: scene }],
    });
    TestBed.overrideComponent(Designer, {
      remove: { imports: [Viewport] },
      add: { imports: [StubViewport] },
    });
  });

  async function setup() {
    const fixture = TestBed.createComponent(Designer);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('renders a main landmark, one h1 and the five tabs', async () => {
    const { el } = await setup();
    expect(el.querySelector('main')).not.toBeNull();
    expect(el.querySelectorAll('h1').length).toBe(1);
    expect(Array.from(el.querySelectorAll('[role=tab]')).map((t) => t.textContent?.trim())).toEqual(
      ['Room', 'Surfaces', 'Floor', 'Light', 'Estimate'],
    );
  });

  it('opens the sheet at Half on the Floor tab on the first visit only', async () => {
    const first = await setup();
    expect(first.el.className).toContain('stop-half');
    expect(first.el.querySelector('[role=tab][aria-selected=true]')?.textContent).toContain(
      'Floor',
    );

    const again = await setup();
    expect(again.el.className).toContain('stop-peek');
  });

  it('shows the loader while the scene loads', async () => {
    status.set('loading');
    const { el } = await setup();
    expect(el.textContent).toContain('Preparing your room...');
  });

  it('shows the fallback card and opens the Estimate tab without WebGL', async () => {
    status.set('no-webgl');
    const { el } = await setup();
    expect(el.textContent).toContain("3D view isn't available");
    expect(el.querySelector('[role=tab][aria-selected=true]')?.textContent).toContain('Estimate');
  });

  it('shows the paused overlay when the context is lost', async () => {
    status.set('context-lost');
    const { el } = await setup();
    expect(el.textContent).toContain('Display paused. Restoring...');
  });

  it('keeps the toolbar before the canvas and the toasts after the sheet in DOM order', async () => {
    const { el } = await setup();
    const order = (a: string, b: string) =>
      el.querySelector(a)!.compareDocumentPosition(el.querySelector(b)!) &
      Node.DOCUMENT_POSITION_FOLLOWING;
    expect(order('app-view-toolbar', 'app-viewport')).toBeTruthy();
    expect(order('app-controls-sheet', 'app-toast-host')).toBeTruthy();
  });

  describe('shape editor route', () => {
    beforeEach(() => {
      TestBed.resetTestingModule();
      localStorage.setItem('parket.visited.v1', '1');
      TestBed.configureTestingModule({
        providers: [
          provideRouter([
            {
              path: 'designer',
              component: Designer,
              children: [{ path: 'plan', component: StubEditor }],
            },
          ]),
          { provide: SceneCommands, useValue: scene },
        ],
      });
      TestBed.overrideComponent(Designer, {
        remove: { imports: [Viewport] },
        add: { imports: [StubViewport] },
      });
    });

    it('makes the designer inert while the editor is open and focuses Edit shape afterwards', async () => {
      TestBed.inject(DesignState).setMode('custom');
      const harness = await RouterTestingHarness.create('/designer');
      const el = harness.fixture.nativeElement as HTMLElement;
      harness.fixture.detectChanges();
      expect(el.querySelector('main')!.hasAttribute('inert')).toBe(false);

      await harness.navigateByUrl('/designer/plan');
      harness.fixture.detectChanges();
      expect(el.querySelector('app-stub-editor')).not.toBeNull();
      expect(el.querySelector('main')!.hasAttribute('inert')).toBe(true);
      expect(el.querySelector('app-controls-sheet')!.hasAttribute('inert')).toBe(true);
      expect(el.querySelector('app-toast-host')!.hasAttribute('inert')).toBe(false);

      await harness.navigateByUrl('/designer');
      harness.fixture.detectChanges();
      await harness.fixture.whenStable();
      expect(el.querySelector('main')!.hasAttribute('inert')).toBe(false);
      expect(document.activeElement).toBe(el.querySelector('[data-edit-shape]'));
    });

    it('announces the editor while its chunk loads', async () => {
      const harness = await RouterTestingHarness.create('/designer');
      const region = (harness.fixture.nativeElement as HTMLElement).querySelector(
        'app-editor-loader [role=status]',
      );
      expect(region).not.toBeNull();
    });
  });

  describe('Colour mode', () => {
    const selectedTab = (el: HTMLElement) =>
      el.querySelector('[role=tab][aria-selected=true]')?.textContent?.trim();

    it('opens the Surfaces tab at Half when Colour mode is turned on', async () => {
      (await setup()).fixture.destroy(); // the first visit opens Half by itself
      const { fixture, el } = await setup();
      const colouring = TestBed.inject(ColouringState);
      expect(el.className).toContain('stop-peek');
      colouring.setActive(true);
      await fixture.whenStable();
      expect(selectedTab(el)).toBe('Surfaces');
      expect(el.className).toContain('stop-half');
      expect(el.textContent).toContain('Tap a wall, door, skirting or the ceiling.');
    });

    it('a tap selection opens Surfaces at Half and is announced', async () => {
      const { fixture, el } = await setup();
      const colouring = TestBed.inject(ColouringState);
      colouring.select({ kind: 'wall', id: 's2' }, 'tap');
      await fixture.whenStable();
      expect(selectedTab(el)).toBe('Surfaces');
      expect(el.className).toContain('stop-half');
      expect(TestBed.inject(ColourAnnouncer).message()).toBe('Wall 3 selected.');
      expect(el.querySelector('[role=status][aria-live=polite]')?.textContent).toContain(
        'Wall 3 selected.',
      );
      expect(el.querySelector('input:checked')?.closest('label')?.textContent).toContain('Wall 3');
    });

    it('leaving the Surfaces tab clears the selection', async () => {
      const { fixture, el } = await setup();
      const colouring = TestBed.inject(ColouringState);
      colouring.select({ kind: 'ceiling' }, 'tap');
      await fixture.whenStable();
      expect(colouring.selected()).toEqual({ kind: 'ceiling' });
      Array.from(el.querySelectorAll<HTMLElement>('[role=tab]'))
        .find((t) => t.textContent?.includes('Floor'))!
        .click();
      await fixture.whenStable();
      expect(colouring.selected()).toBeNull();
    });

    it('switching from Surfaces to Room clears the selection', async () => {
      const { fixture, el } = await setup();
      const colouring = TestBed.inject(ColouringState);
      const tab = (name: string) =>
        Array.from(el.querySelectorAll<HTMLElement>('[role=tab]')).find((t) =>
          t.textContent?.includes(name),
        )!;
      tab('Surfaces').click();
      await fixture.whenStable();
      expect(selectedTab(el)).toBe('Surfaces');
      expect(colouring.selected()).toEqual({ kind: 'walls' });
      tab('Room').click();
      await fixture.whenStable();
      expect(selectedTab(el)).toBe('Room');
      expect(colouring.selected()).toBeNull();
    });

    it('turns 3D picking on while the Surfaces tab is open, even with Colour mode off', async () => {
      const { fixture, el } = await setup();
      const colouring = TestBed.inject(ColouringState);
      const tab = (name: string) =>
        Array.from(el.querySelectorAll<HTMLElement>('[role=tab]')).find((t) =>
          t.textContent?.includes(name),
        )!;
      tab('Surfaces').click();
      await fixture.whenStable();
      expect(colouring.active()).toBe(false);
      expect(colouring.picking()).toBe(true);
      colouring.select({ kind: 'door', id: 'o1' }, 'tap');
      await fixture.whenStable();
      expect(colouring.selected()).toEqual({ kind: 'door', id: 'o1' });
      tab('Floor').click();
      await fixture.whenStable();
      expect(colouring.picking()).toBe(false);
    });

    it('the toast host is inert only while the confirm dialog is open', async () => {
      const { fixture, el } = await setup();
      const host = el.querySelector('app-toast-host')!;
      expect(host.hasAttribute('inert')).toBe(false);
      TestBed.inject(ColourConfirm).ask({ body: 'b', onConfirm: () => undefined });
      await fixture.whenStable();
      expect(host.hasAttribute('inert')).toBe(true);
    });

    it('Escape in the stage turns Colour mode off', async () => {
      const { fixture, el } = await setup();
      const colouring = TestBed.inject(ColouringState);
      colouring.setActive(true);
      await fixture.whenStable();
      el.querySelector('main')!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      );
      await fixture.whenStable();
      expect(colouring.active()).toBe(false);
      expect(TestBed.inject(ColourAnnouncer).message()).toBe('Colour mode off.');
    });

    it('Escape that another control already used does not turn the mode off', async () => {
      const { fixture, el } = await setup();
      const colouring = TestBed.inject(ColouringState);
      colouring.setActive(true);
      await fixture.whenStable();
      const event = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      event.preventDefault();
      el.querySelector('main')!.dispatchEvent(event);
      expect(colouring.active()).toBe(true);
    });

    it('shows the confirm alertdialog and makes the page inert until it is answered', async () => {
      const { fixture, el } = await setup();
      const confirm = TestBed.inject(ColourConfirm);
      const onConfirm = vi.fn();
      confirm.ask({ body: 'Wall 2 has its own colour.', onConfirm });
      await fixture.whenStable();
      const dialog = el.querySelector('[role=alertdialog]')!;
      expect(dialog.getAttribute('aria-modal')).toBe('true');
      expect(dialog.querySelector('h2')?.textContent).toBe('Change all walls?');
      expect(dialog.textContent).toContain('Wall 2 has its own colour.');
      expect(el.querySelector('main')!.hasAttribute('inert')).toBe(true);
      expect(el.querySelector('app-controls-sheet')!.hasAttribute('inert')).toBe(true);
      expect(document.activeElement?.textContent).toContain('Cancel');

      dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await fixture.whenStable();
      expect(el.querySelector('[role=alertdialog]')).toBeNull();
      expect(onConfirm).not.toHaveBeenCalled();
      expect(el.querySelector('main')!.hasAttribute('inert')).toBe(false);
    });

    it('Change all walls confirms', async () => {
      const { fixture, el } = await setup();
      const onConfirm = vi.fn();
      TestBed.inject(ColourConfirm).ask({ body: 'x', onConfirm });
      await fixture.whenStable();
      const buttons = el.querySelectorAll<HTMLElement>('[role=alertdialog] button');
      expect(buttons[1].textContent?.trim()).toBe('Change all walls');
      buttons[1].click();
      await fixture.whenStable();
      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(el.querySelector('[role=alertdialog]')).toBeNull();
    });

    it('Colour mode is off again on the next visit', async () => {
      const first = await setup();
      const colouring = TestBed.inject(ColouringState);
      colouring.setActive(true);
      first.fixture.destroy();
      expect(colouring.active()).toBe(false);
    });
  });

  describe('first-visit hint wording', () => {
    const original = globalThis.matchMedia;
    afterEach(() => (globalThis.matchMedia = original));

    const withPointer = (coarse: boolean) =>
      (globalThis.matchMedia = vi.fn(
        (query: string) => ({ matches: coarse && query === '(pointer: coarse)' }) as MediaQueryList,
      ));

    it('mentions pinching on touch devices', async () => {
      withPointer(true);
      await setup();
      expect(TestBed.inject(Toasts).current()?.text).toContain('Pinch to zoom');
    });

    it('mentions scrolling with a mouse', async () => {
      withPointer(false);
      await setup();
      expect(TestBed.inject(Toasts).current()?.text).toContain('Scroll to zoom');
    });
  });
});
