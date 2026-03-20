import { Routes } from '@angular/router';
import { Football } from './football/football';
import { FootballMatch } from './football/match/football-match';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./home/home').then(m => m.Home) },
  { path: 'tennis', loadComponent: () => import('./tennis/tennis').then(m => m.Tennis) },
  { path: 'football/match/:eventId', component: FootballMatch },
  { path: 'football', component: Football },
  { path: 'hockey', loadComponent: () => import('./hockey/hockey').then(m => m.Hockey) },
  { path: '**', redirectTo: '' },
];
