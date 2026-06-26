import { Component, signal, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, CommonModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent {
  private apiService = inject(ApiService);
  private router = inject(Router);

  email = '';
  password = '';

  loading = signal(false);
  errorMessage = signal<string | null>(null);

  onSubmit() {
    if (!this.email || !this.password) {
      this.errorMessage.set('Please enter both email and password.');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);

    this.apiService.login({ email: this.email, password: this.password }).subscribe({
      next: (user) => {
        this.apiService.setCurrentUser(user);
        this.loading.set(false);
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.loading.set(false);
        const errorMsg = err.error?.error || 'Login failed. Please check your credentials and try again.';
        this.errorMessage.set(errorMsg);
      }
    });
  }
}
