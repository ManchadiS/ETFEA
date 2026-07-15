import { Component, inject, OnInit, signal, effect, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService, Restaurant, FoodItem, Expense, Billing } from '../../services/api.service';
import { forkJoin } from 'rxjs';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';

interface TransactionItem {
  type: 'invoice' | 'expense';
  id?: string;
  date: string;
  description: string;
  categoryOrStatus: string;
  amount: number;
}

interface CategoryCost {
  name: string;
  amount: number;
  percentage: number;
  color: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit {
  private apiService = inject(ApiService);

  // States using Signals
  restaurants = signal<Restaurant[]>([]);
  foodItems = signal<FoodItem[]>([]);
  rawBills = signal<Billing[]>([]);
  rawExpenses = signal<Expense[]>([]);

  isLoading = signal<boolean>(false);

  // Date filters
  activeQuickFilter = signal<string>('all');
  startDate = signal<string>('');
  endDate = signal<string>('');

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

  totalRevenue = computed(() => {
    return this.bills().reduce((sum, b) => {
      const amt = b.amount || 0;
      const tax = (b.cgst || 0) + (b.sgst || 0);
      return sum + amt + tax;
    }, 0);
  });

  totalExpenses = computed(() => {
    return this.expenses().reduce((sum, e) => sum + (e.amount || 0), 0);
  });

  netProfit = computed(() => {
    return this.totalRevenue() - this.totalExpenses();
  });

  profitMargin = computed(() => {
    const rev = this.totalRevenue();
    return rev > 0 ? (this.netProfit() / rev) * 100 : 0;
  });
  
  recentTransactions = computed(() => {
    const list: TransactionItem[] = [];
    const billList = this.bills();
    const expenseList = this.expenses();

    billList.forEach(b => {
      const grandTotal = (b.amount || 0) + (b.cgst || 0) + (b.sgst || 0);
      list.push({
        type: 'invoice',
        id: b.id,
        date: b.date || '',
        description: b.description || `Invoice #${b.id?.substring(0,6)}`,
        categoryOrStatus: b.status,
        amount: grandTotal
      });
    });

    expenseList.forEach(e => {
      list.push({
        type: 'expense',
        id: e.id,
        date: e.date || '',
        description: e.description || `Expense: ${e.category}`,
        categoryOrStatus: e.category || 'Others',
        amount: e.amount
      });
    });

    list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return list.slice(0, 5);
  });

  expenseCategories = computed(() => {
    const map = new Map<string, number>();
    const expenseList = this.expenses();
    const totalExp = this.totalExpenses();
    
    const colors: { [key: string]: string } = {
      'Salary': '#3b82f6',
      'Rent': '#a855f7',
      'Utilities': '#f59e0b',
      'Inventory': '#10b981',
      'Marketing': '#f43f5e',
      'Maintenance': '#64748b',
      'Others': '#94a3b8'
    };

    expenseList.forEach(e => {
      const cat = e.category || 'Others';
      map.set(cat, (map.get(cat) || 0) + e.amount);
    });

    const categoryList: CategoryCost[] = [];
    map.forEach((amount, name) => {
      categoryList.push({
        name,
        amount,
        percentage: totalExp > 0 ? (amount / totalExp) * 100 : 0,
        color: colors[name] || colors['Others']
      });
    });

    categoryList.sort((a, b) => b.amount - a.amount);
    return categoryList;
  });

  chartBars = computed(() => {
    const billList = this.bills();
    const expenseList = this.expenses();
    const dailyData = new Map<string, { revenue: number; expense: number }>();
    
    const dateLabels: string[] = [];
    const start = this.startDate();
    const end = this.endDate();
    
    if (start && end) {
      let curr = new Date(start);
      const stop = new Date(end);
      let count = 0;
      while (curr <= stop && count < 30) {
        const dateStr = curr.toISOString().split('T')[0];
        dateLabels.push(dateStr);
        dailyData.set(dateStr, { revenue: 0, expense: 0 });
        curr.setDate(curr.getDate() + 1);
        count++;
      }
    } else {
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        dateLabels.push(dateStr);
        dailyData.set(dateStr, { revenue: 0, expense: 0 });
      }
    }

    billList.forEach(b => {
      const dateStr = b.date;
      if (dateStr && dailyData.has(dateStr)) {
        const item = dailyData.get(dateStr)!;
        const grandTotal = (b.amount || 0) + (b.cgst || 0) + (b.sgst || 0);
        item.revenue += grandTotal;
      }
    });

    expenseList.forEach(e => {
      const dateStr = e.date;
      if (dateStr && dailyData.has(dateStr)) {
        const item = dailyData.get(dateStr)!;
        item.expense += e.amount;
      }
    });

    let maxVal = 1000;
    dailyData.forEach(val => {
      if (val.revenue > maxVal) maxVal = val.revenue;
      if (val.expense > maxVal) maxVal = val.expense;
    });

    maxVal = maxVal * 1.15;

    const chartHeight = 150;
    const barSpacing = dateLabels.length > 15 ? 35 : (dateLabels.length > 10 ? 50 : 70);
    const startX = 40;

    const bars: any[] = [];
    dateLabels.forEach((dateStr, idx) => {
      const val = dailyData.get(dateStr)!;
      const x = startX + idx * barSpacing;

      const heightRev = (val.revenue / maxVal) * chartHeight;
      const heightExp = (val.expense / maxVal) * chartHeight;

      const yRev = chartHeight - heightRev + 20;
      const yExp = chartHeight - heightExp + 20;

      const parts = dateStr.split('-');
      const label = `${parts[1]}-${parts[2]}`;

      bars.push({
        x,
        yRevenue: yRev,
        yExpense: yExp,
        heightRevenue: heightRev,
        heightExpense: heightExp,
        label,
        revenueVal: val.revenue,
        expenseVal: val.expense
      });
    });

    return bars;
  });

