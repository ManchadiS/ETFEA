import { Component, signal, inject, OnInit, OnDestroy } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { ApiService, EmailStatus, Restaurant } from './services/api.service';
import { CommonModule } from '@angular/common';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit, OnDestroy {
  private apiService = inject(ApiService);
  private router = inject(Router);
  
  protected readonly title = signal('Engineering Tadka');
  
  // Status states
  apiConnected = signal<boolean>(false);
  dbMode = signal<string>('Checking...');
  emailUser = signal<string>('N/A');
  checkIntervalId: any;

  // Authentication state
  currentUser = this.apiService.currentUser;
  isAuthPage = signal<boolean>(false);

  // Global restaurant selector state
  restaurants = signal<Restaurant[]>([]);
  selectedRestaurantId = this.apiService.selectedRestaurantId;

  ngOnInit() {
    const initialUrl = window.location.pathname;
    this.isAuthPage.set(initialUrl.includes('/login') || initialUrl.includes('/register'));

    this.checkAuth();
    this.checkStatus();
    this.fetchRestaurants();

    // Enforce auth checks whenever route changes
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      const url = event.urlAfterRedirects || event.url;
      this.isAuthPage.set(url.includes('/login') || url.includes('/register'));
      this.checkAuth(url);
    });

    // Periodically check connection status every 15 seconds
    this.checkIntervalId = setInterval(() => {
      this.checkStatus();
      this.fetchRestaurants();
    }, 15000);
  }

  checkAuth(currentUrl?: string) {
    const url = currentUrl || this.router.url;
    const isAuthPage = url.includes('/login') || url.includes('/register');
    if (!this.currentUser() && !isAuthPage) {
      this.router.navigate(['/login']);
    } else if (this.currentUser() && isAuthPage) {
      this.router.navigate(['/dashboard']);
    }
  }

  logout() {
    this.apiService.setCurrentUser(null);
    this.router.navigate(['/login']);
  }

  ngOnDestroy() {
    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId);
    }
  }

  fetchRestaurants() {
    this.apiService.getRestaurants().subscribe({
      next: (list) => {
        this.restaurants.set(list);
      },
      error: (err) => {
        console.error('Error fetching restaurants in app shell:', err);
      }
    });
  }

  onRestaurantChange(id: string) {
    this.apiService.selectedRestaurantId.set(id);
  }

  checkStatus() {
    this.apiService.getEmailStatus().subscribe({
      next: (status: EmailStatus) => {
        this.apiConnected.set(true);
        // Backend store.js sets useDb based on env, let's check it.
        // Wait, how do we know if db is mongoose vs memory? 
        // We can infer from emailStatus configured or we can check if it returns configured
        // In Express backend, it has a debug endpoint or we can check emailStatus configured.
        // Wait, store.js connects to db if useDb is true. 
        // Let's see if we can check if MongoDB is configured. 
        // The API returns email status configured, but let's check what it has.
        if (status.useDb) {
          this.dbMode.set(status.dbConnected ? 'MongoDB' : 'MongoDB (Offline)');
        } else {
          this.dbMode.set('In-Memory');
        }
        this.emailUser.set(status.emailUser || 'Console Mock');
      },
      error: (err) => {
        this.apiConnected.set(false);
        this.dbMode.set('Offline');
        this.emailUser.set('Disconnected');
        console.error('API connection check failed:', err);
      }
    });
  }
}
