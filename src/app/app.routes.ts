import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./components/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'register',
    loadComponent: () => import('./components/register/register.component').then(m => m.RegisterComponent)
  },
  {
    path: 'users',
    loadComponent: () => import('./components/users/users.component').then(m => m.UsersComponent)
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./components/dashboard/dashboard.component').then(m => m.DashboardComponent)
  },
  {
    path: 'restaurants',
    loadComponent: () => import('./components/restaurants/restaurants.component').then(m => m.RestaurantsComponent)
  },
  {
    path: 'menu',
    loadComponent: () => import('./components/menu/menu.component').then(m => m.MenuComponent)
  },
  {
    path: 'expenses',
    loadComponent: () => import('./components/expenses/expenses.component').then(m => m.ExpensesComponent)
  },
  {
    path: 'billing',
    loadComponent: () => import('./components/billing/billing.component').then(m => m.BillingComponent)
  },
  {
    path: 'system-status',
    loadComponent: () => import('./components/system-status/system-status.component').then(m => m.SystemStatusComponent)
  },
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full'
  },
  {
    path: '**',
    redirectTo: 'dashboard'
  }
];
