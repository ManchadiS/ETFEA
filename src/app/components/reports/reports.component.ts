import { Component, inject, OnInit, signal, effect, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService, Restaurant, FoodItem, Expense, Billing } from '../../services/api.service';
import { forkJoin } from 'rxjs';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reports.component.html',
  styleUrl: './reports.component.css'
})
export class ReportsComponent implements OnInit {
  private apiService = inject(ApiService);

  // Raw states loaded from API
  restaurants = signal<Restaurant[]>([]);
  foodItems = signal<FoodItem[]>([]);
  rawBills = signal<Billing[]>([]);
  rawExpenses = signal<Expense[]>([]);

  isLoading = signal<boolean>(false);

  // Date filters
  activeQuickFilter = signal<string>('all');
  startDate = signal<string>('');
  endDate = signal<string>('');

  // Active sub-sidebar tab
  reportTab = signal<'bills' | 'food_sales' | 'expenses'>('bills');

  // Filtered bills based on date filters
  bills = computed(() => {
    const start = this.startDate();
    const end = this.endDate();
    const list = this.rawBills();
    if (!start && !end) return list;
    return list.filter(b => {
      const d = b.date;
      if (!d) return false;
      if (start && d < start) return false;
      if (end && d > end) return false;
      return true;
    });
  });

  // Filtered expenses based on date filters
  expenses = computed(() => {
    const start = this.startDate();
    const end = this.endDate();
    const list = this.rawExpenses();
    if (!start && !end) return list;
    return list.filter(e => {
      const d = e.date;
      if (!d) return false;
      if (start && d < start) return false;
      if (end && d > end) return false;
      return true;
    });
  });

  totalExpenses = computed(() => {
    return this.expenses().reduce((sum, e) => sum + (e.amount || 0), 0);
  });

  billsSummary = computed(() => {
    const list = this.bills();
    const subtotal = list.reduce((sum, b) => sum + (b.amount || 0), 0);
    const tax = list.reduce((sum, b) => sum + ((b.cgst || 0) + (b.sgst || 0)), 0);
    const total = subtotal + tax;
    return { count: list.length, subtotal, tax, total };
  });

  foodSales = computed(() => {
    const salesMap = new Map<string, { price: number; quantity: number; revenue: number }>();
    
    this.foodItems().forEach(item => {
      salesMap.set(item.name, {
        price: item.price,
        quantity: 0,
        revenue: 0
      });
    });

    this.bills().forEach(bill => {
      if (bill.foodItems) {
        bill.foodItems.forEach(item => {
          let entry = salesMap.get(item.name);
          if (!entry) {
            entry = {
              price: item.price,
              quantity: 0,
              revenue: 0
            };
            salesMap.set(item.name, entry);
          }
          
          entry.quantity += item.quantity;
          entry.revenue += item.quantity * item.price;
        });
      }
    });

    return Array.from(salesMap.entries()).map(([name, data]) => ({
      name,
      ...data
    })).sort((a, b) => b.quantity - a.quantity);
  });

  totalFoodItemsSold = computed(() => {
    return this.foodSales().reduce((sum, item) => sum + item.quantity, 0);
  });

  totalFoodRevenue = computed(() => {
    return this.foodSales().reduce((sum, item) => sum + item.revenue, 0);
  });

