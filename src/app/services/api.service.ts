import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Restaurant {
  id?: string;
  name: string;
  address?: string;
}

export interface FoodItem {
  id?: string;
  restaurantId?: string;
  name: string;
  price: number;
  description?: string;
  category?: string;
  active?: boolean;
}

export interface FoodOrderItem {
  name: string;
  price: number;
  quantity: number;
  time?: string;
}

export interface Billing {
  id?: string;
  amount: number;
  restaurantId?: string;
  date?: string;
  description?: string;
  status: 'pending' | 'paid' | 'overdue';
  mobile?: string;
  emailId?: string;
  cgst?: number;
  sgst?: number;
  foodItems?: FoodOrderItem[];
  emailStatus?: string;
  emailError?: string;
  createdAt?: string;
  orderNumber?: number;
  discount?: number;
  paymentMode?: string;
  orderType?: string;
  cashAmount?: number;
  upiAmount?: number;
}

export interface Expense {
  id?: string;
  restaurantId?: string;
  amount: number;
  description?: string;
  date?: string;
  category?: string;
  imageUrl?: string;
  createdBy?: string;
  updatedBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Payout {
  id?: string;
  restaurantId?: string;
  platform: 'Swiggy' | 'Zomato';
  amount: number;
  date: string;
  referenceNumber?: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Wastage {
  id?: string;
  restaurantId?: string;
  inventoryItemId: string;
  inventoryItemName: string;
  quantity: number;
  date: string;
  reason?: string;
  amount: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface EmailLog {
  to: string;
  timestamp: string;
  status: 'sent' | 'failed' | 'logged' | 'pending';
  subject: string;
  billData: {
    billId?: string;
    amount: number;
    cgst: number;
    sgst: number;
    total: number;
    itemCount: number;
    status: string;
    date?: string;
    contact?: string;
  };
  error?: string | null;
}

export interface PurchaseBillItem {
  inventoryItemId: string;
  name: string;
  quantity: number;
  unit: string;
  pricePerUnit: number;
  total: number;
}

export interface PurchaseBill {
  id?: string;
  restaurantId: string;
  supplierName: string;
  billNumber?: string;
  date?: string;
  items: PurchaseBillItem[];
  totalAmount: number;
  paymentMode?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface EmailStatus {
  configured: boolean;
  service: string;
  emailUser: string;
  totalSent: number;
  totalFailed: number;
  totalLogs: number;
  useDb?: boolean;
  dbConnected?: boolean;
}

export interface UserRights {
  sidebarAccess: string[];
  deleteAccess: boolean;
}

export interface User {
  id?: string;
  firstName: string;
  lastName: string;
  email: string;
  password?: string;
  dob: string;
  age: number;
  role?: string;
  rights?: UserRights;
  token?: string;
}

export interface Role {
  id?: string;
  name: string;
  sidebarAccess: string[];
  deleteAccess: boolean;
}

export interface InventoryItem {
  id?: string;
  restaurantId: string;
  name: string;
  quantity?: number;
  unit?: string;
  threshold?: number;
}

export interface OrderItem {
  name: string;
  price: number;
  quantity: number;
}

export interface Order {
  id?: string;
  restaurantId: string;
  tableNo: string;
  items: OrderItem[];
  status: 'pending_payment' | 'received' | 'preparing' | 'ready' | 'completed' | 'cancelled';
  totalAmount: number;
  date?: string;
  createdAt?: string;
  mobile?: string;
  emailId?: string;
  orderNumber?: number;
  discount?: number;
  orderType?: 'dinein' | 'takeaway';
  paymentMode?: 'Cash' | 'UPI' | 'Razorpay';
  paymentStatus?: 'pending' | 'paid' | 'failed';
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  cashAmount?: number;
  upiAmount?: number;
}

export interface Customer {
  id?: string;
  mobile?: string;
  emailId?: string;
  loyaltyPoints?: number;
}

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private http = inject(HttpClient);
  private baseUrl = 'https://api.engineeringtadka.com/api/v1'; //prod url
  // private baseUrl = 'http://localhost:3000/api/v1';

  // Global active restaurant selection state
  selectedRestaurantId = signal<string>('');

  // Count of incomplete orders of today
  todayIncompleteOrdersCount = signal<number>(0);

  // User Authentication State
  currentUser = signal<User | null>(this.loadStoredUser());

  // Global cart visibility and items state
  orderItems = signal<OrderItem[]>([]);
  showCartDrawer = signal<boolean>(false);

  private loadStoredUser(): User | null {
    try {
      const data = localStorage.getItem('currentUser');
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  setCurrentUser(user: User | null) {
    if (user) {
      localStorage.setItem('currentUser', JSON.stringify(user));
    } else {
      localStorage.removeItem('currentUser');
    }
    this.currentUser.set(user);
  }

  // RESTAURANTS
  getRestaurants(): Observable<Restaurant[]> {
    return this.http.get<Restaurant[]>(`${this.baseUrl}/restaurants`);
  }

  createRestaurant(restaurant: Restaurant): Observable<Restaurant> {
    return this.http.post<Restaurant>(`${this.baseUrl}/restaurants`, restaurant);
  }

  updateRestaurant(id: string, restaurant: Restaurant): Observable<any> {
    return this.http.put(`${this.baseUrl}/restaurants/${id}`, restaurant);
  }

  deleteRestaurant(id: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/restaurants/${id}`, { responseType: 'text' });
  }

  // FOOD ITEMS / MENU
  getFoodItems(restaurantId?: string): Observable<FoodItem[]> {
    const params: Record<string, string> = {};
    if (restaurantId) params['restaurantId'] = restaurantId;
    return this.http.get<FoodItem[]>(`${this.baseUrl}/food`, { params });
  }

  createFoodItem(item: FoodItem): Observable<FoodItem> {
    return this.http.post<FoodItem>(`${this.baseUrl}/food`, item);
  }

  updateFoodItem(id: string, item: Partial<FoodItem>): Observable<any> {
    return this.http.put(`${this.baseUrl}/food/${id}`, item);
  }

  deleteFoodItem(id: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/food/${id}`, { responseType: 'text' });
  }

  // EXPENSES
  getExpenses(restaurantId?: string): Observable<Expense[]> {
    const params: Record<string, string> = {};
    if (restaurantId) params['restaurantId'] = restaurantId;
    return this.http.get<Expense[]>(`${this.baseUrl}/expenses`, { params });
  }

  createExpense(expense: Expense): Observable<Expense> {
    return this.http.post<Expense>(`${this.baseUrl}/expenses`, expense);
  }

  updateExpense(id: string, expense: Expense): Observable<any> {
    return this.http.put(`${this.baseUrl}/expenses/${id}`, expense);
  }

  deleteExpense(id: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/expenses/${id}`, { responseType: 'text' });
  }

  // PAYOUTS
  getPayouts(restaurantId?: string): Observable<Payout[]> {
    const params: Record<string, string> = {};
    if (restaurantId) params['restaurantId'] = restaurantId;
    return this.http.get<Payout[]>(`${this.baseUrl}/payouts`, { params });
  }

  createPayout(payout: Payout): Observable<Payout> {
    return this.http.post<Payout>(`${this.baseUrl}/payouts`, payout);
  }

  updatePayout(id: string, payout: Partial<Payout>): Observable<any> {
    return this.http.put(`${this.baseUrl}/payouts/${id}`, payout);
  }

  deletePayout(id: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/payouts/${id}`, { responseType: 'text' });
  }

  // WASTAGE
  getWastages(restaurantId?: string): Observable<Wastage[]> {
    const params: Record<string, string> = {};
    if (restaurantId) params['restaurantId'] = restaurantId;
    return this.http.get<Wastage[]>(`${this.baseUrl}/wastage`, { params });
  }

  createWastage(wastage: Wastage): Observable<Wastage> {
    return this.http.post<Wastage>(`${this.baseUrl}/wastage`, wastage);
  }

  updateWastage(id: string, wastage: Partial<Wastage>): Observable<any> {
    return this.http.put(`${this.baseUrl}/wastage/${id}`, wastage);
  }

  deleteWastage(id: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/wastage/${id}`, { responseType: 'text' });
  }

  uploadExpenseImage(file: File): Observable<{ imageUrl: string }> {
    const formData = new FormData();
    formData.append('image', file);
    return this.http.post<{ imageUrl: string }>(`${this.baseUrl}/expenses/upload`, formData);
  }

  // BILLING / INVOICES
  getBills(restaurantId?: string): Observable<Billing[]> {
    const params: Record<string, string> = {};
    if (restaurantId) params['restaurantId'] = restaurantId;
    return this.http.get<Billing[]>(`${this.baseUrl}/billing`, { params });
  }

  createBill(bill: Billing): Observable<Billing> {
    return this.http.post<Billing>(`${this.baseUrl}/billing`, bill);
  }

  updateBill(id: string, bill: Partial<Billing>): Observable<any> {
    return this.http.put(`${this.baseUrl}/billing/${id}`, bill);
  }

  deleteBill(id: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/billing/${id}`, { responseType: 'text' });
  }

  // USERS / AUTH
  getUsers(): Observable<User[]> {
    return this.http.get<User[]>(`${this.baseUrl}/users`);
  }

  createUser(user: User): Observable<User> {
    return this.http.post<User>(`${this.baseUrl}/users`, user);
  }

  updateUser(id: string, user: Partial<User>): Observable<any> {
    return this.http.put(`${this.baseUrl}/users/${id}`, user);
  }

  deleteUser(id: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/users/${id}`, { responseType: 'text' });
  }

  // ROLES & RIGHTS
  getRoles(): Observable<Role[]> {
    return this.http.get<Role[]>(`${this.baseUrl}/roles`);
  }

  createRole(role: Role): Observable<Role> {
    return this.http.post<Role>(`${this.baseUrl}/roles`, role);
  }

  updateRole(id: string, role: Partial<Role>): Observable<Role> {
    return this.http.put<Role>(`${this.baseUrl}/roles/${id}`, role);
  }

  deleteRole(id: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/roles/${id}`, { responseType: 'text' });
  }

  login(credentials: { email: string; password?: string }): Observable<User> {
    return this.http.post<User>(`${this.baseUrl}/users/login`, credentials);
  }

  register(user: User): Observable<User> {
    return this.http.post<User>(`${this.baseUrl}/users/register`, user);
  }

  // INVENTORY
  getInventoryItems(restaurantId?: string): Observable<InventoryItem[]> {
    const params: Record<string, string> = {};
    if (restaurantId) params['restaurantId'] = restaurantId;
    return this.http.get<InventoryItem[]>(`${this.baseUrl}/inventory`, { params });
  }

  createInventoryItem(item: InventoryItem): Observable<InventoryItem> {
    return this.http.post<InventoryItem>(`${this.baseUrl}/inventory`, item);
  }

  updateInventoryItem(id: string, item: Partial<InventoryItem>): Observable<any> {
    return this.http.put(`${this.baseUrl}/inventory/${id}`, item);
  }

  deleteInventoryItem(id: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/inventory/${id}`, { responseType: 'text' });
  }

  // PURCHASE BILLS
  getPurchaseBills(restaurantId?: string): Observable<PurchaseBill[]> {
    const params: Record<string, string> = {};
    if (restaurantId) params['restaurantId'] = restaurantId;
    return this.http.get<PurchaseBill[]>(`${this.baseUrl}/purchase-bills`, { params });
  }

  createPurchaseBill(bill: PurchaseBill): Observable<PurchaseBill> {
    return this.http.post<PurchaseBill>(`${this.baseUrl}/purchase-bills`, bill);
  }

  getPurchaseBill(id: string): Observable<PurchaseBill> {
    return this.http.get<PurchaseBill>(`${this.baseUrl}/purchase-bills/${id}`);
  }

  // ORDERS
  getOrders(restaurantId?: string): Observable<Order[]> {
    const params: Record<string, string> = {};
    if (restaurantId) params['restaurantId'] = restaurantId;
    return this.http.get<Order[]>(`${this.baseUrl}/orders`, { params });
  }

  getOrder(id: string): Observable<Order> {
    return this.http.get<Order>(`${this.baseUrl}/orders/${id}`);
  }

  createOrder(order: Order): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/orders`, order);
  }

