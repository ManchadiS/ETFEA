import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, Customer } from '../../services/api.service';

@Component({
  selector: 'app-customers',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './customers.component.html',
  styleUrl: './customers.component.css'
})
export class CustomersComponent implements OnInit {
  private apiService = inject(ApiService);

  // States using Angular Signals
  customers = signal<Customer[]>([]);
  isLoading = signal<boolean>(false);
  showModal = signal<boolean>(false);
  errorMessage = signal<string>('');

  isEditing = false;
  modalTitle = 'Add Customer';

  // Form fields (bindable via ngModel)
  currentId = '';
  mobile = '';
  emailId = '';
  loyaltyPoints = 0;

  ngOnInit() {
    this.fetchCustomers();
  }

  fetchCustomers() {
    this.isLoading.set(true);
    this.apiService.getCustomers().subscribe({
      next: (list) => {
        this.customers.set(list);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error fetching customers:', err);
        this.isLoading.set(false);
      }
    });
  }

  openAddModal() {
    this.isEditing = false;
    this.modalTitle = 'Add Customer Profile';
    this.currentId = '';
    this.mobile = '';
    this.emailId = '';
    this.loyaltyPoints = 0;
    this.errorMessage.set('');
    this.showModal.set(true);
  }

  openEditModal(c: Customer) {
    this.isEditing = true;
    this.modalTitle = 'Edit Customer Profile';
    this.currentId = c.id || '';
    this.mobile = c.mobile || '';
    this.emailId = c.emailId || '';
    this.loyaltyPoints = c.loyaltyPoints || 0;
    this.errorMessage.set('');
    this.showModal.set(true);
  }

  closeModal() {
    this.showModal.set(false);
  }

  saveCustomer() {
    if (!this.mobile.trim() && !this.emailId.trim()) {
      this.errorMessage.set('At least a Mobile Number or Email is required.');
      return;
    }

    const payload: Customer = {
      mobile: this.mobile.trim() || undefined,
      emailId: this.emailId.trim() || undefined,
      loyaltyPoints: this.loyaltyPoints
    };

    this.isLoading.set(true);
    if (this.isEditing) {
      this.apiService.updateCustomer(this.currentId, payload).subscribe({
        next: () => {
          this.closeModal();
          this.fetchCustomers();
        },
        error: (err) => {
          console.error('Error updating customer:', err);
          this.errorMessage.set('Failed to update customer.');
          this.isLoading.set(false);
        }
      });
    } else {
      this.apiService.createCustomer(payload).subscribe({
        next: () => {
          this.closeModal();
          this.fetchCustomers();
        },
        error: (err) => {
          console.error('Error creating customer:', err);
          this.errorMessage.set('Failed to create customer.');
          this.isLoading.set(false);
        }
      });
    }
  }

  deleteCustomer(id: string) {
    if (confirm('Are you sure you want to delete this customer profile?')) {
      this.isLoading.set(true);
      this.apiService.deleteCustomer(id).subscribe({
        next: () => {
          this.fetchCustomers();
        },
        error: (err) => {
          console.error('Error deleting customer:', err);
          this.isLoading.set(false);
        }
      });
    }
  }
}
