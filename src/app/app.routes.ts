import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./landing/landing').then((m) => m.Landing),
  },
  // unknown paths (e.g. when served from a sub-path like a preview host) show the landing page
  { path: '**', redirectTo: '' },
];
