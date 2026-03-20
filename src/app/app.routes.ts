import { Routes } from '@angular/router';
import { Football } from './football/football';
import { FootballMatch } from './football/match/football-match';
import { Hockey } from './hockey/hockey';
import { HockeyMatch } from './hockey/match/hockey-match';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./home/home').then(m => m.Home) },
  { path: 'tennis', loadComponent: () => import('./tennis/tennis').then(m => m.Tennis) },
  { path: 'football/match/:eventId', component: FootballMatch },
  { path: 'football', component: Football },
  { path: 'hockey/match/:eventId', component: HockeyMatch },
  { path: 'hockey', component: Hockey },
  { path: '**', redirectTo: '' },
];
