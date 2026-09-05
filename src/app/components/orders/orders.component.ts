import { Component, inject, OnInit, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, Order, OrderItem, FoodItem, Billing, Customer, Restaurant } from '../../services/api.service';
import { forkJoin } from 'rxjs';

function getTodayDateString(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

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
  currentUserEmail = computed(() => this.apiService.currentUser()?.email);

  // Date filter state (defaults to today)
  startDate = signal<string>(getTodayDateString());
  endDate = signal<string>(getTodayDateString());

  filteredOrders = computed(() => {
    let list = [...this.orders()];
    const start = this.startDate();
    const end = this.endDate();

    if (start) {
      list = list.filter(order => {
        const orderDate = order.date || (order.createdAt ? order.createdAt.split('T')[0] : '');
        return orderDate >= start;
      });
    }

    if (end) {
      list = list.filter(order => {
        const orderDate = order.date || (order.createdAt ? order.createdAt.split('T')[0] : '');
        return orderDate <= end;
      });
    }

    // Sort in descending order (by orderNumber descending, fallback to createdAt/date descending)
    list.sort((a, b) => {
      const aNum = a.orderNumber || 0;
      const bNum = b.orderNumber || 0;
      if (aNum !== bNum) return bNum - aNum;

      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });

    return list;
  });

  digitalPayments = computed(() => {
    return this.filteredOrders().filter(order => order.paymentMode === 'Razorpay' || order.paymentMode === 'UPI');
  });

  clearDateFilter() {
    this.startDate.set('');
    this.endDate.set('');
  }

  // Modal signals
  showModal = signal<boolean>(false);
  isEditing = signal<boolean>(false);
  currentOrderId = signal<string | null>(null);

  // Form signals
  tableNo = signal<string>('');
  mobile = signal<string>('');
  emailId = signal<string>('');
  orderItems = signal<OrderItem[]>([]);

  // 6 Pre-set Value Combos from Menu Poster
  presetCombos = [
    {
      comboNumber: '1',
      name: 'Combo 1: Sandwich + Fries + Milk Shake',
      itemsText: 'Sandwich + Fries + Milk Shake',
      price: 290,
      image: '/assets/combos/combo_1.png',
      badge: '🔥 Bestseller',
      themeColor: '#f59e0b',
      bgGradient: 'linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(217, 119, 6, 0.05) 100%)',
      borderColor: 'rgba(245, 158, 11, 0.4)',
      short: '1. Sandwich+Fries+Shake (₹290)'
    },
    {
      comboNumber: '2',
      name: 'Combo 2: Sandwich + Cold Coffee',
      itemsText: 'Sandwich + Cold Coffee',
      price: 180,
      image: '/assets/combos/combo_2.png',
      badge: '☕ Quick Bite',
      themeColor: '#ea580c',
      bgGradient: 'linear-gradient(135deg, rgba(234, 88, 12, 0.15) 0%, rgba(194, 65, 12, 0.05) 100%)',
      borderColor: 'rgba(234, 88, 12, 0.4)',
      short: '2. Sandwich+Coffee (₹180)'
    },
    {
      comboNumber: '3',
      name: 'Combo 3: Sandwich + Tea + Fries',
      itemsText: 'Sandwich + Tea + Fries',
      price: 200,
      image: '/assets/combos/combo_3.png',
      badge: '🍵 Chai Lover',
      themeColor: '#16a34a',
      bgGradient: 'linear-gradient(135deg, rgba(22, 163, 74, 0.15) 0%, rgba(21, 128, 61, 0.05) 100%)',
      borderColor: 'rgba(22, 163, 74, 0.4)',
      short: '3. Sandwich+Tea+Fries (₹200)'
    },
    {
      comboNumber: '4',
      name: 'Combo 4: Biryani + Coke',
      itemsText: 'Biryani + Coke',
      price: 230,
      image: '/assets/combos/combo_4.png',
      badge: '🍗 Desi Tadka',
      themeColor: '#0284c7',
      bgGradient: 'linear-gradient(135deg, rgba(2, 132, 199, 0.15) 0%, rgba(3, 105, 161, 0.05) 100%)',
      borderColor: 'rgba(2, 132, 199, 0.4)',
      short: '4. Biryani+Coke (₹230)'
    },
    {
      comboNumber: '5',
      name: 'Combo 5: Chicken Drumstick (2pc) + Fries + Milk Shake',
      itemsText: 'Chicken Drumstick (2pc) + Fries + Milk Shake',
      price: 450,
      image: '/assets/combos/combo_5.png',
      badge: '👑 Feast Combo',
      themeColor: '#7c3aed',
      bgGradient: 'linear-gradient(135deg, rgba(124, 58, 237, 0.15) 0%, rgba(109, 40, 217, 0.05) 100%)',
      borderColor: 'rgba(124, 58, 237, 0.4)',
      short: '5. Drumstick+Fries+Shake (₹450)'
    },
    {
      comboNumber: '⭐',
      name: 'Tadka Special: Drum Stick (1pc) + Paneer Tikka (2pc) + Dahi Kebab (2pc) + Milk Shake',
      itemsText: 'Drum Stick (1pc) + Paneer Tikka (2pc) + Dahi Kebab (2pc) + Milk Shake',
      price: 350,
      image: '/assets/combos/combo_6.png',
      badge: '⭐ Special Platter',
      themeColor: '#eab308',
      bgGradient: 'linear-gradient(135deg, rgba(234, 179, 8, 0.2) 0%, rgba(161, 98, 7, 0.08) 100%)',
      borderColor: 'rgba(234, 179, 8, 0.6)',
      short: '⭐ Tadka Special Platter (₹350)'
    }
  ];

  openNewOrderWithCombo(combo: { name: string; price: number }) {
    this.openAddModal();
    this.addPresetCombo(combo);
  }

  addPresetCombo(combo: { name: string; price: number }) {
    const current = [...this.orderItems()];
    const idx = current.findIndex(i => i.name === combo.name);
    if (idx !== -1) {
      current[idx].quantity += 1;
    } else {
      current.push({
        name: combo.name,
        price: combo.price,
        quantity: 1
      });
    }
    this.orderItems.set(current);
  }

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
    return Math.round(sum * 0.90);
  }
  selectedQuantity = 1;
  status = signal<'pending_payment' | 'received' | 'preparing' | 'ready' | 'completed' | 'cancelled'>('received');
  discount = signal<number>(0);
 
  // Billing confirmation modal signals
  showCreateBillModal = signal<boolean>(false);
  billingOrder = signal<Order | null>(null);
  billingItems = signal<OrderItem[]>([]);
  billingDiscount = signal<number>(0);
  billingPaymentMode = signal<string>('Cash');
  billingCashAmount = signal<number>(0);
  billingUpiAmount = signal<number>(0);

  get billingItemsTotal(): number {
    return this.billingItems().reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }

  get billingGrandTotal(): number {
    return this.billingItemsTotal * (1 - this.billingDiscount() / 100);
  }

  updateBillingItemPrice(index: number, newPrice: number) {
    const items = [...this.billingItems()];
    if (items[index]) {
      items[index].price = Math.max(0, Number(newPrice) || 0);
      this.billingItems.set(items);
    }
  }

  adjustBillingItemQty(index: number, change: number) {
    const items = [...this.billingItems()];
    if (items[index]) {
      items[index].quantity += change;
      if (items[index].quantity <= 0) {
        items.splice(index, 1);
      }
      this.billingItems.set(items);
    }
  }

  removeBillingItem(index: number) {
    const items = [...this.billingItems()];
    items.splice(index, 1);
    this.billingItems.set(items);
  }

  // Bill Details Modal signals
  showDetailsModal = signal<boolean>(false);
  selectedBill = signal<Billing | null>(null);
  selectedBillRestaurant = signal<Restaurant | null>(null);
  customerLoyaltyPoints = signal<number | null>(null);
  restaurants = signal<Restaurant[]>([]);

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
    this.loadRestaurants();
  }

  loadRestaurants() {
    this.apiService.getRestaurants().subscribe({
      next: (data) => {
        this.restaurants.set(data);
      },
      error: (err) => {
        console.error('Error loading restaurants:', err);
      }
    });
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
        
        // Update shared count of incomplete orders of today
        const today = getTodayDateString();
        const count = res.orders.filter(o => {
          const orderDate = o.date || (o.createdAt ? o.createdAt.split('T')[0] : '');
          return orderDate === today && o.status !== 'completed' && o.status !== 'cancelled';
        }).length;
        this.apiService.todayIncompleteOrdersCount.set(count);
        
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
    // Apply 10% combo discount
    const finalPrice = Math.round(rawPrice * 0.90);

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
      date: new Date().toLocaleDateString('sv'),
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
    this.billingItems.set((order.items || []).map(i => ({ ...i })));
    this.billingDiscount.set(0);
    this.billingPaymentMode.set(order.paymentMode || 'Cash');
    this.billingCashAmount.set(0);
    this.billingUpiAmount.set(0);
    this.showCreateBillModal.set(true);
  }

  closeCreateBillModal() {
    this.showCreateBillModal.set(false);
    this.billingOrder.set(null);
    this.billingItems.set([]);
  }

  confirmCreateBill() {
    const order = this.billingOrder();
    if (!order) return;

    if (this.billingItems().length === 0) {
      this.errorMessage.set('Invoice must contain at least one food item.');
      return;
    }

    const discount = this.billingDiscount();
    const cgstRate = 2.5;
    const sgstRate = 2.5;
    const grandTotal = this.billingGrandTotal;
    const cgstAmount = Math.round((grandTotal * cgstRate) / (100 + cgstRate + sgstRate) * 100) / 100;
    const sgstAmount = Math.round((grandTotal * sgstRate) / (100 + cgstRate + sgstRate) * 100) / 100;
    const subtotal = grandTotal - cgstAmount - sgstAmount;

    const mode = this.billingPaymentMode();
    let cashAmt = 0;
    let upiAmt = 0;

    if (mode === 'Cash') {
      const finalUpi = Math.min(grandTotal, Math.max(0, this.billingUpiAmount()));
      upiAmt = finalUpi;
      cashAmt = grandTotal - finalUpi;
    } else if (mode === 'UPI') {
      const finalCash = Math.min(grandTotal, Math.max(0, this.billingCashAmount()));
      cashAmt = finalCash;
      upiAmt = grandTotal - finalCash;
    }

    const billPayload: Billing = {
      amount: subtotal,
      restaurantId: order.restaurantId,
      date: new Date().toLocaleDateString('sv'),
      description: order.tableNo ? `Order from ${order.tableNo}` : 'Live Order',
      status: 'paid',
      mobile: order.mobile || undefined,
      emailId: order.emailId || undefined,
      cgst: cgstAmount,
      sgst: sgstAmount,
      foodItems: this.billingItems(),
      orderNumber: order.orderNumber,
      discount: discount,
      paymentMode: mode,
      cashAmount: cashAmt,
      upiAmount: upiAmt
    };

    this.isSubmitting.set(true);
    this.apiService.createBill(billPayload).subscribe({
      next: (createdBill) => {
        if (order.id) {
          this.apiService.updateOrder(order.id, { 
            status: 'completed',
            items: this.billingItems(),
            totalAmount: grandTotal
          }).subscribe({
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

  viewBillDetails(order: Order) {
    if (!order.orderNumber) {
      this.showMessage('No order number found for this ticket.', 'error');
      return;
    }
    
    this.isLoading.set(true);
    const restId = this.selectedRestaurantId();
    this.apiService.getBills(restId).subscribe({
      next: (bills) => {
        const bill = bills.find(b => b.orderNumber === order.orderNumber);
        this.isLoading.set(false);
        if (bill) {
          this.selectedBill.set(bill);
          this.selectedBillRestaurant.set(this.restaurants().find(r => r.id === bill.restaurantId) || null);
          this.showDetailsModal.set(true);
          
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
        } else {
          this.showMessage(`No bill generated yet for Order #${order.orderNumber}.`, 'error');
        }
      },
      error: (err) => {
        console.error('Error fetching bills:', err);
        this.isLoading.set(false);
        this.showMessage('Failed to fetch billing details.', 'error');
      }
    });
  }

  closeDetailsModal() {
    this.showDetailsModal.set(false);
    this.selectedBill.set(null);
    this.selectedBillRestaurant.set(null);
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
