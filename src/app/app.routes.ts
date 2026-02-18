import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./home/home').then(m => m.Home) },
  { path: 'football', loadComponent: () => import('./football/football').then(m => m.Football) },
  { path: 'hockey', loadComponent: () => import('./hockey/hockey').then(m => m.Hockey) },
  { path: 'mma', loadComponent: () => import('./mma/mma').then(m => m.Mma) },
  { path: 'basketball', loadComponent: () => import('./basketball/basketball').then(m => m.Basketball) },
  { path: 'baseball', loadComponent: () => import('./baseball/baseball').then(m => m.Baseball) },
  { path: '**', redirectTo: '' },
];
