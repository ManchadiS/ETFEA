import { Component, inject, OnInit, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, Restaurant, FoodItem, Billing, FoodOrderItem, Customer } from '../../services/api.service';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'app-billing',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './billing.component.html',
  styleUrl: './billing.component.css'
})
export class BillingComponent implements OnInit {
  private apiService = inject(ApiService);

  // States using Signals
  restaurants = signal<Restaurant[]>([]);
  foodItems = signal<FoodItem[]>([]);
  bills = signal<Billing[]>([]);
  filteredBills = signal<Billing[]>([]);
  
  activeTab = signal<string>('create');
  isLoading = signal<boolean>(false);
  isSubmitting = signal<boolean>(false);

  // Invoice builder state
  selectedRestaurantId = '';
  selectedFoodItemId = '';
  selectedQuantity = 1;
  orderItems = signal<FoodOrderItem[]>([]);
  
  // Searchable dish selection state
  dishSearchQuery = signal<string>('');
  showSuggestions = signal<boolean>(false);
  
  // Taxes
  cgstRate = 2.5; // 2.5%
  sgstRate = 2.5; // 2.5%
  
  // Customer details
  mobile = '';
  emailId = '';
  description = '';
  status: 'pending' | 'paid' | 'overdue' = 'paid';

  // Search & Filter Records
  searchQuery = '';
  statusFilter = 'All';

  // Details Modal
  selectedBill = signal<Billing | null>(null);
  selectedBillRestaurant = signal<Restaurant | null>(null);
  showDetailsModal = signal<boolean>(false);
  customerLoyaltyPoints = signal<number | null>(null);

  errorMessage = signal<string>('');
  successMessage = signal<string>('');
  discount = signal<number>(0);

  // Customer suggestions signals
  allCustomers = signal<Customer[]>([]);
  mobileSuggestions = signal<Customer[]>([]);
  emailSuggestions = signal<Customer[]>([]);
  showMobileSuggestions = signal<boolean>(false);
  showEmailSuggestions = signal<boolean>(false);

  currentDateStr = new Date().toISOString().split('T')[0];

  get selectedRestaurantName(): string {
    const rest = this.restaurants().find(r => r.id === this.selectedRestaurantId);
    return rest ? rest.name : 'Main HQ';
  }

  get activeRestaurantId(): string {
    return this.apiService.selectedRestaurantId();
  }

  constructor() {
    // Automatically refetch billing data when active restaurant changes
    effect(() => {
      const restId = this.apiService.selectedRestaurantId();
      this.selectedRestaurantId = restId;
      this.orderItems.set([]);
      this.selectedFoodItemId = '';
      this.dishSearchQuery.set('');
      this.showSuggestions.set(false);
      this.fetchInitialData();
    });
  }

  ngOnInit() {
    // Initial fetch is handled by the constructor's effect
  }

  fetchInitialData() {
    this.isLoading.set(true);
    const restId = this.apiService.selectedRestaurantId();
    forkJoin({
      restaurants: this.apiService.getRestaurants(),
      foodItems: this.apiService.getFoodItems(restId),
      bills: this.apiService.getBills(restId),
      customers: this.apiService.getCustomers()
    }).subscribe({
      next: (res) => {
        this.restaurants.set(res.restaurants);
        this.foodItems.set(res.foodItems);
        this.bills.set(res.bills);
        this.allCustomers.set(res.customers);
        this.filterBills();
        
        if (restId) {
          this.selectedRestaurantId = restId;
        } else {
          const list = this.restaurants();
          if (list.length > 0) {
            const exists = list.some(r => r.id === this.selectedRestaurantId);
            if (!exists) {
              this.selectedRestaurantId = list[0].id || '';
            }
          } else {
            this.selectedRestaurantId = '';
          }
        }
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error fetching billing data:', err);
        this.isLoading.set(false);
      }
    });
  }

  fetchBillsOnly() {
    const restId = this.apiService.selectedRestaurantId();
    this.apiService.getBills(restId).subscribe({
      next: (list) => {
        this.bills.set(list);
        this.filterBills();
      }
    });
  }

  getFilteredFoodItems(): FoodItem[] {
    const list = this.foodItems();
    if (!this.selectedRestaurantId) return [];
    // If we loaded specific restaurant items, return all of them. Else filter.
    const restId = this.apiService.selectedRestaurantId();
    if (restId) return list;
    return list.filter(item => item.restaurantId === this.selectedRestaurantId);
  }

  // Dish Search methods
  getFilteredDishes(): FoodItem[] {
    const dishes = this.getFilteredFoodItems();
    const query = this.dishSearchQuery().trim().toLowerCase();
    if (!query) return dishes;
    return dishes.filter(item => item.name.toLowerCase().includes(query));
  }

  onDishSearchChange(query: string) {
    this.dishSearchQuery.set(query);
    this.showSuggestions.set(true);
    
    const match = this.getFilteredFoodItems().find(
      item => item.name.toLowerCase() === query.trim().toLowerCase()
    );
    if (match) {
      this.selectedFoodItemId = match.id || '';
    } else {
      this.selectedFoodItemId = '';
    }
  }

