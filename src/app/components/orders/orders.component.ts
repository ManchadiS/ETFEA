import { Component, inject, OnInit, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, Order, OrderItem, FoodItem, Billing, Customer } from '../../services/api.service';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './orders.component.html',
  styleUrl: './orders.component.css'
})
export class OrdersComponent implements OnInit {
  private apiService = inject(ApiService);

  // Core signals
  orders = signal<Order[]>([]);
  allDishes = signal<FoodItem[]>([]);
  isLoading = signal<boolean>(false);
  isSubmitting = signal<boolean>(false);
  errorMessage = signal<string>('');
  successMessage = signal<string>('');
  activeTab = signal<'kitchen' | 'payments'>('kitchen');

  digitalPayments = computed(() => {
    return this.orders().filter(order => order.paymentMode === 'Razorpay' || order.paymentMode === 'UPI');
  });

  // Modal signals
  showModal = signal<boolean>(false);
  isEditing = signal<boolean>(false);
  currentOrderId = signal<string | null>(null);

  // Form signals
  tableNo = signal<string>('');
  mobile = signal<string>('');
  emailId = signal<string>('');
  orderItems = signal<OrderItem[]>([]);

  // Combo builder state
  selectedShawarmaId = signal<string>('');
  selectedSideId = signal<string>('');
  selectedBeverageId = signal<string>('');
  comboQuantity = signal<number>(1);
  showMenuPostersModal = signal<boolean>(false);
  activePosterTab = signal<string>('meal');

  shawarmas = computed(() => {
    return this.allDishes().filter(f => f.category?.toLowerCase() === 'shawarma');
  });

  sides = computed(() => {
    return this.allDishes().filter(f => f.category?.toLowerCase() === 'sides');
  });

  beverages = computed(() => {
    return this.allDishes().filter(f => f.category?.toLowerCase() === 'beverages');
  });

  get selectedShawarmaPrice(): number {
    const item = this.allDishes().find(f => f.id === this.selectedShawarmaId());
    return item ? item.price : 0;
  }

  get selectedSidePrice(): number {
    const item = this.allDishes().find(f => f.id === this.selectedSideId());
    return item ? item.price : 0;
  }

  get selectedBeveragePrice(): number {
    const item = this.allDishes().find(f => f.id === this.selectedBeverageId());
    return item ? item.price : 0;
  }

  get liveComboTotalPrice(): number {
    const sum = this.selectedShawarmaPrice + this.selectedSidePrice + this.selectedBeveragePrice;
    if (sum === 0) return 0;
    return Math.max(0, sum - 20);
  }
  selectedQuantity = 1;
  status = signal<'pending_payment' | 'received' | 'preparing' | 'ready' | 'completed' | 'cancelled'>('received');
  discount = signal<number>(0);
 
  // Billing confirmation modal signals
  showCreateBillModal = signal<boolean>(false);
  billingOrder = signal<Order | null>(null);
  billingDiscount = signal<number>(0);

  // Search autocomplete signals
  dishSearchQuery = signal<string>('');
  showSuggestions = signal<boolean>(false);

  // Customer suggestion signals
  allCustomers = signal<Customer[]>([]);
  mobileSuggestions = signal<Customer[]>([]);
  emailSuggestions = signal<Customer[]>([]);
  showMobileSuggestions = signal<boolean>(false);
  showEmailSuggestions = signal<boolean>(false);
  selectedFoodItemId = '';

  // Track active restaurant change
  selectedRestaurantId = this.apiService.selectedRestaurantId;

  constructor() {
    // Reload orders when the active restaurant changes
    effect(() => {
      const restId = this.selectedRestaurantId();
      this.loadOrders();
      this.loadDishes();
    });
  }

  ngOnInit() {
    this.loadOrders();
    this.loadDishes();
  }

  loadOrders() {
    this.isLoading.set(true);
    forkJoin({
      orders: this.apiService.getOrders(this.selectedRestaurantId()),
      customers: this.apiService.getCustomers()
    }).subscribe({
      next: (res) => {
        this.orders.set(res.orders);
        this.allCustomers.set(res.customers);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error fetching orders:', err);
        this.errorMessage.set('Failed to load orders.');
        this.isLoading.set(false);
      }
    });
  }

  loadDishes() {
    this.apiService.getFoodItems(this.selectedRestaurantId()).subscribe({
      next: (data) => {
        this.allDishes.set(data);
      },
      error: (err) => {
        console.error('Error loading menu dishes:', err);
      }
    });
  }

  getFilteredDishes(): FoodItem[] {
    const query = this.dishSearchQuery().toLowerCase().trim();
    if (!query) return this.allDishes();
    return this.allDishes().filter(dish => 
      dish.name.toLowerCase().includes(query) || 
      (dish.category || '').toLowerCase().includes(query)
    );
  }

  onDishSearchChange(event: Event) {
    const val = (event.target as HTMLInputElement).value;
    this.dishSearchQuery.set(val);
    this.showSuggestions.set(true);
  }

  onDishSearchFocus() {
    this.showSuggestions.set(true);
  }

