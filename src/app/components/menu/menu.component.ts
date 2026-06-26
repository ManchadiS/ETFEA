import { Component, inject, OnInit, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, FoodItem, Restaurant } from '../../services/api.service';

@Component({
  selector: 'app-menu',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './menu.component.html',
  styleUrl: './menu.component.css'
})
export class MenuComponent implements OnInit {
  private apiService = inject(ApiService);

  // States using Signals
  foodItems = signal<FoodItem[]>([]);
  filteredItems = signal<FoodItem[]>([]);
  restaurants = signal<Restaurant[]>([]);
  isLoading = signal<boolean>(false);
  activeCategory = signal<string>('All');
  searchQuery = signal<string>('');
  showModal = signal<boolean>(false);
  errorMessage = signal<string>('');

  categories: string[] = ['All', 'Starters', 'Main Course', 'Bread', 'Desserts', 'Beverages'];
  
  isEditing = false;
  modalTitle = 'Add Food Item';
  
  // Form fields
  currentId = '';
  name = '';
  price: number | null = null;
  category = 'Main Course';
  description = '';
  restaurantId = '';

  constructor() {
    // Automatically refetch food items when active restaurant changes
    effect(() => {
      this.apiService.selectedRestaurantId();
      this.fetchFoodItems();
    });
  }

  ngOnInit() {
    this.fetchRestaurants();
  }

  fetchRestaurants() {
    this.apiService.getRestaurants().subscribe({
      next: (list) => this.restaurants.set(list),
      error: (err) => console.error('Error fetching restaurants for menu:', err)
    });
  }

  fetchFoodItems() {
    this.isLoading.set(true);
    const restId = this.apiService.selectedRestaurantId();
    this.apiService.getFoodItems(restId).subscribe({
      next: (list) => {
        this.foodItems.set(list);
        this.filterItems();
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error fetching food items:', err);
        this.isLoading.set(false);
      }
    });
  }

  filterItems() {
    const list = this.foodItems();
    const cat = this.activeCategory();
    const query = this.searchQuery().trim().toLowerCase();

    const filtered = list.filter(item => {
      const matchesCategory = cat === 'All' || item.category === cat;
      const matchesSearch = !query || 
        item.name.toLowerCase().includes(query) || 
        (item.description && item.description.toLowerCase().includes(query));
      return matchesCategory && matchesSearch;
    });

    this.filteredItems.set(filtered);
  }

  selectCategory(cat: string) {
    this.activeCategory.set(cat);
    this.filterItems();
  }

  onSearch() {
    this.filterItems();
  }

  openAddModal() {
    this.isEditing = false;
    this.modalTitle = 'Add Menu Item';
    this.currentId = '';
    this.name = '';
    this.price = null;
    this.category = this.activeCategory() !== 'All' ? this.activeCategory() : 'Main Course';
    this.description = '';
    this.restaurantId = this.apiService.selectedRestaurantId(); // pre-select active restaurant if any
    this.errorMessage.set('');
    this.showModal.set(true);
  }

  openEditModal(item: FoodItem) {
    this.isEditing = true;
    this.modalTitle = 'Edit Menu Item';
    this.currentId = item.id || '';
    this.name = item.name;
    this.price = item.price;
    this.category = item.category || 'Main Course';
    this.description = item.description || '';
    this.restaurantId = item.restaurantId || '';
    this.errorMessage.set('');
    this.showModal.set(true);
  }

  closeModal() {
    this.showModal.set(false);
  }

  saveFoodItem() {
    if (!this.name.trim() || this.price == null || this.price <= 0 || !this.restaurantId) {
      this.errorMessage.set('Please enter a valid item name, price, and select a restaurant.');
      return;
    }

    const payload: FoodItem = {
      name: this.name.trim(),
      price: this.price,
      category: this.category,
      description: this.description.trim(),
      restaurantId: this.restaurantId
    };

    this.isLoading.set(true);
    if (this.isEditing) {
      this.apiService.updateFoodItem(this.currentId, payload).subscribe({
        next: () => {
          this.closeModal();
          this.fetchFoodItems();
        },
        error: (err) => {
          console.error('Error updating food item:', err);
          this.errorMessage.set('Failed to update food item.');
          this.isLoading.set(false);
        }
      });
    } else {
      this.apiService.createFoodItem(payload).subscribe({
        next: () => {
          this.closeModal();
          this.fetchFoodItems();
        },
        error: (err) => {
          console.error('Error creating food item:', err);
          this.errorMessage.set('Failed to create food item.');
          this.isLoading.set(false);
        }
      });
    }
  }

  deleteFoodItem(id?: string) {
    if (!id) return;
    this.isLoading.set(true);
    this.apiService.deleteFoodItem(id).subscribe({
      next: () => {
        this.fetchFoodItems();
      },
      error: (err) => {
        console.error('Error deleting food item:', err);
        alert('Failed to delete food item.');
        this.isLoading.set(false);
      }
    });
  }
}
