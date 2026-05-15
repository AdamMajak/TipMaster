import { Route } from '@angular/router';
import { UserProfileComponent } from './user-profile';

export const USER_ROUTES: Route[] = [
  {
    path: ':id',
    component: UserProfileComponent
  }
];