  updateOrder(id: string, order: Partial<Order>): Observable<any> {
    return this.http.put(`${this.baseUrl}/orders/${id}`, order);
  }

  deleteOrder(id: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/orders/${id}`, { responseType: 'text' });
  }

  // DEBUG & SYSTEM STATUS
  getEmailLogs(): Observable<{ total: number; emails: EmailLog[] }> {
    return this.http.get<{ total: number; emails: EmailLog[] }>(`${this.baseUrl}/debug/email-logs`);
  }

  getEmailStatus(): Observable<EmailStatus> {
    return this.http.get<EmailStatus>(`${this.baseUrl}/debug/email-status`);
  }

  clearEmailLogs(): Observable<{ message: string; count: number }> {
    return this.http.delete<{ message: string; count: number }>(`${this.baseUrl}/debug/email-logs`);
  }

  cleanDatabase(): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.baseUrl}/debug/clean-db`, {});
  }

  lookupCustomer(params: { mobile?: string; emailId?: string }): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/customers/lookup`, { params });
  }

  getCustomers(): Observable<Customer[]> {
    return this.http.get<Customer[]>(`${this.baseUrl}/customers`);
  }

  createCustomer(cust: Customer): Observable<Customer> {
    return this.http.post<Customer>(`${this.baseUrl}/customers`, cust);
  }

  updateCustomer(id: string, cust: Partial<Customer>): Observable<Customer> {
    return this.http.put<Customer>(`${this.baseUrl}/customers/${id}`, cust);
  }

  deleteCustomer(id: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/customers/${id}`, { responseType: 'text' });
  }

  verifyPayment(paymentDetails: {
    orderId: string;
    razorpayPaymentId: string;
    razorpayOrderId: string;
    razorpaySignature: string;
  }): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/orders/verify-payment`, paymentDetails);
  }
}
