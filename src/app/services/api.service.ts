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
}

export interface Expense {
  id?: string;
  restaurantId?: string;
  amount: number;
  description?: string;
  date?: string;
  category?: string;
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

export interface EmailStatus {
  configured: boolean;
  service: string;
  emailUser: string;
  totalSent: number;
  totalFailed: number;
  totalLogs: number;
}

export interface User {
  id?: string;
  firstName: string;
  lastName: string;
  email: string;
  password?: string;
  dob: string;
  age: number;
}

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private http = inject(HttpClient);
  private baseUrl = 'http://localhost:3001';

  // Global active restaurant selection state
  selectedRestaurantId = signal<string>('');

  // User Authentication State
  currentUser = signal<User | null>(this.loadStoredUser());

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

  updateFoodItem(id: string, item: FoodItem): Observable<any> {
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

  login(credentials: { email: string; password?: string }): Observable<User> {
    return this.http.post<User>(`${this.baseUrl}/users/login`, credentials);
  }

  register(user: User): Observable<User> {
    return this.http.post<User>(`${this.baseUrl}/users/register`, user);
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
}
