import { Component, OnInit, signal } from '@angular/core';
import { ApiService, User } from '../../services/api.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './users.component.html',
  styleUrl: './users.component.css'
})
export class UsersComponent implements OnInit {
  users = signal<User[]>([]);
  loading = signal(false);
  errorMessage = signal<string | null>(null);

  // Modal display states
  showAddModal = false;
  showEditModal = false;
  showDeleteModal = false;

  // Selected/active objects
  selectedUser: User | null = null;

  // Form inputs
  firstName = '';
  lastName = '';
  email = '';
  password = '';
  dob = '';
  age: number | null = null;

  constructor(private apiService: ApiService) {}

  ngOnInit() {
    this.fetchUsers();
  }

  fetchUsers() {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.apiService.getUsers().subscribe({
      next: (list) => {
        this.users.set(list);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error fetching users:', err);
        this.errorMessage.set('Failed to load user list.');
        this.loading.set(false);
      }
    });
  }

  calculateAgeFromDob() {
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

  openAddModal() {
    this.firstName = '';
    this.lastName = '';
    this.email = '';
    this.password = '';
    this.dob = '';
    this.age = null;
    this.showAddModal = true;
  }

  closeAddModal() {
    this.showAddModal = false;
  }

  handleAddUser() {
    if (!this.firstName || !this.lastName || !this.email || !this.password || !this.dob || this.age == null) {
      alert('Please fill out all fields.');
      return;
    }

    const payload: User = {
      firstName: this.firstName,
      lastName: this.lastName,
      email: this.email,
      password: this.password,
      dob: this.dob,
      age: this.age
    };

    this.apiService.createUser(payload).subscribe({
      next: () => {
        this.fetchUsers();
        this.closeAddModal();
      },
      error: (err) => {
        alert(err.error?.error || 'Failed to create user.');
      }
    });
  }

  openEditModal(user: User) {
    this.selectedUser = user;
    this.firstName = user.firstName;
    this.lastName = user.lastName;
    this.email = user.email;
    this.password = ''; // Don't pre-fill password, leave empty unless changing
    this.dob = user.dob;
    this.age = user.age;
    this.showEditModal = true;
  }

  closeEditModal() {
    this.showEditModal = false;
    this.selectedUser = null;
  }

  handleEditUser() {
    if (!this.selectedUser || !this.selectedUser.id) return;
    if (!this.firstName || !this.lastName || !this.email || !this.dob || this.age == null) {
      alert('Please fill out all required fields.');
      return;
    }

    const payload: Partial<User> = {
      firstName: this.firstName,
      lastName: this.lastName,
      email: this.email,
      dob: this.dob,
      age: this.age
    };

    if (this.password) {
      payload.password = this.password;
    }

    this.apiService.updateUser(this.selectedUser.id, payload).subscribe({
      next: () => {
        this.fetchUsers();
        this.closeEditModal();
      },
      error: (err) => {
        alert(err.error?.error || 'Failed to update user.');
      }
    });
  }

  openDeleteModal(user: User) {
    this.selectedUser = user;
    this.showDeleteModal = true;
  }

  closeDeleteModal() {
    this.showDeleteModal = false;
    this.selectedUser = null;
  }

  handleDeleteUser() {
    if (!this.selectedUser || !this.selectedUser.id) return;

    this.apiService.deleteUser(this.selectedUser.id).subscribe({
      next: () => {
        this.fetchUsers();
        this.closeDeleteModal();
      },
      error: (err) => {
        alert('Failed to delete user.');
        this.closeDeleteModal();
      }
    });
  }
}
