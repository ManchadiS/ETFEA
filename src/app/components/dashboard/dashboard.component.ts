import { Component, inject, OnInit, signal, effect, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService, Restaurant, FoodItem, Expense, Billing } from '../../services/api.service';
import { forkJoin } from 'rxjs';
import { RouterLink } from '@angular/router';

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
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit {
  private apiService = inject(ApiService);

  // States using Signals
  restaurants = signal<Restaurant[]>([]);
  foodItems = signal<FoodItem[]>([]);
  bills = signal<Billing[]>([]);
  expenses = signal<Expense[]>([]);

  isLoading = signal<boolean>(false);

  totalRevenue = signal<number>(0);
  totalExpenses = signal<number>(0);
  netProfit = signal<number>(0);
  profitMargin = signal<number>(0);
  
  recentTransactions = signal<TransactionItem[]>([]);
  expenseCategories = signal<CategoryCost[]>([]);

  chartBars = signal<any[]>([]);
  chartDonutArcs = signal<any[]>([]);

  showReportModal = signal<boolean>(false);
  reportTab = signal<'daily' | 'monthly'>('daily');

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

  todayBills = computed(() => {
    const tStr = this.todayStr();
    return this.bills().filter(b => b.date === tStr);
  });

  currentMonthBills = computed(() => {
    const mStr = this.currentMonthStr();
    return this.bills().filter(b => b.date && b.date.startsWith(mStr));
  });

  todaySummary = computed(() => {
    const list = this.todayBills();
    const subtotal = list.reduce((sum, b) => sum + (b.amount || 0), 0);
    const tax = list.reduce((sum, b) => sum + ((b.cgst || 0) + (b.sgst || 0)), 0);
    const total = subtotal + tax;
    return { count: list.length, subtotal, tax, total };
  });

  currentMonthSummary = computed(() => {
    const list = this.currentMonthBills();
    const subtotal = list.reduce((sum, b) => sum + (b.amount || 0), 0);
    const tax = list.reduce((sum, b) => sum + ((b.cgst || 0) + (b.sgst || 0)), 0);
    const total = subtotal + tax;
    return { count: list.length, subtotal, tax, total };
  });

  openReportModal() {
    console.log('openReportModal called, current value:', this.showReportModal());
    this.showReportModal.set(true);
    console.log('openReportModal set to true, new value:', this.showReportModal());
  }

  closeReportModal() {
    console.log('closeReportModal called');
    this.showReportModal.set(false);
  }

  setReportTab(tab: 'daily' | 'monthly') {
    console.log('setReportTab called with:', tab);
    this.reportTab.set(tab);
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

  downloadBillsExcel(type: 'daily' | 'monthly') {
    const list = type === 'daily' ? this.todayBills() : this.currentMonthBills();
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
      headers.join(','),
      ...rows.map(row => row.map(cell => this.escapeCSV(cell)).join(','))
    ];
    const csvContent = csvRows.join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const filename = type === 'daily' 
      ? `bills_report_daily_${this.todayStr()}.csv` 
      : `bills_report_monthly_${this.currentMonthStr()}.csv`;
    
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

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
        this.bills.set(res.bills);
        this.expenses.set(res.expenses);

        this.calculateMetrics();
        this.compileRecentTransactions();
        this.compileExpenseCategories();
        this.generateSvgCharts();
        
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error fetching dashboard data:', err);
        this.isLoading.set(false);
      }
    });
  }

  calculateMetrics() {
    const billList = this.bills();
    const expenseList = this.expenses();

    const revenue = billList.reduce((sum, b) => {
      const amt = b.amount || 0;
      const tax = (b.cgst || 0) + (b.sgst || 0);
      return sum + amt + tax;
    }, 0);
    this.totalRevenue.set(revenue);

    const expensesSum = expenseList.reduce((sum, e) => sum + (e.amount || 0), 0);
    this.totalExpenses.set(expensesSum);

    const profit = revenue - expensesSum;
    this.netProfit.set(profit);

    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    this.profitMargin.set(margin);
  }

  compileRecentTransactions() {
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
    this.recentTransactions.set(list.slice(0, 5));
  }

  compileExpenseCategories() {
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
    this.expenseCategories.set(categoryList);
  }

  generateSvgCharts() {
    this.generateRevenueBarChart();
    this.generateExpenseDonutChart();
  }

  generateRevenueBarChart() {
    const billList = this.bills();
    const expenseList = this.expenses();
    const dailyData = new Map<string, { revenue: number; expense: number }>();
    
    const dateLabels: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      dateLabels.push(dateStr);
      dailyData.set(dateStr, { revenue: 0, expense: 0 });
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
    const barSpacing = 70;
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

    this.chartBars.set(bars);
  }

  generateExpenseDonutChart() {
    const totalExp = this.totalExpenses();
    const categoriesList = this.expenseCategories();
    
    if (totalExp === 0) {
      this.chartDonutArcs.set([]);
      return;
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

    this.chartDonutArcs.set(arcs);
  }
}
