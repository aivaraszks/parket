import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, RouterOutlet } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { customModeOnly, loadPlanEditor } from './app.routes';
import { PlanEditorLoadError } from './designer/ui/plan-editor-load-error';
import { DesignState } from './designer/state/design-state';

@Component({ template: '<router-outlet />', imports: [RouterOutlet] })
class Host {}

@Component({ template: 'editor' })
class Editor {}

describe('plan editor route', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'designer',
            component: Host,
            children: [{ path: 'plan', canActivate: [customModeOnly], component: Editor }],
          },
        ]),
      ],
    });
  });

  it('redirects to the designer silently while in simple mode', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/designer/plan');
    expect(TestBed.inject(Router).url).toBe('/designer');
  });

  it('opens in custom mode (a reload reopens the editor)', async () => {
    TestBed.inject(DesignState).setMode('custom');
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/designer/plan');
    expect(TestBed.inject(Router).url).toBe('/designer/plan');
  });

  it('shows a retry card when the editor chunk fails to load', async () => {
    const failing = () => Promise.reject(new Error('offline'));
    expect(await loadPlanEditor(failing)).toBe(PlanEditorLoadError);
    const ok = await loadPlanEditor(() => Promise.resolve({ PlanEditor: Editor }));
    expect(ok).toBe(Editor);
  });
});