  onDishSearchBlur() {
    setTimeout(() => {
      this.showSuggestions.set(false);
    }, 200);
  }

  selectDish(dish: FoodItem) {
    this.selectedFoodItemId = dish.id || '';
    this.dishSearchQuery.set(dish.name);
    this.showSuggestions.set(false);
  }

  addOrderItem() {
    const selectedId = this.selectedFoodItemId;
    if (!selectedId) {
      this.errorMessage.set('Please select a food item from the list.');
      return;
    }

    const dish = this.allDishes().find(d => d.id === selectedId);
    if (!dish) {
      this.errorMessage.set('Selected food item is invalid.');
      return;
    }

    if (this.selectedQuantity <= 0) {
      this.errorMessage.set('Quantity must be at least 1.');
      return;
    }

    const currentOrder = [...this.orderItems()];
    const existingIndex = currentOrder.findIndex(item => item.name === dish.name);

    if (existingIndex !== -1) {
      currentOrder[existingIndex].quantity += this.selectedQuantity;
    } else {
      currentOrder.push({
        name: dish.name,
        price: dish.price,
        quantity: this.selectedQuantity
      });
    }

    this.orderItems.set(currentOrder);
    this.selectedQuantity = 1;
    this.selectedFoodItemId = '';
    this.dishSearchQuery.set('');
    this.showSuggestions.set(false);
    this.errorMessage.set('');
  }

  addComboItem() {
    const shId = this.selectedShawarmaId();
    const sideId = this.selectedSideId();
    const bevId = this.selectedBeverageId();

    if (!shId || !sideId || !bevId) return;

    const sh = this.allDishes().find(f => f.id === shId);
    const side = this.allDishes().find(f => f.id === sideId);
    const bev = this.allDishes().find(f => f.id === bevId);

    if (!sh || !side || !bev) return;

    // Calculate sum of individual items
    const rawPrice = sh.price + side.price + bev.price;
    // Subtract ₹20 combo discount
    const finalPrice = Math.max(0, rawPrice - 20);

    const comboName = `Combo Meal (${sh.name} + ${side.name} + ${bev.name})`;

    const currentOrder = [...this.orderItems()];
    const existingIndex = currentOrder.findIndex(item => item.name === comboName);

    if (existingIndex > -1) {
      currentOrder[existingIndex].quantity += this.comboQuantity();
    } else {
      currentOrder.push({
        name: comboName,
        price: finalPrice,
        quantity: this.comboQuantity()
      });
    }

    this.orderItems.set(currentOrder);
    
    // Reset combo selection
    this.selectedShawarmaId.set('');
    this.selectedSideId.set('');
    this.selectedBeverageId.set('');
    this.comboQuantity.set(1);
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

  get totalAmount(): number {
    const raw = this.orderItems().reduce((sum, item) => sum + (item.price * item.quantity), 0);
    return raw - (raw * this.discount() / 100);
  }

  onMobileChange(val: string) {
    this.mobile.set(val);
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
      if (match && match.emailId && !this.emailId()) {
        this.emailId.set(match.emailId);
      }
    }
  }

