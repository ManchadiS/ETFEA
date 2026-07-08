import { Component, OnInit, signal } from '@angular/core';
import { ApiService, User, Role } from '../../services/api.service';
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

  // Role Configuration states
  roles = signal<Role[]>([]);
  activeTab = signal<'users' | 'roles'>('users');
  selectedRoleName = 'Admin';

  roleName = '';
  selectedSidebarAccess: string[] = [];
  roleDeleteAccess = false;
  showRoleAddModal = false;
  showRoleEditModal = false;
  selectedRole: Role | null = null;
  availableSidebarTabs = ['dashboard', 'restaurants', 'menu', 'orders', 'expenses', 'inventory', 'billing', 'users', 'customers', 'system-status'];

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
    this.fetchRoles();
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
    this.selectedRoleName = 'Admin';
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
      age: this.age,
      role: this.selectedRoleName
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
    this.selectedRoleName = user.role || 'Admin';
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
      age: this.age,
      role: this.selectedRoleName
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

  isSuperAdmin(): boolean {
    const user = this.apiService.currentUser();
    return user?.email === 'sagarmanchadi324@gmail.com' || user?.role === 'Super Admin';
  }

  hasDeleteAccess(): boolean {
    const user = this.apiService.currentUser();
    if (!user) return false;
    if (user.email === 'sagarmanchadi324@gmail.com' || user.role === 'Super Admin') {
      return true;
    }
    return user.rights?.deleteAccess || false;
  }

  fetchRoles() {
    this.apiService.getRoles().subscribe({
      next: (list) => {
        this.roles.set(list);
      },
      error: (err) => {
        console.error('Error fetching roles:', err);
      }
    });
  }

  openRoleAddModal() {
    this.roleName = '';
    this.selectedSidebarAccess = [];
    this.roleDeleteAccess = false;
    this.showRoleAddModal = true;
  }

  closeRoleAddModal() {
    this.showRoleAddModal = false;
  }

  handleCreateRole() {
    if (!this.roleName) {
      alert('Role name is required.');
      return;
    }
    const payload: Role = {
      name: this.roleName,
      sidebarAccess: this.selectedSidebarAccess,
      deleteAccess: this.roleDeleteAccess
    };
    this.apiService.createRole(payload).subscribe({
      next: () => {
        this.fetchRoles();
        this.closeRoleAddModal();
      },
      error: (err) => {
        alert(err.error?.error || 'Failed to create role.');
      }
    });
  }

  openRoleEditModal(role: Role) {
    this.selectedRole = role;
    this.roleName = role.name;
    this.selectedSidebarAccess = [...role.sidebarAccess];
    this.roleDeleteAccess = role.deleteAccess;
    this.showRoleEditModal = true;
  }

  closeRoleEditModal() {
    this.showRoleEditModal = false;
    this.selectedRole = null;
  }

  handleUpdateRole() {
    if (!this.selectedRole || !this.selectedRole.id) return;
    if (!this.roleName) {
      alert('Role name is required.');
      return;
    }
    const payload: Partial<Role> = {
      name: this.roleName,
      sidebarAccess: this.selectedSidebarAccess,
      deleteAccess: this.roleDeleteAccess
    };
    this.apiService.updateRole(this.selectedRole.id, payload).subscribe({
      next: () => {
        this.fetchRoles();
        this.closeRoleEditModal();
      },
      error: (err) => {
        alert(err.error?.error || 'Failed to update role.');
      }
    });
  }

  handleDeleteRole(id: string) {
    if (confirm('Are you sure you want to delete this role?')) {
      this.apiService.deleteRole(id).subscribe({
        next: () => {
          this.fetchRoles();
        },
        error: (err) => {
          alert('Failed to delete role.');
        }
      });
    }
  }

  toggleSidebarAccess(tab: string) {
    const idx = this.selectedSidebarAccess.indexOf(tab);
    if (idx > -1) {
      this.selectedSidebarAccess.splice(idx, 1);
    } else {
      this.selectedSidebarAccess.push(tab);
    }
  }

  isTabSelected(tab: string): boolean {
    return this.selectedSidebarAccess.includes(tab);
  }
}