  onDishSearchFocus() {
    this.showSuggestions.set(true);
  }

  onDishSearchBlur() {
    setTimeout(() => {
      this.showSuggestions.set(false);
    }, 200);
  }

  selectDish(item: FoodItem) {
    this.selectedFoodItemId = item.id || '';
    this.dishSearchQuery.set(item.name);
    this.showSuggestions.set(false);
  }

  onRestaurantChange() {
    this.orderItems.set([]);
    this.selectedFoodItemId = '';
    this.dishSearchQuery.set('');
    this.showSuggestions.set(false);
  }

  onMobileChange(val: string) {
    this.mobile = val;
    this.showMobileSuggestions.set(true);
    const cleanMobile = val.trim();
    if (!cleanMobile) {
      this.mobileSuggestions.set([]);
      return;
    }
    const filtered = this.allCustomers().filter(c => c.mobile && c.mobile.includes(cleanMobile));
    this.mobileSuggestions.set(filtered);

    if (cleanMobile.length >= 10) {
      const match = this.allCustomers().find(c => c.mobile === cleanMobile);
      if (match && match.emailId && !this.emailId) {
        this.emailId = match.emailId;
      }
    }
  }

  onEmailChange(val: string) {
    this.emailId = val;
    this.showEmailSuggestions.set(true);
    const cleanEmail = val.trim().toLowerCase();
    if (!cleanEmail) {
      this.emailSuggestions.set([]);
      return;
    }
    const filtered = this.allCustomers().filter(c => c.emailId && c.emailId.toLowerCase().includes(cleanEmail));
    this.emailSuggestions.set(filtered);

    if (cleanEmail.includes('@') && cleanEmail.includes('.') && cleanEmail.length > 5) {
      const match = this.allCustomers().find(c => c.emailId && c.emailId.toLowerCase() === cleanEmail);
      if (match && match.mobile && !this.mobile) {
        this.mobile = match.mobile;
      }
    }
  }

  selectCustomerSuggestion(cust: Customer) {
    if (cust.mobile) {
      this.mobile = cust.mobile;
    }
    if (cust.emailId) {
      this.emailId = cust.emailId;
    }
    this.showMobileSuggestions.set(false);
    this.showEmailSuggestions.set(false);
  }

  hideSuggestionsWithDelay(type: 'mobile' | 'email') {
    setTimeout(() => {
      if (type === 'mobile') {
        this.showMobileSuggestions.set(false);
      } else {
        this.showEmailSuggestions.set(false);
      }
    }, 250);
  }

  filterBills() {
    const list = this.bills();
    const query = this.searchQuery.trim().toLowerCase();
    const stat = this.statusFilter;

    const filtered = list.filter(b => {
      const matchesStatus = stat === 'All' || b.status === stat;
      const matchesSearch = !query ||
        (b.mobile && b.mobile.includes(query)) ||
        (b.emailId && b.emailId.toLowerCase().includes(query)) ||
        (b.description && b.description.toLowerCase().includes(query)) ||
        (b.id && b.id.includes(query));
      return matchesStatus && matchesSearch;
    });

    // Sort by date descending
    filtered.sort((a, b) => {
      const dateA = a.date ? new Date(a.date).getTime() : 0;
      const dateB = b.date ? new Date(b.date).getTime() : 0;
      return dateB - dateA;
    });

    this.filteredBills.set(filtered);
  }

  onSearch() {
    this.filterBills();
  }

  selectTab(tab: string) {
    this.activeTab.set(tab);
    if (tab === 'records') {
      this.fetchBillsOnly();
    }
  }

  // Invoice builder actions
  addOrderItem() {
    if (!this.selectedFoodItemId) return;
    const food = this.foodItems().find(f => f.id === this.selectedFoodItemId);
    if (!food) return;

    const currentOrder = [...this.orderItems()];
    const existingIndex = currentOrder.findIndex(item => item.name === food.name);

    if (existingIndex > -1) {
      currentOrder[existingIndex].quantity += this.selectedQuantity;
    } else {
      const now = new Date();
      const timeStr = now.toTimeString().split(' ')[0].substring(0, 5); // "HH:MM"
      currentOrder.push({
        name: food.name,
        price: food.price,
        quantity: this.selectedQuantity,
        time: timeStr
      });
    }

    this.orderItems.set(currentOrder);
    this.selectedQuantity = 1; // reset quantity input
    this.selectedFoodItemId = '';
    this.dishSearchQuery.set('');
    this.showSuggestions.set(false);
  }

  removeOrderItem(index: number) {
    const currentOrder = [...this.orderItems()];
    currentOrder.splice(index, 1);
    this.orderItems.set(currentOrder);
  }

  adjustQuantity(index: number, change: number) {
    const currentOrder = [...this.orderItems()];
    const item = currentOrder[index];
    item.quantity += change;
    if (item.quantity <= 0) {
      currentOrder.splice(index, 1);
    }
    this.orderItems.set(currentOrder);
  }

  get itemsTotal(): number {
    return this.orderItems().reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }

  get discountAmount(): number {
    return (this.itemsTotal * this.discount()) / 100;
  }

