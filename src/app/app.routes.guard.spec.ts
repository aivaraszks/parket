import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  provideRouter,
  Router,
  RouterOutlet,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { customModeOnly, routes } from './app.routes';
import { rectangleToPlan } from './designer/plan/plan-edit';
import { STORAGE_KEY } from './designer/state/design-defaults';
import { DesignState } from './designer/state/design-state';

@Component({ template: 'designer <router-outlet />', imports: [RouterOutlet] })
class Host {}

@Component({ selector: 'x-editor', template: 'editor' })
class Editor {}

@Component({ selector: 'x-home', template: 'home' })
class Home {}

describe('customModeOnly guard', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', component: Home },
          {
            path: 'designer',
            component: Host,
            children: [{ path: 'plan', canActivate: [customModeOnly], component: Editor }],
          },
        ]),
      ],
    });
  });
  afterEach(() => localStorage.clear());

  const run = (): Promise<boolean | UrlTree> =>
    TestBed.runInInjectionContext(
      () =>
        customModeOnly({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot) as Promise<
          boolean | UrlTree
        >,
    );

  it('is wired to the real route table as a child of the designer', () => {
    const designer = routes.find((r) => r.path === 'designer')!;
    const plan = designer.children!.find((r) => r.path === 'plan')!;
    expect(plan.canActivate).toContain(customModeOnly);
    expect(plan.loadComponent).toBeTypeOf('function');
    expect(routes.some((r) => r.path === 'plan')).toBe(false);
  });

  it('returns true in custom mode and a /designer UrlTree in simple mode', async () => {
    expect(String(await run())).toBe('/designer');
    TestBed.inject(DesignState).setMode('custom');
    expect(await run()).toBe(true);
  });

  it('decides on the live mode: back to simple closes the route, custom opens it again', async () => {
    const state = TestBed.inject(DesignState);
    state.setMode('custom');
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/designer/plan');
    expect(TestBed.inject(Router).url).toBe('/designer/plan');

    await harness.navigateByUrl('/');
    state.setMode('simple');
    await harness.navigateByUrl('/designer/plan');
    expect(TestBed.inject(Router).url).toBe('/designer');

    await harness.navigateByUrl('/');
    state.setMode('custom');
    await harness.navigateByUrl('/designer/plan');
    expect(TestBed.inject(Router).url).toBe('/designer/plan');
  });

  it('a reload with a stored valid custom plan reopens the editor', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        mode: 'custom',
        plan: rectangleToPlan({ length: 5, width: 4, height: 2.7 }),
      }),
    );
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/designer/plan');
    expect(TestBed.inject(Router).url).toBe('/designer/plan');
  });

  it('a reload with a hostile stored plan lands on the designer, not an error', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ mode: 'custom', plan: { vertices: [{ id: 'v1', x: 'a', y: 0 }] } }),
    );
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/designer/plan');
    expect(TestBed.inject(Router).url).toBe('/designer');
  });

  it('keeps the designer itself reachable in either mode', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/designer');
    expect(TestBed.inject(Router).url).toBe('/designer');
    TestBed.inject(DesignState).setMode('custom');
    await harness.navigateByUrl('/designer');
    expect(TestBed.inject(Router).url).toBe('/designer');
  });

  it('does not loop when it redirects (landing stays reachable)', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/designer/plan');
    await harness.navigateByUrl('/');
    expect(TestBed.inject(Router).url).toBe('/');
  });
});
