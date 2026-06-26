import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, Restaurant } from '../../services/api.service';

@Component({
  selector: 'app-restaurants',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './restaurants.component.html',
  styleUrl: './restaurants.component.css'
})
export class RestaurantsComponent implements OnInit {
  private apiService = inject(ApiService);

  // States using Angular Signals
  restaurants = signal<Restaurant[]>([]);
  isLoading = signal<boolean>(false);
  showModal = signal<boolean>(false);
  errorMessage = signal<string>('');

  isEditing = false;
  modalTitle = 'Add Restaurant';

  // Form fields (bindable via ngModel)
  currentId = '';
  name = '';
  address = '';

  ngOnInit() {
    this.fetchRestaurants();
  }

  fetchRestaurants() {
    this.isLoading.set(true);
    this.apiService.getRestaurants().subscribe({
      next: (list) => {
        this.restaurants.set(list);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error fetching restaurants:', err);
        this.isLoading.set(false);
      }
    });
  }

  openAddModal() {
    this.isEditing = false;
    this.modalTitle = 'Add Restaurant';
    this.currentId = '';
    this.name = '';
    this.address = '';
    this.errorMessage.set('');
    this.showModal.set(true);
  }

  openEditModal(r: Restaurant) {
    this.isEditing = true;
    this.modalTitle = 'Edit Restaurant';
    this.currentId = r.id || '';
    this.name = r.name;
    this.address = r.address || '';
    this.errorMessage.set('');
    this.showModal.set(true);
  }

  closeModal() {
    this.showModal.set(false);
  }

  saveRestaurant() {
    if (!this.name.trim()) {
      this.errorMessage.set('Restaurant name is required.');
      return;
    }

    const payload: Restaurant = {
      name: this.name.trim(),
      address: this.address.trim()
    };

    this.isLoading.set(true);
    if (this.isEditing) {
      this.apiService.updateRestaurant(this.currentId, payload).subscribe({
        next: () => {
          this.closeModal();
          this.fetchRestaurants();
        },
        error: (err) => {
          console.error('Error updating restaurant:', err);
          this.errorMessage.set('Failed to update restaurant.');
          this.isLoading.set(false);
        }
      });
    } else {
      this.apiService.createRestaurant(payload).subscribe({
        next: () => {
          this.closeModal();
          this.fetchRestaurants();
        },
        error: (err) => {
          console.error('Error creating restaurant:', err);
          this.errorMessage.set('Failed to create restaurant.');
          this.isLoading.set(false);
        }
      });
    }
  }

  deleteRestaurant(id?: string) {
    if (!id) return;
    this.isLoading.set(true);
    this.apiService.deleteRestaurant(id).subscribe({
      next: () => {
        this.fetchRestaurants();
      },
      error: (err) => {
        console.error('Error deleting restaurant:', err);
        alert('Failed to delete restaurant.');
        this.isLoading.set(false);
      }
    });
  }
}