  chartDonutArcs = computed(() => {
    const totalExp = this.totalExpenses();
    const categoriesList = this.expenseCategories();
    
    if (totalExp === 0) {
      return [];
    }

    let cumulativePercent = 0;
    const arcs: any[] = [];
    
    const getCoordinatesForPercent = (percent: number) => {
      const x = Math.cos(2 * Math.PI * percent);
      const y = Math.sin(2 * Math.PI * percent);
      return [x, y];
    };

    categoriesList.forEach(cat => {
      const percent = cat.percentage / 100;
      
      const [startX, startY] = getCoordinatesForPercent(cumulativePercent);
      cumulativePercent += percent;
      const [endX, endY] = getCoordinatesForPercent(cumulativePercent);
      
      const largeArcFlag = percent > 0.5 ? 1 : 0;
      
      const r = 35;
      const cx = 50;
      const cy = 50;
      
      const x1 = cx + startX * r;
      const y1 = cy + startY * r;
      const x2 = cx + endX * r;
      const y2 = cy + endY * r;

      const pathData = `
        M ${x1} ${y1}
        A ${r} ${r} 0 ${largeArcFlag} 1 ${x2} ${y2}
      `;

      arcs.push({
        path: pathData,
        color: cat.color,
        name: cat.name,
        percentage: cat.percentage
      });
    });

    return arcs;
  });



  activeRestaurantName = computed(() => {
    const id = this.apiService.selectedRestaurantId();
    if (!id) return 'Select Outlet...';
    const rest = this.restaurants().find(r => r.id === id);
    return rest ? rest.name : 'Unknown Outlet';
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

  currentMonthStr = computed(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  });

  currentMonthName = computed(() => {
    const d = new Date();
    return d.toLocaleString('default', { month: 'long', year: 'numeric' });
  });

  billsSummary = computed(() => {
    const list = this.bills();
    const subtotal = list.reduce((sum, b) => sum + (b.amount || 0), 0);
    const tax = list.reduce((sum, b) => sum + ((b.cgst || 0) + (b.sgst || 0)), 0);
    const total = subtotal + tax;
    return { count: list.length, subtotal, tax, total };
  });



  constructor() {
    // Automatically refetch dashboard data whenever the active restaurant selection changes
    effect(() => {
      this.apiService.selectedRestaurantId();
      this.fetchDashboardData();
    });
  }

  ngOnInit() {
    // Handled by effect on initialization
  }

  fetchDashboardData() {
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
        console.error('Error fetching dashboard data:', err);
        this.isLoading.set(false);
      }
    });
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
