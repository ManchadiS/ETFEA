import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { ApiService } from '../services/api.service';

/**
 * Route guard that strictly allows ONLY user sagarmanchadi324@gmail.com
 * to access the GST Filing (GSTR-3B) module.
 */
export const gstAuthGuard: CanActivateFn = (route, state) => {
  const apiService = inject(ApiService);
  const router = inject(Router);
  const currentUser = apiService.currentUser();

  if (currentUser && currentUser.email === 'sagarmanchadi324@gmail.com') {
    return true;
  }

  console.warn('Access Denied: GST Filing is strictly restricted to sagarmanchadi324@gmail.com');
  router.navigate(['/dashboard']);
  return false;
};