  get grandTotal(): number {
    return this.itemsTotal - this.discountAmount;
  }

  get cgstAmount(): number {
    return Math.round((this.grandTotal * this.cgstRate) / (100 + this.cgstRate + this.sgstRate) * 100) / 100;
  }

  get sgstAmount(): number {
    return Math.round((this.grandTotal * this.sgstRate) / (100 + this.cgstRate + this.sgstRate) * 100) / 100;
  }

  get subtotal(): number {
    return this.grandTotal - this.cgstAmount - this.sgstAmount;
  }

  submitInvoice() {
    if (!this.selectedRestaurantId) {
      this.errorMessage.set('Please select a restaurant outlet.');
      return;
    }

    if (this.orderItems().length === 0) {
      this.errorMessage.set('Please add at least one food item to the invoice.');
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    const billPayload: Billing = {
      amount: this.subtotal,
      restaurantId: this.selectedRestaurantId,
      date: new Date().toISOString().split('T')[0],
      description: this.description.trim(),
      status: this.status,
      mobile: this.mobile.trim() || undefined,
      emailId: this.emailId.trim() || undefined,
      cgst: this.cgstAmount,
      sgst: this.sgstAmount,
      foodItems: this.orderItems(),
      discount: this.discount()
    };

    this.apiService.createBill(billPayload).subscribe({
      next: (createdBill) => {
        this.isSubmitting.set(false);
        
        this.apiService.getCustomers().subscribe(list => this.allCustomers.set(list));
        
        let successInfo = `Invoice created successfully (ID: ${createdBill.id?.substring(0, 8)}...).`;
        if (createdBill.emailId) {
          if (createdBill.emailStatus === 'sent') {
            successInfo += ` Email sent successfully to ${createdBill.emailId}.`;
          } else if (createdBill.emailStatus === 'logged') {
            successInfo += ` Receipt generated and logged to console for ${createdBill.emailId} (Mock Mode).`;
          } else {
            successInfo += ` Warning: Email receipt failed: ${createdBill.emailError || 'Unknown error'}.`;
          }
        }
        
        this.successMessage.set(successInfo);
        this.resetInvoiceBuilder();
        
        // Scroll to top to see success message
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
      error: (err) => {
        console.error('Error creating invoice:', err);
        this.isSubmitting.set(false);
        this.errorMessage.set(err.error?.error || 'Failed to create invoice.');
      }
    });
  }

  resetInvoiceBuilder() {
    this.orderItems.set([]);
    this.mobile = '';
    this.emailId = '';
    this.description = '';
    this.status = 'paid';
    this.selectedFoodItemId = '';
    this.dishSearchQuery.set('');
    this.showSuggestions.set(false);
    this.discount.set(0);
    const restId = this.apiService.selectedRestaurantId();
    if (restId) {
      this.selectedRestaurantId = restId;
    } else {
      const list = this.restaurants();
      if (list.length > 0) {
        this.selectedRestaurantId = list[0].id || '';
      }
    }
  }

  // Invoice logs actions
  viewBillDetails(bill: Billing) {
    this.selectedBill.set(bill);
    this.selectedBillRestaurant.set(this.restaurants().find(r => r.id === bill.restaurantId) || null);
    this.showDetailsModal.set(true);
    
    // Fetch loyalty points balance
    this.customerLoyaltyPoints.set(null);
    if (bill.mobile || bill.emailId) {
      this.apiService.lookupCustomer({ mobile: bill.mobile, emailId: bill.emailId }).subscribe({
        next: (cust) => {
          if (cust) {
            this.customerLoyaltyPoints.set(cust.loyaltyPoints);
          }
        },
        error: () => {}
      });
    }
  }

  closeDetailsModal() {
    this.showDetailsModal.set(false);
    this.selectedBill.set(null);
    this.selectedBillRestaurant.set(null);
  }

  updateBillStatus(bill: Billing, newStatus: 'paid' | 'pending' | 'overdue') {
    this.apiService.updateBill(bill.id!, { status: newStatus }).subscribe({
      next: () => {
        bill.status = newStatus;
        const currentSelected = this.selectedBill();
        if (currentSelected && currentSelected.id === bill.id) {
          currentSelected.status = newStatus;
          this.selectedBill.set({ ...currentSelected });
        }
        this.filterBills();
      },
      error: (err) => {
        console.error('Error updating bill status:', err);
        alert('Failed to update status.');
      }
    });
  }

  deleteBill(id?: string) {
    if (!id) return;
    this.isLoading.set(true);
    this.apiService.deleteBill(id).subscribe({
      next: () => {
        this.fetchBillsOnly();
        if (this.showDetailsModal() && this.selectedBill()?.id === id) {
          this.closeDetailsModal();
        }
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error deleting bill:', err);
        alert('Failed to delete invoice.');
        this.isLoading.set(false);
      }
    });
  }

  printReceipt() {
    const printContent = document.getElementById('receipt-print-area');
    if (!printContent) return;
    
    const originalContent = document.body.innerHTML;
    document.body.innerHTML = printContent.innerHTML;
    window.print();
    document.body.innerHTML = originalContent;
    
    window.location.reload();
  }
}
