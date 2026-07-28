import { Component, inject, OnInit, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, Expense, Restaurant, InventoryItem } from '../../services/api.service';

@Component({
  selector: 'app-expenses',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './expenses.component.html',
  styleUrl: './expenses.component.css'
})
export class ExpensesComponent implements OnInit {
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
  expenses = signal<Expense[]>([]);
  filteredExpenses = signal<Expense[]>([]);
  restaurants = signal<Restaurant[]>([]);
  isLoading = signal<boolean>(false);
  activeCategory = signal<string>('All');
  searchQuery = signal<string>('');
  showModal = signal<boolean>(false);
  errorMessage = signal<string>('');

  categories: string[] = ['All', 'Salary', 'Rent', 'Utilities', 'Inventory', 'Marketing', 'Maintenance', 'Others'];
  
  isEditing = false;
  modalTitle = 'Record Expense';
  
  // Form fields
  currentId = '';
  amount: number | null = null;
  category = 'Inventory';
  date = '';
  description = '';
  restaurantId = '';
  imageUrl = '';
  isUploadingFile = signal<boolean>(false);

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    this.isUploadingFile.set(true);
    this.errorMessage.set('');
    this.apiService.uploadExpenseImage(file).subscribe({
      next: (res) => {
        this.imageUrl = res.imageUrl;
        this.isUploadingFile.set(false);
      },
      error: (err) => {
        console.error('File upload error:', err);
        this.errorMessage.set('Failed to upload receipt image. Please try again.');
        this.isUploadingFile.set(false);
      }
    });
  }

  // Inventory Integration fields
  inventoryItems = signal<InventoryItem[]>([]);
  selectedInventoryItemId = '';

  constructor() {
    // Automatically refetch expenses when active restaurant changes
    effect(() => {
      this.apiService.selectedRestaurantId();
      this.fetchExpenses();
    });
  }

  ngOnInit() {
    this.fetchRestaurants();
  }

  fetchRestaurants() {
    this.apiService.getRestaurants().subscribe({
      next: (list) => this.restaurants.set(list),
      error: (err) => console.error('Error fetching restaurants for expenses:', err)
    });
  }

  fetchInventoryItems() {
    if (!this.restaurantId) {
      this.inventoryItems.set([]);
      return;
    }
    this.apiService.getInventoryItems(this.restaurantId).subscribe({
      next: (list) => this.inventoryItems.set(list),
      error: (err) => console.error('Error fetching inventory items for expenses:', err)
    });
  }

  onRestaurantChange() {
    this.selectedInventoryItemId = '';
    this.fetchInventoryItems();
  }

  fetchExpenses() {
    this.isLoading.set(true);
    const restId = this.apiService.selectedRestaurantId();
    this.apiService.getExpenses(restId).subscribe({
      next: (list) => {
        this.expenses.set(list);
        this.filterExpenses();
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error fetching expenses:', err);
        this.isLoading.set(false);
      }
    });
  }

  filterExpenses() {
    const list = this.expenses();
    const cat = this.activeCategory();
    const query = this.searchQuery().trim().toLowerCase();

    const filtered = list.filter(e => {
      const matchesCategory = cat === 'All' || e.category === cat;
      const matchesSearch = !query || 
        (e.description && e.description.toLowerCase().includes(query)) ||
        (e.category && e.category.toLowerCase().includes(query));
      return matchesCategory && matchesSearch;
    });

    // Sort by date descending
    filtered.sort((a, b) => {
      const dateA = a.date ? new Date(a.date).getTime() : 0;
      const dateB = b.date ? new Date(b.date).getTime() : 0;
      return dateB - dateA;
    });

    this.filteredExpenses.set(filtered);
  }

  selectCategory(cat: string) {
    this.activeCategory.set(cat);
    this.filterExpenses();
  }

  onSearch() {
    this.filterExpenses();
  }

  openAddModal() {
    this.isEditing = false;
    this.modalTitle = 'Record Expense';
    this.currentId = '';
    this.amount = null;
    this.category = this.activeCategory() !== 'All' ? this.activeCategory() : 'Inventory';
    this.date = new Date().toISOString().split('T')[0];
    this.description = '';
    this.restaurantId = this.apiService.selectedRestaurantId(); // pre-select active restaurant if any
    this.selectedInventoryItemId = '';
    this.imageUrl = '';
    this.errorMessage.set('');
    this.showModal.set(true);
    this.fetchInventoryItems();
  }

  openEditModal(e: Expense) {
    this.isEditing = true;
    this.modalTitle = 'Edit Expense Record';
    this.currentId = e.id || '';
    this.amount = e.amount;
    this.category = e.category || 'Inventory';
    this.date = e.date || new Date().toISOString().split('T')[0];
    this.restaurantId = e.restaurantId || '';
    this.errorMessage.set('');

    this.selectedInventoryItemId = '';
    if (this.category === 'Inventory' && e.description && e.description.startsWith('Inventory: ')) {
      const parts = e.description.substring(11).split(' - ');
      const itemName = parts[0];
      this.description = parts.slice(1).join(' - ');
      this.apiService.getInventoryItems(this.restaurantId).subscribe({
        next: (list) => {
          this.inventoryItems.set(list);
          const found = list.find(item => item.name === itemName);
          if (found) {
            this.selectedInventoryItemId = found.id || '';
          }
        }
      });
    } else {
      this.description = e.description || '';
      this.fetchInventoryItems();
    }

    this.imageUrl = e.imageUrl || '';
    this.showModal.set(true);
  }

  closeModal() {
    this.showModal.set(false);
  }

  saveExpense() {
    if (this.amount == null || this.amount <= 0 || !this.date || !this.restaurantId) {
      this.errorMessage.set('Please enter a valid amount, date, and select a restaurant.');
      return;
    }

    if (this.category === 'Inventory' && !this.selectedInventoryItemId) {
      this.errorMessage.set('Please select an inventory item.');
      return;
    }

    let finalDescription = this.description.trim();
    if (this.category === 'Inventory') {
      const selectedItem = this.inventoryItems().find(item => item.id === this.selectedInventoryItemId);
      if (selectedItem) {
        finalDescription = `Inventory: ${selectedItem.name}` + (finalDescription ? ` - ${finalDescription}` : '');
      }
    }

    const payload: Expense = {
      amount: this.amount,
      category: this.category,
      date: this.date,
      description: finalDescription,
      restaurantId: this.restaurantId,
      imageUrl: this.imageUrl
    };

    this.isLoading.set(true);
    if (this.isEditing) {
      this.apiService.updateExpense(this.currentId, payload).subscribe({
        next: () => {
          this.closeModal();
          this.fetchExpenses();
        },
        error: (err) => {
          console.error('Error updating expense:', err);
          this.errorMessage.set('Failed to update expense.');
          this.isLoading.set(false);
        }
      });
    } else {
      this.apiService.createExpense(payload).subscribe({
        next: () => {
          this.closeModal();
          this.fetchExpenses();
        },
        error: (err) => {
          console.error('Error creating expense:', err);
          this.errorMessage.set('Failed to record expense.');
          this.isLoading.set(false);
        }
      });
    }
  }

  deleteExpense(id?: string) {
    if (!id) return;
    this.isLoading.set(true);
    this.apiService.deleteExpense(id).subscribe({
      next: () => {
        this.fetchExpenses();
      },
      error: (err) => {
        console.error('Error deleting expense:', err);
        alert('Failed to delete expense.');
        this.isLoading.set(false);
      }
    });
  }

  getReceiptUrl(path: string): string {
    const host = window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'http://api.engineeringtadka.com';
    return `${host}${path}`;
  }
}
