import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { IncomingDesign, IncomingShare } from './share/incoming-share';
import { ShareLink } from './share/share-link';
import { ProjectIndex } from './state/project-index';
import { Projects } from './state/projects';
import { DEFAULT_DESIGN } from './state/design-defaults';
import { DesignState } from './state/design-state';
import { Designer } from './designer';
import { SceneCommands } from './scene/scene-commands';
import { ColouringState } from './state/colouring-state';
import { ColourConfirm } from './ui/colour-confirm';
import { Toasts } from './ui/toasts';
import { ViewFrame } from './ui/view-frame';
import { Viewport } from './viewport/viewport';

@Component({ selector: 'app-viewport', template: '' })
class StubViewport {}

@Component({ selector: 'app-stub-editor', template: '<button>editor</button>' })
class StubEditor {}

describe('Designer', () => {
  const status = signal('ready');
  const scene = {
    setPreset: vi.fn(),
    zoom: vi.fn(),
    exportPng: vi.fn(),
    setFrame: vi.fn(),
    status,
  };

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

  const dockButton = (el: HTMLElement, name: string) =>
    Array.from(el.querySelectorAll<HTMLElement>('app-dock .item')).find((b) =>
      b.textContent?.includes(name),
    )!;
  const tray = (el: HTMLElement) => el.querySelector<HTMLElement>('#designer-tray')!;

  it('renders a main landmark, one h1 and the five dock sections', async () => {
    const { el } = await setup();
    expect(el.querySelector('main')).not.toBeNull();
    expect(el.querySelectorAll('h1').length).toBe(1);
    const items = Array.from(el.querySelectorAll('app-dock [role=toolbar] .item'));
    expect(items.map((i) => i.getAttribute('data-section'))).toEqual([
      'room',
      'floor',
      'colour',
      'light',
      'estimate',
    ]);
    expect(el.querySelectorAll('[role=tab]').length).toBe(0);
  });

  it('starts with the tray closed, also on the first visit, and shows the look-around hint', async () => {
    const { el } = await setup();
    expect(tray(el).hidden).toBe(true);
    expect(dockButton(el, 'Floor').getAttribute('aria-expanded')).toBe('false');
    expect(TestBed.inject(Toasts).current()?.text).toContain('Drag to look around');
  });

  it('opens, switches and closes the tray from the dock, moving focus to the heading', async () => {
    const { fixture, el } = await setup();
    dockButton(el, 'Floor').click();
    await fixture.whenStable();
    expect(tray(el).hidden).toBe(false);
    expect(tray(el).querySelector('h2')?.textContent).toContain('Floor');
    expect(dockButton(el, 'Floor').getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(tray(el).querySelector('h2'));

    dockButton(el, 'Light').click();
    await fixture.whenStable();
    expect(tray(el).querySelector('h2')?.textContent).toContain('Light');
    expect(dockButton(el, 'Floor').getAttribute('aria-expanded')).toBe('false');

    const light = dockButton(el, 'Light');
    light.focus();
    light.click();
    await fixture.whenStable();
    expect(tray(el).hidden).toBe(true);
    expect(document.activeElement).toBe(light);
  });

  it('the close button and Escape close the tray and focus its dock button', async () => {
    const { fixture, el } = await setup();
    const floor = dockButton(el, 'Floor');
    floor.click();
    await fixture.whenStable();
    el.querySelector<HTMLElement>('.tray-close')!.click();
    await fixture.whenStable();
    expect(tray(el).hidden).toBe(true);
    expect(document.activeElement).toBe(floor);

    floor.click();
    await fixture.whenStable();
    tray(el).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    await fixture.whenStable();
    expect(tray(el).hidden).toBe(true);
    expect(document.activeElement).toBe(floor);
  });

  it('Escape that another control already used leaves the tray open', async () => {
    const { fixture, el } = await setup();
    dockButton(el, 'Floor').click();
    await fixture.whenStable();
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    event.preventDefault();
    tray(el).dispatchEvent(event);
    await fixture.whenStable();
    expect(tray(el).hidden).toBe(false);
  });

  it('publishes the covered strips as CSS variables on the host', async () => {
    const { fixture, el } = await setup();
    TestBed.inject(ViewFrame).set({ top: 40, right: 0, bottom: 120, left: 0 });
    await fixture.whenStable();
    expect(el.style.getPropertyValue('--frame-bottom')).toBe('120px');
    expect(el.style.getPropertyValue('--frame-top')).toBe('40px');
  });

  it('does not re-frame the scene for a small height change in the same section', async () => {
    const { fixture } = await setup();
    const frame = TestBed.inject(ViewFrame);
    frame.set({ top: 40, right: 0, bottom: 300, left: 0 });
    await fixture.whenStable();
    scene.setFrame.mockClear();
    frame.set({ top: 40, right: 0, bottom: 310, left: 0 });
    await fixture.whenStable();
    expect(scene.setFrame).not.toHaveBeenCalled();
    frame.set({ top: 40, right: 0, bottom: 360, left: 0 });
    await fixture.whenStable();
    expect(scene.setFrame).toHaveBeenCalledTimes(1);
  });

  it('disconnects the frame ResizeObserver when destroyed', async () => {
    const disconnect = vi.fn();
    class FakeObserver {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = disconnect;
    }
    vi.stubGlobal('ResizeObserver', FakeObserver);
    try {
      const { fixture } = await setup();
      expect(disconnect).not.toHaveBeenCalled();
      fixture.destroy();
      expect(disconnect).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('sends the frame insets to the scene', async () => {
    const { fixture } = await setup();
    TestBed.inject(ViewFrame).set({ top: 40, right: 0, bottom: 120, left: 0 });
    await fixture.whenStable();
    expect(scene.setFrame).toHaveBeenLastCalledWith({ top: 40, right: 0, bottom: 120, left: 0 });
  });

  it('shows the loader while the scene loads', async () => {
    status.set('loading');
    const { el } = await setup();
    expect(el.textContent).toContain('Preparing your room...');
  });

  it('shows the fallback card and opens the Estimate section without WebGL', async () => {
    status.set('no-webgl');
    const { el, fixture } = await setup();
    expect(el.textContent).toContain("3D view isn't available");
    expect(tray(el).hidden).toBe(false);
    expect(tray(el).querySelector('h2')?.textContent).toContain('Estimate');
    // Opened by the app: focus does not move.
    await fixture.whenStable();
    expect(document.activeElement).not.toBe(tray(el).querySelector('h2'));
  });

  it('shows the paused overlay when the context is lost', async () => {
    status.set('context-lost');
    const { el } = await setup();
    expect(el.textContent).toContain('Display paused. Restoring...');
  });

  it('keeps the toolbar before the canvas, the tray before the dock and the toasts after both', async () => {
    const { el } = await setup();
    const order = (a: string, b: string) =>
      el.querySelector(a)!.compareDocumentPosition(el.querySelector(b)!) &
      Node.DOCUMENT_POSITION_FOLLOWING;
    expect(order('app-view-toolbar', 'app-viewport')).toBeTruthy();
    expect(order('app-viewport', 'app-tray')).toBeTruthy();
    expect(order('app-tray', 'app-dock')).toBeTruthy();
    expect(order('app-dock', 'app-toast-host')).toBeTruthy();
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
      // The Room section holds Edit shape; the tray state is kept while the editor is open.
      el.querySelector<HTMLElement>('app-dock [data-section=room]')!.click();
      harness.fixture.detectChanges();
      await harness.fixture.whenStable();

      await harness.navigateByUrl('/designer/plan');
      harness.fixture.detectChanges();
      expect(el.querySelector('app-stub-editor')).not.toBeNull();
      expect(el.querySelector('main')!.hasAttribute('inert')).toBe(true);
      expect(el.querySelector('.chrome')!.hasAttribute('inert')).toBe(true);
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

  describe('Colour section', () => {
    it('open Colour selects All walls and turns 3D picking on; closing clears it', async () => {
      const { fixture, el } = await setup();
      const colouring = TestBed.inject(ColouringState);
      expect(colouring.picking()).toBe(false);
      dockButton(el, 'Colour').click();
      await fixture.whenStable();
      expect(colouring.colourOpen()).toBe(true);
      expect(colouring.picking()).toBe(true);
      expect(colouring.selected()).toEqual({ kind: 'walls' });
      dockButton(el, 'Floor').click();
      await fixture.whenStable();
      expect(colouring.picking()).toBe(false);
      expect(colouring.selected()).toBeNull();
    });

    it('Escape closes Colour and clears the selection', async () => {
      const { fixture, el } = await setup();
      const colouring = TestBed.inject(ColouringState);
      dockButton(el, 'Colour').click();
      await fixture.whenStable();
      tray(el).dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      );
      await fixture.whenStable();
      expect(colouring.colourOpen()).toBe(false);
      expect(colouring.selected()).toBeNull();
    });

    it('the toast host is inert only while the confirm dialog is open', async () => {
      const { fixture, el } = await setup();
      const host = el.querySelector('app-toast-host')!;
      expect(host.hasAttribute('inert')).toBe(false);
      TestBed.inject(ColourConfirm).ask({ body: 'b', onConfirm: () => undefined });
      await fixture.whenStable();
      expect(host.hasAttribute('inert')).toBe(true);
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
      expect(el.querySelector('.chrome')!.hasAttribute('inert')).toBe(true);
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

    it('Colour is closed again on the next visit', async () => {
      const first = await setup();
      dockButton(first.el, 'Colour').click();
      await first.fixture.whenStable();
      first.fixture.destroy();
      expect(TestBed.inject(ColouringState).colourOpen()).toBe(false);
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

  describe('projects and sharing', () => {
    const pending = signal<IncomingDesign | null>(null);
    const incoming = {
      pending,
      read: vi.fn(),
      accept: vi.fn(),
      decline: vi.fn(),
    };
    const fallbackUrl = signal<string | null>(null);
    const shareLink = {
      fallbackUrl,
      busy: signal(false),
      share: vi.fn(),
      projectName: () => 'Kitchen',
      closeFallback: vi.fn(() => fallbackUrl.set(null)),
    };

    beforeEach(() => {
      pending.set(null);
      fallbackUrl.set(null);
      incoming.read.mockReset().mockResolvedValue(undefined);
      incoming.accept.mockReset();
      incoming.decline.mockReset();
      TestBed.resetTestingModule();
      localStorage.clear();
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
          { provide: IncomingShare, useValue: incoming },
          { provide: ShareLink, useValue: shareLink },
        ],
      });
      TestBed.overrideComponent(Designer, {
        remove: { imports: [Viewport] },
        add: { imports: [StubViewport] },
      });
    });

    it('opens the Projects dialog from the chip, makes the page inert and closes it again', async () => {
      const { fixture, el } = await setup();
      const chip = el.querySelector<HTMLElement>('[data-trigger="projects"]')!;
      chip.click();
      await fixture.whenStable();
      expect(el.querySelector('app-projects-dialog [role=dialog]')).not.toBeNull();
      expect(el.querySelector('main')!.hasAttribute('inert')).toBe(true);
      expect(el.querySelector('.chrome')!.hasAttribute('inert')).toBe(true);
      expect(el.querySelector('app-toast-host')!.hasAttribute('inert')).toBe(true);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await fixture.whenStable();
      expect(el.querySelector('app-projects-dialog')).toBeNull();
      expect(el.querySelector('main')!.hasAttribute('inert')).toBe(false);
    });

    it('reads a link in the address bar on init', async () => {
      await setup();
      expect(incoming.read).toHaveBeenCalled();
    });

    it('asks before adding a shared design, then accepts or declines', async () => {
      const { fixture, el } = await setup();
      pending.set({ name: 'Kitchen', design: DEFAULT_DESIGN });
      await fixture.whenStable();
      const dialog = el.querySelector('[role=alertdialog]')!;
      expect(dialog.textContent).toContain('Open shared design?');
      expect(dialog.textContent).toContain('“Kitchen”, simple room,');
      expect(el.querySelector('main')!.hasAttribute('inert')).toBe(true);
      const buttons = dialog.querySelectorAll<HTMLElement>('button');
      buttons[1].click();
      expect(incoming.accept).toHaveBeenCalledTimes(1);
      buttons[0].click();
      expect(incoming.decline).toHaveBeenCalledTimes(1);
    });

    it('holds the shared-link prompt back while the plan editor is open', async () => {
      TestBed.inject(DesignState).setMode('custom');
      const harness = await RouterTestingHarness.create('/designer/plan');
      const el = harness.fixture.nativeElement as HTMLElement;
      pending.set({ name: null, design: DEFAULT_DESIGN });
      harness.fixture.detectChanges();
      expect(el.querySelector('app-stub-editor')).not.toBeNull();
      expect(el.querySelector('[role=alertdialog]')).toBeNull();

      await harness.navigateByUrl('/designer');
      harness.fixture.detectChanges();
      await harness.fixture.whenStable();
      expect(el.querySelector('[role=alertdialog]')).not.toBeNull();
    });

    it('shows the share fallback dialog when the clipboard fails', async () => {
      const { fixture, el } = await setup();
      fallbackUrl.set('https://example.test/#s=1.x');
      await fixture.whenStable();
      const dialog = el.querySelector('app-share-fallback-dialog [role=dialog]')!;
      expect(dialog.textContent).toContain('Copy this link to share Kitchen.');
      expect(el.querySelector('main')!.hasAttribute('inert')).toBe(true);
      dialog.querySelector<HTMLElement>('.btn')!.click();
      expect(shareLink.closeFallback).toHaveBeenCalled();
    });

    it('?new=1 creates one project and removes the query', async () => {
      TestBed.inject(DesignState).setAngle(30);
      const harness = await RouterTestingHarness.create('/designer?new=1');
      harness.fixture.detectChanges();
      await harness.fixture.whenStable();
      const names = TestBed.inject(ProjectIndex)
        .projects()
        .map((p) => p.name);
      expect(names.length).toBe(2);
      expect(names[1]).toMatch(/^Project \d+$/);
      expect(TestBed.inject(Toasts).current()?.text).toBe(`Created “${names[1]}”.`);
      expect(TestBed.inject(Router).url).toBe('/designer');
    });

    it('?new=1 reuses an untouched active project', async () => {
      const harness = await RouterTestingHarness.create('/designer?new=1');
      harness.fixture.detectChanges();
      await harness.fixture.whenStable();
      expect(TestBed.inject(ProjectIndex).projects().length).toBe(1);
      expect(TestBed.inject(Router).url).toBe('/designer');
    });

    it('?new=1 at the limit shows an error naming the opened project', async () => {
      TestBed.inject(DesignState).setAngle(30);
      const projects = TestBed.inject(Projects);
      while (!projects.atLimit()) {
        projects.create();
      }
      const active = TestBed.inject(ProjectIndex).activeId();
      const name = TestBed.inject(ProjectIndex)
        .projects()
        .find((p) => p.id === active)!.name;
      TestBed.inject(DesignState).setAngle(31);
      const harness = await RouterTestingHarness.create('/designer?new=1');
      harness.fixture.detectChanges();
      await harness.fixture.whenStable();
      const toast = TestBed.inject(Toasts).current();
      expect(toast?.kind).toBe('error');
      expect(toast?.text).toBe(`Limit reached. Opened “${name}”. Delete a project to add more.`);
    });

    it('holds the shared-link prompt back while the Projects dialog is open', async () => {
      const { fixture, el } = await setup();
      el.querySelector<HTMLElement>('[data-trigger="projects"]')!.click();
      await fixture.whenStable();
      pending.set({ name: 'Kitchen', design: DEFAULT_DESIGN });
      await fixture.whenStable();
      expect(el.querySelector('app-projects-dialog')).not.toBeNull();
      expect(el.querySelector('[role=alertdialog]')).toBeNull();
      el.querySelector<HTMLElement>('app-projects-dialog .close')!.click();
      await fixture.whenStable();
      expect(el.querySelector('[role=alertdialog]')).not.toBeNull();
    });

    it('opens with no query: no project is created', async () => {
      const harness = await RouterTestingHarness.create('/designer');
      harness.fixture.detectChanges();
      expect(TestBed.inject(ProjectIndex).projects().length).toBe(1);
    });
  });
});