  onEmailChange(val: string) {
    this.emailId.set(val);
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
      if (match && match.mobile && !this.mobile()) {
        this.mobile.set(match.mobile);
      }
    }
  }

  selectCustomerSuggestion(cust: Customer) {
    if (cust.mobile) {
      this.mobile.set(cust.mobile);
    }
    if (cust.emailId) {
      this.emailId.set(cust.emailId);
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

  openAddModal() {
    this.isEditing.set(false);
    this.currentOrderId.set(null);
    this.tableNo.set('');
    this.mobile.set('');
    this.emailId.set('');
    this.orderItems.set([]);
    this.selectedQuantity = 1;
    this.selectedFoodItemId = '';
    this.dishSearchQuery.set('');
    this.status.set('received');
    this.discount.set(0);
    this.errorMessage.set('');
    this.successMessage.set('');
    this.showModal.set(true);
  }

  openEditModal(order: Order) {
    this.isEditing.set(true);
    this.currentOrderId.set(order.id || null);
    this.tableNo.set(order.tableNo);
    this.mobile.set(order.mobile || '');
    this.emailId.set(order.emailId || '');
    this.orderItems.set(order.items.map(item => ({ ...item })));
    this.selectedQuantity = 1;
    this.selectedFoodItemId = '';
    this.dishSearchQuery.set('');
    this.status.set(order.status);
    this.discount.set(order.discount || 0);
    this.errorMessage.set('');
    this.successMessage.set('');
    this.showModal.set(true);
  }

  closeModal() {
    this.showModal.set(false);
  }

  submitOrder() {
    const restId = this.selectedRestaurantId();
    if (!restId) {
      this.errorMessage.set('Please select an active restaurant outlet in the top bar.');
      return;
    }

    if (!this.tableNo().trim()) {
      this.errorMessage.set('Please provide a table number (e.g. Table 5).');
      return;
    }

    if (this.orderItems().length === 0) {
      this.errorMessage.set('Please add at least one item to the order.');
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    const orderPayload: Order = {
      restaurantId: restId,
      tableNo: this.tableNo().trim(),
      mobile: this.mobile().trim() || undefined,
      emailId: this.emailId().trim() || undefined,
      items: this.orderItems(),
      status: this.status(),
      totalAmount: this.totalAmount,
      date: new Date().toISOString().split('T')[0],
      discount: this.discount()
    };

    if (this.isEditing() && this.currentOrderId()) {
      this.apiService.updateOrder(this.currentOrderId()!, orderPayload).subscribe({
        next: (updatedOrder) => {
          this.isSubmitting.set(false);
          this.showMessage('Order updated successfully!', 'success');
          this.closeModal();
          this.loadOrders();
        },
        error: (err) => {
          console.error('Error updating order:', err);
          this.errorMessage.set('Failed to update order.');
          this.isSubmitting.set(false);
        }
      });
    } else {
      this.apiService.createOrder(orderPayload).subscribe({
        next: (createdOrder) => {
          this.isSubmitting.set(false);
          this.showMessage('Order created successfully!', 'success');
          this.closeModal();
          this.loadOrders();
        },
        error: (err) => {
          console.error('Error creating order:', err);
          this.errorMessage.set('Failed to create order.');
          this.isSubmitting.set(false);
        }
      });
    }
  }

  deleteOrder(id: string) {
    if (confirm('Are you sure you want to delete this order?')) {
      this.apiService.deleteOrder(id).subscribe({
        next: () => {
          this.showMessage('Order deleted successfully!', 'success');
          this.loadOrders();
        },
        error: (err) => {
          console.error('Error deleting order:', err);
          this.errorMessage.set('Failed to delete order.');
        }
      });
    }
  }

  updateOrderStatus(order: Order, newStatus: 'received' | 'preparing' | 'ready' | 'completed' | 'cancelled') {
    if (!order.id) return;
    this.apiService.updateOrder(order.id, { status: newStatus }).subscribe({
      next: () => {
        this.showMessage(`Order marked as ${newStatus}!`, 'success');
        this.loadOrders();
      },
      error: (err) => {
        console.error('Error updating order status:', err);
        this.errorMessage.set('Failed to update status.');
      }
    });
  }

  openCreateBillModal(order: Order) {
    this.billingOrder.set(order);
    this.billingDiscount.set(0);
    this.showCreateBillModal.set(true);
  }

  closeCreateBillModal() {
    this.showCreateBillModal.set(false);
    this.billingOrder.set(null);
  }

  confirmCreateBill() {
    const order = this.billingOrder();
    if (!order) return;

    const discount = this.billingDiscount();
    const cgstRate = 2.5;
    const sgstRate = 2.5;
    const baseTotal = order.totalAmount;
    const grandTotal = baseTotal * (1 - discount / 100);
    const cgstAmount = Math.round((grandTotal * cgstRate) / (100 + cgstRate + sgstRate) * 100) / 100;
    const sgstAmount = Math.round((grandTotal * sgstRate) / (100 + cgstRate + sgstRate) * 100) / 100;
    const subtotal = grandTotal - cgstAmount - sgstAmount;

    const billPayload: Billing = {
      amount: subtotal,
      restaurantId: order.restaurantId,
      date: new Date().toISOString().split('T')[0],
      description: order.tableNo ? `Order from ${order.tableNo}` : 'Live Order',
      status: 'paid',
      mobile: order.mobile || undefined,
      emailId: order.emailId || undefined,
      cgst: cgstAmount,
      sgst: sgstAmount,
      foodItems: order.items.map(item => ({
        name: item.name,
        price: item.price,
        quantity: item.quantity
      })),
      orderNumber: order.orderNumber,
      discount: discount,
      paymentMode: order.paymentMode || 'Cash'
    };

    this.isSubmitting.set(true);
    this.apiService.createBill(billPayload).subscribe({
      next: (createdBill) => {
        if (order.id) {
          this.apiService.updateOrder(order.id, { status: 'completed' }).subscribe({
            next: () => {
              this.isSubmitting.set(false);
              this.closeCreateBillModal();
              this.showMessage(`Bill created successfully for Order #${order.orderNumber} (marked COMPLETED).`, 'success');
              this.loadOrders();
            },
            error: (err) => {
              console.error('Error updating order status:', err);
              this.isSubmitting.set(false);
              this.closeCreateBillModal();
              this.errorMessage.set('Failed to update order status to completed.');
            }
          });
        } else {
          this.isSubmitting.set(false);
          this.closeCreateBillModal();
          this.showMessage(`Bill created successfully for Order #${order.orderNumber}.`, 'success');
          this.loadOrders();
        }
      },
      error: (err) => {
        console.error('Error creating bill from order:', err);
        this.isSubmitting.set(false);
        this.closeCreateBillModal();
        this.errorMessage.set(err.error?.error || 'Failed to create bill from order.');
      }
    });
  }

  showMessage(msg: string, type: 'success' | 'error') {
    if (type === 'success') {
      this.successMessage.set(msg);
      setTimeout(() => this.successMessage.set(''), 4000);
    } else {
      this.errorMessage.set(msg);
      setTimeout(() => this.errorMessage.set(''), 4000);
    }
  }
}
