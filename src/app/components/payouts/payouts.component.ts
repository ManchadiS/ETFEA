import { Component, inject, OnInit, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, Payout, Restaurant } from '../../services/api.service';

@Component({
  selector: 'app-payouts',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './payouts.component.html',
  styleUrl: './payouts.component.css'
})
export class PayoutsComponent implements OnInit {
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
  payouts = signal<Payout[]>([]);
  filteredPayouts = signal<Payout[]>([]);
  restaurants = signal<Restaurant[]>([]);
  isLoading = signal<boolean>(false);
  activePlatform = signal<string>('All');
  searchQuery = signal<string>('');
  showModal = signal<boolean>(false);
  errorMessage = signal<string>('');

  platforms: string[] = ['All', 'Swiggy', 'Zomato'];
  
  isEditing = false;
  modalTitle = 'Record Payout Credit';
  
  // Form fields
  currentId = '';
  amount: number | null = null;
  platform: 'Swiggy' | 'Zomato' = 'Swiggy';
  date = '';
  referenceNumber = '';
  description = '';
  restaurantId = '';

  constructor() {
    // Automatically refetch payouts when active restaurant changes
    effect(() => {
      this.apiService.selectedRestaurantId();
      this.fetchPayouts();
    });
  }

  ngOnInit() {
    this.fetchRestaurants();
  }

  fetchRestaurants() {
    this.apiService.getRestaurants().subscribe({
      next: (list) => this.restaurants.set(list),
      error: (err) => console.error('Error fetching restaurants for payouts:', err)
    });
  }

  fetchPayouts() {
    this.isLoading.set(true);
    const restId = this.apiService.selectedRestaurantId();
    this.apiService.getPayouts(restId).subscribe({
      next: (list) => {
        this.payouts.set(list);
        this.filterPayouts();
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error fetching payouts:', err);
        this.isLoading.set(false);
      }
    });
  }

  filterPayouts() {
    const list = this.payouts();
    const plat = this.activePlatform();
    const query = this.searchQuery().trim().toLowerCase();

    const filtered = list.filter(p => {
      const matchesPlatform = plat === 'All' || p.platform === plat;
      const matchesSearch = !query || 
        (p.description && p.description.toLowerCase().includes(query)) ||
        (p.referenceNumber && p.referenceNumber.toLowerCase().includes(query));
      return matchesPlatform && matchesSearch;
    });

    // Sort by date descending
    filtered.sort((a, b) => {
      const dateA = a.date ? new Date(a.date).getTime() : 0;
      const dateB = b.date ? new Date(b.date).getTime() : 0;
      return dateB - dateA;
    });

    this.filteredPayouts.set(filtered);
  }

  selectPlatform(plat: string) {
    this.activePlatform.set(plat);
    this.filterPayouts();
  }

  onSearch() {
    this.filterPayouts();
  }

  openAddModal() {
    this.isEditing = false;
    this.modalTitle = 'Record Payout Credit';
    this.currentId = '';
    this.amount = null;
    this.platform = this.activePlatform() !== 'All' ? (this.activePlatform() as 'Swiggy' | 'Zomato') : 'Swiggy';
    this.date = new Date().toLocaleDateString('sv');
    this.description = '';
    this.referenceNumber = '';
    this.restaurantId = this.apiService.selectedRestaurantId(); // pre-select active restaurant if any
    this.errorMessage.set('');
    this.showModal.set(true);
  }

  openEditModal(p: Payout) {
    this.isEditing = true;
    this.modalTitle = 'Edit Payout Record';
    this.currentId = p.id || '';
    this.amount = p.amount;
    this.platform = p.platform;
    this.date = p.date || new Date().toLocaleDateString('sv');
    this.restaurantId = p.restaurantId || '';
    this.referenceNumber = p.referenceNumber || '';
    this.description = p.description || '';
    this.errorMessage.set('');
    this.showModal.set(true);
  }

  closeModal() {
    this.showModal.set(false);
  }

  savePayout() {
    if (this.amount == null || this.amount <= 0 || !this.date || !this.restaurantId || !this.platform) {
      this.errorMessage.set('Please enter a valid amount, date, select a restaurant and a platform.');
      return;
    }

    const payload: Payout = {
      amount: this.amount,
      platform: this.platform,
      date: this.date,
      description: this.description.trim(),
      restaurantId: this.restaurantId,
      referenceNumber: this.referenceNumber.trim()
    };

    this.isLoading.set(true);
    if (this.isEditing) {
      this.apiService.updatePayout(this.currentId, payload).subscribe({
        next: () => {
          this.closeModal();
          this.fetchPayouts();
        },
        error: (err) => {
          console.error('Error updating payout:', err);
          this.errorMessage.set('Failed to update payout record.');
          this.isLoading.set(false);
        }
      });
    } else {
      this.apiService.createPayout(payload).subscribe({
        next: () => {
          this.closeModal();
          this.fetchPayouts();
        },
        error: (err) => {
          console.error('Error creating payout:', err);
          this.errorMessage.set('Failed to record payout credit.');
          this.isLoading.set(false);
        }
      });
    }
  }

  deletePayout(id?: string) {
    if (!id) return;
    if (!confirm('Are you sure you want to delete this payout record?')) return;
    this.isLoading.set(true);
    this.apiService.deletePayout(id).subscribe({
      next: () => {
        this.fetchPayouts();
      },
      error: (err) => {
        console.error('Error deleting payout:', err);
        alert('Failed to delete payout record.');
        this.isLoading.set(false);
      }
    });
  }
}
