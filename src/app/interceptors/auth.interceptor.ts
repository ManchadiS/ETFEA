import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { ApiService } from '../services/api.service';
import { Router } from '@angular/router';
import { catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const apiService = inject(ApiService);
  const router = inject(Router);
  const user = apiService.currentUser();
  const token = user?.token;

  let authReq = req;
  if (token) {
    authReq = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
  }

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401) {
        // Clear session and redirect to login
        apiService.setCurrentUser(null);
        router.navigate(['/login']);
      }
      return throwError(() => error);
    })
  );
};
