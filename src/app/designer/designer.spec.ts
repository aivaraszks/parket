import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { DesignState } from './state/design-state';
import { Designer } from './designer';
import { SceneCommands } from './scene/scene-commands';
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
