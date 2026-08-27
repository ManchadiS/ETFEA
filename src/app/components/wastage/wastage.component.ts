import { Component, inject, OnInit, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, Wastage, Restaurant, InventoryItem } from '../../services/api.service';

@Component({
  selector: 'app-wastage',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './wastage.component.html',
  styleUrl: './wastage.component.css'
})
export class WastageComponent implements OnInit {
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
  wastages = signal<Wastage[]>([]);
  filteredWastages = signal<Wastage[]>([]);
  inventoryItems = signal<InventoryItem[]>([]);
  restaurants = signal<Restaurant[]>([]);
  isLoading = signal<boolean>(false);
  activeReason = signal<string>('All');
  searchQuery = signal<string>('');
  showModal = signal<boolean>(false);
  errorMessage = signal<string>('');

  reasons: string[] = ['All', 'Spoilage', 'Expired', 'Spill', 'Damaged', 'Other'];
  
  isEditing = false;
  modalTitle = 'Record Wastage Entry';
  
  // Form fields
  currentId = '';
  amount: number | null = null;
  quantity: number | null = null;
  reason = 'Spoilage';
  date = '';
  inventoryItemId = '';
  restaurantId = '';

  constructor() {
    // Automatically refetch wastages when active restaurant changes
    effect(() => {
      this.apiService.selectedRestaurantId();
      this.fetchWastages();
      this.fetchInventoryItems();
    });
  }

  ngOnInit() {
    this.fetchRestaurants();
  }

  fetchRestaurants() {
    this.apiService.getRestaurants().subscribe({
      next: (list) => this.restaurants.set(list),
      error: (err) => console.error('Error fetching restaurants for wastage:', err)
    });
  }

  fetchInventoryItems() {
    const restId = this.restaurantId || this.apiService.selectedRestaurantId();
    if (!restId) {
      this.inventoryItems.set([]);
      return;
    }
    this.apiService.getInventoryItems(restId).subscribe({
      next: (list) => this.inventoryItems.set(list),
      error: (err) => console.error('Error fetching inventory items for wastage:', err)
    });
  }

  onRestaurantChange() {
    this.inventoryItemId = '';
    this.fetchInventoryItems();
  }

  fetchWastages() {
    this.isLoading.set(true);
    const restId = this.apiService.selectedRestaurantId();
    this.apiService.getWastages(restId).subscribe({
      next: (list) => {
        this.wastages.set(list);
        this.filterWastages();
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error fetching wastage logs:', err);
        this.isLoading.set(false);
      }
    });
  }

  filterWastages() {
    const list = this.wastages();
    const reasonFilter = this.activeReason();
    const query = this.searchQuery().trim().toLowerCase();

    const filtered = list.filter(w => {
      const matchesReason = reasonFilter === 'All' || w.reason === reasonFilter;
      const matchesSearch = !query || 
        (w.inventoryItemName && w.inventoryItemName.toLowerCase().includes(query)) ||
        (w.reason && w.reason.toLowerCase().includes(query));
      return matchesReason && matchesSearch;
    });

    // Sort by date descending
    filtered.sort((a, b) => {
      const dateA = a.date ? new Date(a.date).getTime() : 0;
      const dateB = b.date ? new Date(b.date).getTime() : 0;
      return dateB - dateA;
    });

    this.filteredWastages.set(filtered);
  }

  selectReason(r: string) {
    this.activeReason.set(r);
    this.filterWastages();
  }

  onSearch() {
    this.filterWastages();
  }

  getInventoryItemUnit(itemId: string): string {
    const found = this.inventoryItems().find(i => i.id === itemId);
    return found ? (found.unit || 'units') : 'units';
  }

  openAddModal() {
    this.isEditing = false;
    this.modalTitle = 'Record Wastage Entry';
    this.currentId = '';
    this.amount = null;
    this.quantity = null;
    this.reason = this.activeReason() !== 'All' ? this.activeReason() : 'Spoilage';
    this.date = new Date().toLocaleDateString('sv');
    this.inventoryItemId = '';
    this.restaurantId = this.apiService.selectedRestaurantId(); // pre-select active restaurant if any
    this.errorMessage.set('');
    this.showModal.set(true);
    this.fetchInventoryItems();
  }

  openEditModal(w: Wastage) {
    this.isEditing = true;
    this.modalTitle = 'Edit Wastage Record';
    this.currentId = w.id || '';
    this.amount = w.amount;
    this.quantity = w.quantity;
    this.reason = w.reason || 'Spoilage';
    this.date = w.date || new Date().toLocaleDateString('sv');
    this.restaurantId = w.restaurantId || '';
    this.inventoryItemId = w.inventoryItemId;
    this.errorMessage.set('');
    this.showModal.set(true);
    this.fetchInventoryItems();
  }

  closeModal() {
    this.showModal.set(false);
  }

  saveWastage() {
    if (this.amount == null || this.amount < 0 || this.quantity == null || this.quantity <= 0 || !this.date || !this.restaurantId || !this.inventoryItemId) {
      this.errorMessage.set('Please enter a valid quantity, amount, date, select a restaurant and an inventory item.');
      return;
    }

    const selectedItem = this.inventoryItems().find(i => i.id === this.inventoryItemId);
    if (!selectedItem) {
      this.errorMessage.set('Selected inventory item is invalid.');
      return;
    }

    const payload: Wastage = {
      quantity: this.quantity,
      amount: this.amount,
      reason: this.reason,
      date: this.date,
      restaurantId: this.restaurantId,
      inventoryItemId: this.inventoryItemId,
      inventoryItemName: selectedItem.name
    };

    this.isLoading.set(true);
    if (this.isEditing) {
      this.apiService.updateWastage(this.currentId, payload).subscribe({
        next: () => {
          this.closeModal();
          this.fetchWastages();
        },
        error: (err) => {
          console.error('Error updating wastage:', err);
          this.errorMessage.set('Failed to update wastage record.');
          this.isLoading.set(false);
        }
      });
    } else {
      this.apiService.createWastage(payload).subscribe({
        next: () => {
          this.closeModal();
          this.fetchWastages();
        },
        error: (err) => {
          console.error('Error creating wastage:', err);
          this.errorMessage.set('Failed to record wastage.');
          this.isLoading.set(false);
        }
      });
    }
  }

  deleteWastage(id?: string) {
    if (!id) return;
    this.isLoading.set(true);
    this.apiService.deleteWastage(id).subscribe({
      next: () => {
        this.fetchWastages();
      },
      error: (err) => {
        console.error('Error deleting wastage:', err);
        alert('Failed to delete wastage record.');
        this.isLoading.set(false);
      }
    });
  }
}
