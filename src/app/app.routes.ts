import { EnvironmentInjector, inject, Type } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { PlanEditorLoadError } from './designer/ui/plan-editor-load-error';
import { DesignerLoadError } from './load-error/designer-load-error';

/** Loads the designer chunk; when that fails (offline), shows a small page with a retry instead. */
export function loadDesigner(
  importer: () => Promise<{ Designer: Type<unknown> }> = () => import('./designer/designer'),
): Promise<Type<unknown>> {
  return importer().then(
    (m) => m.Designer,
    () => DesignerLoadError,
  );
}

/** Loads the shape editor chunk; on failure shows a retry card over the designer. */
export function loadPlanEditor(
  importer: () => Promise<{ PlanEditor: Type<unknown> }> = () =>
    import('./designer/plan-editor/plan-editor'),
): Promise<Type<unknown>> {
  return importer().then(
    (m) => m.PlanEditor,
    () => PlanEditorLoadError,
  );
}

/** The editor only exists for the custom shape: simple mode goes back to the designer silently. */
export const customModeOnly: CanActivateFn = () => {
  const injector = inject(EnvironmentInjector);
  const router = inject(Router);
  // The state module is loaded on demand so it stays out of the landing page bundle.
  return import('./designer/state/design-state').then(
    (m) => injector.get(m.DesignState).mode() === 'custom' || router.parseUrl('/designer'),
  );
};

/**
 * A shared link opens the site root (`#s=...`): send it to the designer, keeping the fragment.
 * No designer imports here, so the landing bundle stays small.
 */
export const shareLinkRedirect: CanActivateFn = (route) => {
  const fragment = route.fragment;
  return fragment?.startsWith('s=')
    ? inject(Router).createUrlTree(['/designer'], { fragment })
    : true;
};

export const routes: Routes = [
  {
    path: '',
    canActivate: [shareLinkRedirect],
    loadComponent: () => import('./landing/landing').then((m) => m.Landing),
  },
  {
    path: 'designer',
    loadComponent: () => loadDesigner(),
    children: [
      { path: 'plan', canActivate: [customModeOnly], loadComponent: () => loadPlanEditor() },
    ],
  },
  // unknown paths (e.g. when served from a sub-path like a preview host) show the landing page
  { path: '**', redirectTo: '' },
];
