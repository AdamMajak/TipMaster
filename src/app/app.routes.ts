import { Routes } from '@angular/router';
import { Football } from './football/football';
import { FootballMatch } from './football/match/football-match';
import { Hockey } from './hockey/hockey';
import { HockeyMatch } from './hockey/match/hockey-match';

import { UserProfileComponent } from './user/user-profile';
export const routes: Routes = [
  { path: '', loadComponent: () => import('./home/home').then(m => m.Home) },
  { path: 'analysis', loadComponent: () => import('./analysis/analysis').then(m => m.Analyses) },
  { path: 'football/match/:eventId', component: FootballMatch },
  { path: 'football', component: Football },
  { path: 'hockey/match/:eventId', component: HockeyMatch },
  { path: 'hockey', component: Hockey },
  { path: 'admin/users', loadComponent: () => import('./admin/admin-users.component').then(m => m.AdminUsersComponent) },
  { path: 'user/:id', component: UserProfileComponent },
  { path: '**', redirectTo: '' },
];
