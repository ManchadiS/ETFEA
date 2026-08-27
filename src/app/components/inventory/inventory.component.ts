import { Component, inject, OnInit, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, InventoryItem, Restaurant } from '../../services/api.service';

@Component({
  selector: 'app-inventory',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './inventory.component.html',
  styleUrl: './inventory.component.css'
})
export class InventoryComponent implements OnInit {
  private apiService = inject(ApiService);

  hasDeleteAccess(): boolean {
    const user = this.apiService.currentUser();
    if (!user) return false;
    if (user.email === 'sagarmanchadi324@gmail.com' || user.role === 'Super Admin') {
      return true;
    }
    return user.rights?.deleteAccess || false;
  }

  // States using Signals
  inventoryItems = signal<InventoryItem[]>([]);
  filteredItems = signal<InventoryItem[]>([]);
  restaurants = signal<Restaurant[]>([]);
  isLoading = signal<boolean>(false);
  searchQuery = signal<string>('');
  showModal = signal<boolean>(false);
  errorMessage = signal<string>('');
  activeFilter = signal<'All' | 'InStock' | 'LowStock' | 'OutOfStock'>('All');

  isEditing = false;
  modalTitle = 'Add Inventory Item';

  // Form fields
  currentId = '';
  name = '';
  restaurantId = '';
  quantity = 0;
  unit = 'units';
  threshold = 10;

  constructor() {
    // Automatically refetch inventory items when active restaurant changes
    effect(() => {
      this.apiService.selectedRestaurantId();
      this.fetchInventoryItems();
    });
  }

  ngOnInit() {
    this.fetchRestaurants();
  }

  fetchRestaurants() {
    this.apiService.getRestaurants().subscribe({
      next: (list) => this.restaurants.set(list),
      error: (err) => console.error('Error fetching restaurants for inventory:', err)
    });
  }

  fetchInventoryItems() {
    this.isLoading.set(true);
    const restId = this.apiService.selectedRestaurantId();
    this.apiService.getInventoryItems(restId).subscribe({
      next: (list) => {
        this.inventoryItems.set(list);
        this.filterItems();
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error fetching inventory items:', err);
        this.isLoading.set(false);
      }
    });
  }

  filterItems() {
    const list = this.inventoryItems();
    const query = this.searchQuery().trim().toLowerCase();
    const filter = this.activeFilter();

    const filtered = list.filter(item => {
      const matchesSearch = !query || item.name.toLowerCase().includes(query);
      if (!matchesSearch) return false;

      const qty = item.quantity !== undefined ? item.quantity : 0;
      const thres = item.threshold !== undefined ? item.threshold : 10;

      if (filter === 'OutOfStock') {
        return qty === 0;
      } else if (filter === 'LowStock') {
        return qty > 0 && qty <= thres;
      } else if (filter === 'InStock') {
        return qty > thres;
      }
      return true;
    });

    this.filteredItems.set(filtered);
  }

  setFilter(filter: 'All' | 'InStock' | 'LowStock' | 'OutOfStock') {
    this.activeFilter.set(filter);
    this.filterItems();
  }

  onSearch() {
    this.filterItems();
  }

  openAddModal() {
    this.isEditing = false;
    this.modalTitle = 'Add Inventory Item';
    this.currentId = '';
    this.name = '';
    this.restaurantId = this.apiService.selectedRestaurantId(); // pre-select active restaurant if any
    this.quantity = 0;
    this.unit = 'units';
    this.threshold = 10;
    this.errorMessage.set('');
    this.showModal.set(true);
  }

  openEditModal(item: InventoryItem) {
    this.isEditing = true;
    this.modalTitle = 'Edit Inventory Item';
    this.currentId = item.id || '';
    this.name = item.name;
    this.restaurantId = item.restaurantId || '';
    this.quantity = item.quantity !== undefined ? item.quantity : 0;
    this.unit = item.unit || 'units';
    this.threshold = item.threshold !== undefined ? item.threshold : 10;
    this.errorMessage.set('');
    this.showModal.set(true);
  }

  closeModal() {
    this.showModal.set(false);
  }

  saveInventoryItem() {
    if (!this.name.trim() || !this.restaurantId) {
      this.errorMessage.set('Please enter a valid item name and select a restaurant.');
      return;
    }

    const payload: InventoryItem = {
      name: this.name.trim(),
      restaurantId: this.restaurantId,
      quantity: this.quantity,
      unit: this.unit.trim(),
      threshold: this.threshold
    };

    this.isLoading.set(true);
    if (this.isEditing) {
      this.apiService.updateInventoryItem(this.currentId, payload).subscribe({
        next: () => {
          this.closeModal();
          this.fetchInventoryItems();
        },
        error: (err) => {
          console.error('Error updating inventory item:', err);
          this.errorMessage.set('Failed to update inventory item.');
          this.isLoading.set(false);
        }
      });
    } else {
      this.apiService.createInventoryItem(payload).subscribe({
        next: () => {
          this.closeModal();
          this.fetchInventoryItems();
        },
        error: (err) => {
          console.error('Error creating inventory item:', err);
          this.errorMessage.set('Failed to create inventory item.');
          this.isLoading.set(false);
        }
      });
    }
  }

  quickAdjustQuantity(item: InventoryItem, delta: number) {
    if (!item.id) return;
    const currentQty = item.quantity !== undefined ? item.quantity : 0;
    const newQty = Math.max(0, currentQty + delta);
    if (newQty === currentQty) return;

    // Optimistic local update
    this.inventoryItems.update(items =>
      items.map(i => i.id === item.id ? { ...i, quantity: newQty } : i)
    );
    this.filterItems();

    this.apiService.updateInventoryItem(item.id, { quantity: newQty }).subscribe({
      next: () => {
        this.fetchInventoryItems();
      },
      error: (err) => {
        console.error('Error adjusting inventory item quantity:', err);
        // Revert by refetching
        this.fetchInventoryItems();
      }
    });
  }

  getMetricsCount(status: 'Total' | 'LowStock' | 'OutOfStock'): number {
    const list = this.inventoryItems();
    if (status === 'Total') {
      return list.length;
    } else if (status === 'LowStock') {
      return list.filter(i => {
        const qty = i.quantity !== undefined ? i.quantity : 0;
        const thres = i.threshold !== undefined ? i.threshold : 10;
        return qty > 0 && qty <= thres;
      }).length;
    } else if (status === 'OutOfStock') {
      return list.filter(i => (i.quantity !== undefined ? i.quantity : 0) === 0).length;
    }
    return 0;
  }

  deleteInventoryItem(id?: string) {
    if (!id) return;
    this.isLoading.set(true);
    this.apiService.deleteInventoryItem(id).subscribe({
      next: () => {
        this.fetchInventoryItems();
      },
      error: (err) => {
        console.error('Error deleting inventory item:', err);
        alert('Failed to delete inventory item.');
        this.isLoading.set(false);
      }
    });
  }

  getRestaurantName(id: string): string {
    const rest = this.restaurants().find(r => r.id === id);
    return rest ? rest.name : 'Unknown Outlet';
  }
}
