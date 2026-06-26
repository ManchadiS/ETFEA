import { Component, signal, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [FormsModule, CommonModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrl: './register.component.css'
})
export class RegisterComponent {
  private apiService = inject(ApiService);
  private router = inject(Router);

  firstName = '';
  lastName = '';
  email = '';
  password = '';
  dob = '';
  age: number | null = null;

  loading = signal(false);
  errorMessage = signal<string | null>(null);

  onDobChange() {
    if (!this.dob) {
      this.age = null;
      return;
    }
    const birthDate = new Date(this.dob);
    const today = new Date();
    let calculatedAge = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      calculatedAge--;
    }
    
    this.age = calculatedAge >= 0 ? calculatedAge : 0;
  }

  onSubmit() {
    if (!this.firstName || !this.lastName || !this.email || !this.password || !this.dob || this.age == null) {
      this.errorMessage.set('Please fill out all required fields.');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);

    const newUser = {
      firstName: this.firstName,
      lastName: this.lastName,
      email: this.email,
      password: this.password,
      dob: this.dob,
      age: this.age
    };

    this.apiService.register(newUser).subscribe({
      next: (user) => {
        // Automatically log user in upon registration success
        this.apiService.setCurrentUser(user);
        this.loading.set(false);
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.loading.set(false);
        const errorMsg = err.error?.error || 'Registration failed. Please check your data and try again.';
        this.errorMessage.set(errorMsg);
      }
    });
  }
}
