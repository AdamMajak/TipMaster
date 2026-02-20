import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./home/home').then(m => m.Home) },
  { path: 'tennis', loadComponent: () => import('./tennis/tennis').then(m => m.Tennis) },
  { path: 'football', loadComponent: () => import('./football/football').then(m => m.Football) },
  { path: 'hockey', loadComponent: () => import('./hockey/hockey').then(m => m.Hockey) },
  { path: '**', redirectTo: '' },
];