  todayStr = computed(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });

  activeRestaurantName = computed(() => {
    const id = this.apiService.selectedRestaurantId();
    if (!id) return 'Select Outlet...';
    const rest = this.restaurants().find(r => r.id === id);
    return rest ? rest.name : 'Unknown Outlet';
  });

  constructor() {
    // Automatically refetch report data whenever the active restaurant selection changes
    effect(() => {
      this.apiService.selectedRestaurantId();
      this.fetchReportData();
    });
  }

  ngOnInit() {
    // Handled by effect on initialization
  }

  fetchReportData() {
    this.isLoading.set(true);
    const restId = this.apiService.selectedRestaurantId();
    forkJoin({
      restaurants: this.apiService.getRestaurants(),
      foodItems: this.apiService.getFoodItems(restId),
      bills: this.apiService.getBills(restId),
      expenses: this.apiService.getExpenses(restId)
    }).subscribe({
      next: (res) => {
        this.restaurants.set(res.restaurants);
        this.foodItems.set(res.foodItems);
        this.rawBills.set(res.bills);
        this.rawExpenses.set(res.expenses);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error fetching report data:', err);
        this.isLoading.set(false);
      }
    });
  }

  setReportTab(tab: 'bills' | 'food_sales' | 'expenses') {
    this.reportTab.set(tab);
  }

  downloadBillsExcel() {
    const list = this.bills();
    const outletName = this.activeRestaurantName();
    const headers = [
      'Bill ID',
      'Date',
      'Restaurant ID',
      'Subtotal (INR)',
      'CGST (INR)',
      'SGST (INR)',
      'Grand Total (INR)',
      'Status',
      'Mobile',
      'Email ID',
      'Description',
      'Food Items Ordered'
    ];

    const rows = list.map(b => {
      const grandTotal = (b.amount || 0) + (b.cgst || 0) + (b.sgst || 0);
      const itemsStr = b.foodItems ? b.foodItems.map(item => `${item.name} (${item.quantity}x @ ₹${item.price})`).join('; ') : '';
      return [
        b.id || '',
        b.date || '',
        b.restaurantId || '',
        b.amount || 0,
        b.cgst || 0,
        b.sgst || 0,
        grandTotal,
        b.status || '',
        b.mobile || '',
        b.emailId || '',
        b.description || '',
        itemsStr
      ];
    });

    const csvRows = [
      `Bills Report - ${outletName}`,
      `Date Range: ${this.startDate() && this.endDate() ? (this.startDate() + ' to ' + this.endDate()) : 'All Time'}`,
      `Generated on: ${this.todayStr()}`,
      '',
      headers.join(','),
      ...rows.map(row => row.map(cell => this.escapeCSV(cell)).join(','))
    ];
    const csvContent = csvRows.join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateRangeSuffix = this.startDate() && this.endDate() ? `${this.startDate()}_to_${this.endDate()}` : 'all_time';
    const filename = `bills_report_${outletName.toLowerCase().replace(/\s+/g, '_')}_${dateRangeSuffix}.csv`;
    
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  downloadFoodSalesExcel() {
    const list = this.foodSales();
    const outletName = this.activeRestaurantName();
    const headers = [
      'Food Item Name',
      'Price (INR)',
      'Quantity Sold',
      'Revenue (INR)'
    ];

    const rows = list.map(item => [
      item.name,
      item.price,
      item.quantity,
      item.revenue
    ]);

    const csvRows = [
      `Food Sales Report - ${outletName}`,
      `Date Range: ${this.startDate() && this.endDate() ? (this.startDate() + ' to ' + this.endDate()) : 'All Time'}`,
      `Generated on: ${this.todayStr()}`,
      '',
      headers.join(','),
      ...rows.map(row => row.map(cell => this.escapeCSV(cell)).join(','))
    ];
    
    const csvContent = csvRows.join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateRangeSuffix = this.startDate() && this.endDate() ? `${this.startDate()}_to_${this.endDate()}` : 'all_time';
    const filename = `food_sales_report_${outletName.toLowerCase().replace(/\s+/g, '_')}_${dateRangeSuffix}.csv`;
    
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  downloadExpensesExcel() {
    const list = this.expenses();
    const outletName = this.activeRestaurantName();
    const headers = [
      'Expense ID',
      'Date',
      'Restaurant ID',
      'Category',
      'Description',
      'Amount (INR)'
    ];

    const rows = list.map(e => [
      e.id || '',
      e.date || '',
      e.restaurantId || '',
      e.category || '',
      e.description || '',
      e.amount || 0
    ]);

    const csvRows = [
      `Expense Report - ${outletName}`,
      `Date Range: ${this.startDate() && this.endDate() ? (this.startDate() + ' to ' + this.endDate()) : 'All Time'}`,
      `Generated on: ${this.todayStr()}`,
      '',
      headers.join(','),
      ...rows.map(row => row.map(cell => this.escapeCSV(cell)).join(','))
    ];
    
    const csvContent = csvRows.join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateRangeSuffix = this.startDate() && this.endDate() ? `${this.startDate()}_to_${this.endDate()}` : 'all_time';
    const filename = `expense_report_${outletName.toLowerCase().replace(/\s+/g, '_')}_${dateRangeSuffix}.csv`;
    
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  private escapeCSV(val: any): string {
    if (val === undefined || val === null) return '';
    let str = String(val);
    str = str.replace(/"/g, '""');
    if (str.includes(',') || str.includes('\n') || str.includes('"')) {
      return `"${str}"`;
    }
    return str;
  }

  setQuickFilter(type: string) {
    this.activeQuickFilter.set(type);
    const today = new Date();
    
    if (type === 'all') {
      this.startDate.set('');
      this.endDate.set('');
    } else if (type === 'today') {
      const todayStr = this.formatDate(today);
      this.startDate.set(todayStr);
      this.endDate.set(todayStr);
    } else if (type === '7days') {
      const start = new Date();
      start.setDate(today.getDate() - 6);
      this.startDate.set(this.formatDate(start));
      this.endDate.set(this.formatDate(today));
    } else if (type === '30days') {
      const start = new Date();
      start.setDate(today.getDate() - 29);
      this.startDate.set(this.formatDate(start));
      this.endDate.set(this.formatDate(today));
    } else if (type === 'thismonth') {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      this.startDate.set(this.formatDate(start));
      this.endDate.set(this.formatDate(today));
    }
  }

  private formatDate(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  onStartDateChange(val: string) {
    this.startDate.set(val);
    this.activeQuickFilter.set('custom');
  }

  onEndDateChange(val: string) {
    this.endDate.set(val);
    this.activeQuickFilter.set('custom');
  }

  clearDateFilter() {
    this.setQuickFilter('all');
  }
}
