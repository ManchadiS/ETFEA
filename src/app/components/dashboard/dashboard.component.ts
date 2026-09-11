import { Component, inject, OnInit, signal, effect, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService, Restaurant, FoodItem, Expense, Billing, Payout, BankEntry, BankSummary } from '../../services/api.service';
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

export interface UnifiedBankLedgerItem {
  id?: string;
  sourceType: 'opening_balance' | 'upi_order' | 'swiggy_payout' | 'zomato_payout' | 'deposit' | 'deduction';
  isCredit: boolean;
  categoryLabel: string;
  amount: number;
  date: string;
  description: string;
  referenceNumber?: string;
  originalItem?: any;
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

  // Dashboard Main Tab Switcher ('overview' or 'bank')
  activeMainTab = signal<'overview' | 'bank'>('overview');

  hasDeleteAccess(): boolean {
    const user = this.apiService.currentUser();
    if (!user) return false;
    if (user.email === 'sagarmanchadi324@gmail.com' || user.role === 'Super Admin') {
      return true;
    }
    return user.rights?.deleteAccess || false;
  }

  // States using Signals
  restaurants = signal<Restaurant[]>([]);
  foodItems = signal<FoodItem[]>([]);
  rawBills = signal<Billing[]>([]);
  rawExpenses = signal<Expense[]>([]);
  rawPayouts = signal<Payout[]>([]);
  rawBankEntries = signal<BankEntry[]>([]);

  isLoading = signal<boolean>(false);

  // Bank Ledger Filters & Pagination
  bankLedgerSearch = signal<string>('');
  bankLedgerFilter = signal<'all' | 'inflow' | 'deduction' | 'upi' | 'payout'>('all');
  bankCurrentPage = signal<number>(1);
  bankPageSize = signal<number>(10);

  // Bank Entry Modal State
  showBankModal = signal<boolean>(false);
  bankModalMode = signal<'opening_balance' | 'payout' | 'deduction' | 'deposit'>('opening_balance');
  bankModalTitle = signal<string>('Record Opening Balance');
  bankEntryId = '';
  bankAmount: number | null = null;
  bankDate: string = '';
  bankSource: string = 'Opening Balance';
  bankDescription: string = '';
  bankReferenceNumber: string = '';
  bankPlatform: 'Swiggy' | 'Zomato' = 'Swiggy';
  bankErrorMessage = signal<string>('');

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

  payouts = computed(() => {
    const start = this.startDate();
    const end = this.endDate();
    const list = this.rawPayouts();
    if (!start && !end) return list;
    return list.filter(p => {
      const d = p.date;
      if (!d) return false;
      if (start && d < start) return false;
      if (end && d > end) return false;
      return true;
    });
  });

  totalPayouts = computed(() => {
    return this.payouts().reduce((sum, p) => sum + (p.amount || 0), 0);
  });

  swiggyPayouts = computed(() => {
    return this.payouts().filter(p => (p.platform || '').toLowerCase() === 'swiggy').reduce((sum, p) => sum + (p.amount || 0), 0);
  });

  zomatoPayouts = computed(() => {
    return this.payouts().filter(p => (p.platform || '').toLowerCase() === 'zomato').reduce((sum, p) => sum + (p.amount || 0), 0);
  });

  // The latest opening balance entry establishes the baseline/go-live point.
  latestOpeningBalance = computed(() => {
    const list = this.rawBankEntries()
      .filter(b => b.type === 'opening_balance')
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return list.length > 0 ? list[0] : null;
  });

  // Effective cutoff date (YYYY-MM-DD). Back entries before this date are excluded from treasury calculations.
  effectiveOpeningDate = computed<string>(() => {
    const ob = this.latestOpeningBalance();
    return ob && ob.date ? ob.date.substring(0, 10) : '';
  });

  bankEntries = computed(() => {
    const start = this.startDate();
    const end = this.endDate();
    const list = this.rawBankEntries();
    if (!start && !end) return list;
    return list.filter(b => {
      const d = b.date;
      if (!d) return false;
      if (start && d < start) return false;
      if (end && d > end) return false;
      return true;
    });
  });

  openingBalanceTotal = computed(() => {
    const cutoff = this.effectiveOpeningDate();
    if (!cutoff) return 0;
    return this.rawBankEntries()
      .filter(b => b.type === 'opening_balance' && (b.date || '').substring(0, 10) === cutoff)
      .reduce((sum, b) => sum + (b.amount || 0), 0);
  });

  treasuryDepositsTotal = computed(() => {
    const cutoff = this.effectiveOpeningDate();
    const start = this.startDate();
    const end = this.endDate();
    return this.rawBankEntries()
      .filter(b => {
        if (b.type !== 'deposit') return false;
        const d = (b.date || '').substring(0, 10);
        if (cutoff && d < cutoff) return false;
        if (start && d < start) return false;
        if (end && d > end) return false;
        return true;
      })
      .reduce((sum, b) => sum + (b.amount || 0), 0);
  });

  treasuryDeductionsTotal = computed(() => {
    const cutoff = this.effectiveOpeningDate();
    const start = this.startDate();
    const end = this.endDate();
    return this.rawBankEntries()
      .filter(b => {
        if (b.type !== 'deduction') return false;
        const d = (b.date || '').substring(0, 10);
        if (cutoff && d < cutoff) return false;
        if (start && d < start) return false;
        if (end && d > end) return false;
        return true;
      })
      .reduce((sum, b) => sum + (b.amount || 0), 0);
  });

  // Direct UPI orders collections (on or after opening balance date)
  treasuryUpiStats = computed(() => {
    const cutoff = this.effectiveOpeningDate();
    const start = this.startDate();
    const end = this.endDate();
    let amount = 0;
    let count = 0;

    this.rawBills().forEach(b => {
      const d = (b.date || '').substring(0, 10);
      if (cutoff && d < cutoff) return; // Don't take back entries for calculations
      if (start && d < start) return;
      if (end && d > end) return;

      const grandTotal = (b.amount || 0) + (b.cgst || 0) + (b.sgst || 0);
      const hasSplit = (b.cashAmount !== undefined && b.cashAmount > 0) || (b.upiAmount !== undefined && b.upiAmount > 0);
      let upi = 0;
      if (hasSplit) {
        upi = b.upiAmount || 0;
      } else if ((b.paymentMode || '').toLowerCase() === 'upi') {
        upi = grandTotal;
      }

      if (upi > 0) {
        amount += upi;
        count++;
      }
    });

    return {
      amount: Math.round(amount * 100) / 100,
      count
    };
  });

  treasurySwiggyPayouts = computed(() => {
    const cutoff = this.effectiveOpeningDate();
    const start = this.startDate();
    const end = this.endDate();
    return this.rawPayouts()
      .filter(p => {
        const d = (p.date || '').substring(0, 10);
        if (cutoff && d < cutoff) return false; // Don't take back entries for calculations
        if (start && d < start) return false;
        if (end && d > end) return false;
        return (p.platform || '').toLowerCase() === 'swiggy';
      })
      .reduce((sum, p) => sum + (p.amount || 0), 0);
  });

  treasuryZomatoPayouts = computed(() => {
    const cutoff = this.effectiveOpeningDate();
    const start = this.startDate();
    const end = this.endDate();
    return this.rawPayouts()
      .filter(p => {
        const d = (p.date || '').substring(0, 10);
        if (cutoff && d < cutoff) return false; // Don't take back entries for calculations
        if (start && d < start) return false;
        if (end && d > end) return false;
        return (p.platform || '').toLowerCase() === 'zomato';
      })
      .reduce((sum, p) => sum + (p.amount || 0), 0);
  });

  liveCurrentBankBalance = computed(() => {
    const opening = this.openingBalanceTotal();
    const upi = this.treasuryUpiStats().amount;
    const swiggy = this.treasurySwiggyPayouts();
    const zomato = this.treasuryZomatoPayouts();
    const deposits = this.treasuryDepositsTotal();
    const deductions = this.treasuryDeductionsTotal();
    return Math.round((opening + upi + swiggy + zomato + deposits - deductions) * 100) / 100;
  });

  totalBankInflows = computed(() => {
    return Math.round((this.openingBalanceTotal() + this.treasuryUpiStats().amount + this.treasurySwiggyPayouts() + this.treasuryZomatoPayouts() + this.treasuryDepositsTotal()) * 100) / 100;
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

  totalDiscounts = computed(() => {
    return this.bills().reduce((sum, b) => {
      const discountPercent = b.discount || 0;
      if (discountPercent <= 0 || discountPercent >= 100) return sum;
      const grandTotal = (b.amount || 0) + (b.cgst || 0) + (b.sgst || 0);
      const discountAmount = grandTotal * (discountPercent / (100 - discountPercent));
      return sum + discountAmount;
    }, 0);
  });

  discountedBillsCount = computed(() => {
    return this.bills().filter(b => (b.discount || 0) > 0).length;
  });

  totalCgst = computed(() => {
    return this.bills().reduce((sum, b) => sum + (b.cgst || 0), 0);
  });

  totalSgst = computed(() => {
    return this.bills().reduce((sum, b) => sum + (b.sgst || 0), 0);
  });

  totalGst = computed(() => {
    return this.totalCgst() + this.totalSgst();
  });

  netProfit = computed(() => {
    return this.totalRevenue() - this.totalExpenses();
  });

  profitMargin = computed(() => {
    const rev = this.totalRevenue();
    return rev > 0 ? (this.netProfit() / rev) * 100 : 0;
  });

  paymentModeStats = computed(() => {
    let upiCount = 0;
    let upiAmount = 0;
    let cashCount = 0;
    let cashAmount = 0;
    let otherCount = 0;
    let otherAmount = 0;

    const list = this.bills();
    list.forEach(b => {
      const grandTotal = (b.amount || 0) + (b.cgst || 0) + (b.sgst || 0);
      const hasSplit = (b.cashAmount !== undefined && b.cashAmount > 0) || (b.upiAmount !== undefined && b.upiAmount > 0);

      if (hasSplit) {
        const cashVal = b.cashAmount || 0;
        const upiVal = b.upiAmount || 0;

        if (cashVal > 0) {
          cashCount++;
          cashAmount += cashVal;
        }
        if (upiVal > 0) {
          upiCount++;
          upiAmount += upiVal;
        }

        const diff = grandTotal - (cashVal + upiVal);
        if (diff > 0.01) {
          const mode = (b.paymentMode || 'Cash').toLowerCase();
          if (mode === 'upi') {
            upiAmount += diff;
          } else if (mode === 'cash') {
            cashAmount += diff;
          } else {
            otherAmount += diff;
            otherCount++;
          }
        }
      } else {
        const mode = (b.paymentMode || 'Cash').toLowerCase();
        if (mode === 'upi') {
          upiCount++;
          upiAmount += grandTotal;
        } else if (mode === 'cash') {
          cashCount++;
          cashAmount += grandTotal;
        } else {
          otherCount++;
          otherAmount += grandTotal;
        }
      }
    });

    const totalRev = this.totalRevenue();
    return {
      upi: {
        count: upiCount,
        amount: upiAmount,
        percentage: totalRev > 0 ? (upiAmount / totalRev) * 100 : 0
      },
      cash: {
        count: cashCount,
        amount: cashAmount,
        percentage: totalRev > 0 ? (cashAmount / totalRev) * 100 : 0
      },
      other: {
        count: otherCount,
        amount: otherAmount,
        percentage: totalRev > 0 ? (otherAmount / totalRev) * 100 : 0
      }
    };
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
      expenses: this.apiService.getExpenses(restId),
      payouts: this.apiService.getPayouts(restId),
      bankEntries: this.apiService.getBankTransactions(restId)
    }).subscribe({
      next: (res) => {
        this.restaurants.set(res.restaurants);
        this.foodItems.set(res.foodItems);
        this.rawBills.set(res.bills);
        this.rawExpenses.set(res.expenses);
        this.rawPayouts.set(res.payouts);
        this.rawBankEntries.set(res.bankEntries || []);
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
    } else if (type === 'yesterday') {
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);
      const yesterdayStr = this.formatDate(yesterday);
      this.startDate.set(yesterdayStr);
      this.endDate.set(yesterdayStr);
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

  // =========================================================================
  // UNIFIED BANK LEDGER & ACTIONS
  // =========================================================================
  unifiedBankLedger = computed<UnifiedBankLedgerItem[]>(() => {
    const items: UnifiedBankLedgerItem[] = [];
    const cutoff = this.effectiveOpeningDate();
    const start = this.startDate();
    const end = this.endDate();

    // 1. Bank Entries (Opening Balance, Deposits, Deductions)
    this.rawBankEntries().forEach(b => {
      const d = (b.date || '').substring(0, 10);
      if (cutoff && d < cutoff) return; // Exclude back entries prior to opening balance
      if (b.type === 'opening_balance' && cutoff && d !== cutoff) return;
      if (start && d < start) return;
      if (end && d > end) return;

      let isCredit = true;
      let label = '💵 Bank Deposit';
      if (b.type === 'opening_balance') {
        label = '💰 Opening Balance';
      } else if (b.type === 'deduction') {
        isCredit = false;
        label = '🔻 Account Deduction';
      }
      items.push({
        id: b.id,
        sourceType: b.type,
        isCredit,
        categoryLabel: label,
        amount: b.amount || 0,
        date: b.date || '',
        description: b.description || (b.type === 'opening_balance' ? 'Initial Account Funds' : (b.type === 'deduction' ? 'Cash/Fund Withdrawal' : 'Deposit')),
        referenceNumber: b.referenceNumber || '',
        originalItem: b
      });
    });

    // 2. Swiggy & Zomato Payouts
    this.rawPayouts().forEach(p => {
      const d = (p.date || '').substring(0, 10);
      if (cutoff && d < cutoff) return; // Exclude back entries prior to opening balance
      if (start && d < start) return;
      if (end && d > end) return;

      const isSwiggy = (p.platform || '').toLowerCase() === 'swiggy';
      items.push({
        id: p.id,
        sourceType: isSwiggy ? 'swiggy_payout' : 'zomato_payout',
        isCredit: true,
        categoryLabel: isSwiggy ? '🛵 Swiggy Settlement' : '🔴 Zomato Settlement',
        amount: p.amount || 0,
        date: p.date || '',
        description: p.description || `${p.platform} Online Platform Payout`,
        referenceNumber: p.referenceNumber || '',
        originalItem: p
      });
    });

    // 3. Daily Aggregated UPI Orders Collections
    const upiMap = new Map<string, { total: number; count: number }>();
    this.rawBills().forEach(b => {
      const d = (b.date || '').substring(0, 10);
      if (!d) return;
      if (cutoff && d < cutoff) return; // Exclude back entries prior to opening balance
      if (start && d < start) return;
      if (end && d > end) return;

      const grandTotal = (b.amount || 0) + (b.cgst || 0) + (b.sgst || 0);
      const hasSplit = (b.cashAmount !== undefined && b.cashAmount > 0) || (b.upiAmount !== undefined && b.upiAmount > 0);
      let upi = 0;
      if (hasSplit) {
        upi = b.upiAmount || 0;
      } else if ((b.paymentMode || '').toLowerCase() === 'upi') {
        upi = grandTotal;
      }
      if (upi > 0) {
        const curr = upiMap.get(d) || { total: 0, count: 0 };
        curr.total += upi;
        curr.count++;
        upiMap.set(d, curr);
      }
    });

    upiMap.forEach((val, dateStr) => {
      items.push({
        id: `upi-${dateStr}`,
        sourceType: 'upi_order',
        isCredit: true,
        categoryLabel: '📱 Daily UPI Orders',
        amount: Math.round(val.total * 100) / 100,
        date: dateStr,
        description: `Direct UPI customer payments (${val.count} orders/bills)`,
        referenceNumber: 'UPI-AUTO',
        originalItem: null
      });
    });

    // Sort chronologically descending
    items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return items;
  });

  filteredBankLedger = computed(() => {
    const list = this.unifiedBankLedger();
    const query = this.bankLedgerSearch().trim().toLowerCase();
    const filter = this.bankLedgerFilter();

    return list.filter(item => {
      if (filter === 'inflow' && !item.isCredit) return false;
      if (filter === 'deduction' && item.isCredit) return false;
      if (filter === 'upi' && item.sourceType !== 'upi_order') return false;
      if (filter === 'payout' && item.sourceType !== 'swiggy_payout' && item.sourceType !== 'zomato_payout') return false;

      if (query) {
        const matchDesc = (item.description || '').toLowerCase().includes(query);
        const matchCat = (item.categoryLabel || '').toLowerCase().includes(query);
        const matchRef = (item.referenceNumber || '').toLowerCase().includes(query);
        const matchDate = (item.date || '').toLowerCase().includes(query);
        const matchAmount = item.amount.toString().includes(query);
        return matchDesc || matchCat || matchRef || matchDate || matchAmount;
      }
      return true;
    });
  });

  bankTotalPages = computed(() => {
    return Math.max(1, Math.ceil(this.filteredBankLedger().length / this.bankPageSize()));
  });

  paginatedBankLedger = computed(() => {
    const page = this.bankCurrentPage();
    const size = this.bankPageSize();
    const start = (page - 1) * size;
    return this.filteredBankLedger().slice(start, start + size);
  });

  bankPageStartRecord = computed(() => {
    if (this.filteredBankLedger().length === 0) return 0;
    return (this.bankCurrentPage() - 1) * this.bankPageSize() + 1;
  });

  bankPageEndRecord = computed(() => {
    return Math.min(this.bankCurrentPage() * this.bankPageSize(), this.filteredBankLedger().length);
  });

  bankPaginationPages = computed(() => {
    const total = this.bankTotalPages();
    const current = this.bankCurrentPage();
    const pages: (number | string)[] = [];

    if (total <= 7) {
      for (let i = 1; i <= total; i++) pages.push(i);
    } else {
      pages.push(1);
      if (current > 3) pages.push('...');
      const start = Math.max(2, current - 1);
      const end = Math.min(total - 1, current + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (current < total - 2) pages.push('...');
      pages.push(total);
    }
    return pages;
  });

  goToBankPage(p: number | string) {
    if (typeof p === 'string') return;
    if (p >= 1 && p <= this.bankTotalPages()) {
      this.bankCurrentPage.set(p);
    }
  }

  prevBankPage() {
    if (this.bankCurrentPage() > 1) {
      this.bankCurrentPage.update(p => p - 1);
    }
  }

  nextBankPage() {
    if (this.bankCurrentPage() < this.bankTotalPages()) {
      this.bankCurrentPage.update(p => p + 1);
    }
  }

  changeBankPageSize(size: number) {
    this.bankPageSize.set(Number(size));
    this.bankCurrentPage.set(1);
  }

  // Modal actions
  openSetOpeningBalanceModal() {
    this.bankModalMode.set('opening_balance');
    this.bankModalTitle.set('Set Opening Bank Balance');
    this.bankEntryId = '';
    this.bankAmount = null;
    this.bankDate = new Date().toISOString().split('T')[0];
    this.bankSource = 'Opening Balance';
    this.bankDescription = 'Initial bank funds';
    this.bankReferenceNumber = '';
    this.bankErrorMessage.set('');
    this.showBankModal.set(true);
  }

  openAddPayoutModal(platform: 'Swiggy' | 'Zomato') {
    this.bankModalMode.set('payout');
    this.bankPlatform = platform;
    this.bankModalTitle.set(`Record ${platform} Payout Addition`);
    this.bankEntryId = '';
    this.bankAmount = null;
    this.bankDate = new Date().toISOString().split('T')[0];
    this.bankSource = `${platform} Payout`;
    this.bankDescription = `${platform} Daily Settlement Credit`;
    this.bankReferenceNumber = '';
    this.bankErrorMessage.set('');
    this.showBankModal.set(true);
  }

  openAddDeductionModal() {
    this.bankModalMode.set('deduction');
    this.bankModalTitle.set('Record Account Deduction (Money Taken Out)');
    this.bankEntryId = '';
    this.bankAmount = null;
    this.bankDate = new Date().toISOString().split('T')[0];
    this.bankSource = 'Cash Withdrawal';
    this.bankDescription = '';
    this.bankReferenceNumber = '';
    this.bankErrorMessage.set('');
    this.showBankModal.set(true);
  }

  openAddDepositModal() {
    this.bankModalMode.set('deposit');
    this.bankModalTitle.set('Record Bank Deposit (Manual Inflow)');
    this.bankEntryId = '';
    this.bankAmount = null;
    this.bankDate = new Date().toISOString().split('T')[0];
    this.bankSource = 'Bank Deposit';
    this.bankDescription = '';
    this.bankReferenceNumber = '';
    this.bankErrorMessage.set('');
    this.showBankModal.set(true);
  }

  openEditBankLedgerItem(item: UnifiedBankLedgerItem) {
    if (item.sourceType === 'upi_order') {
      alert('UPI order collections are auto-calculated from bills/orders and cannot be edited manually.');
      return;
    }

    if (item.sourceType === 'swiggy_payout' || item.sourceType === 'zomato_payout') {
      const p = item.originalItem as Payout;
      this.bankModalMode.set('payout');
      this.bankPlatform = p.platform || 'Swiggy';
      this.bankModalTitle.set(`Edit ${p.platform} Payout`);
      this.bankEntryId = p.id || '';
      this.bankAmount = p.amount;
      this.bankDate = p.date;
      this.bankSource = `${p.platform} Payout`;
      this.bankDescription = p.description || '';
      this.bankReferenceNumber = p.referenceNumber || '';
      this.bankErrorMessage.set('');
      this.showBankModal.set(true);
    } else {
      const b = item.originalItem as BankEntry;
      this.bankModalMode.set(b.type);
      this.bankModalTitle.set(b.type === 'opening_balance' ? 'Edit Opening Balance' : (b.type === 'deduction' ? 'Edit Account Deduction' : 'Edit Deposit'));
      this.bankEntryId = b.id || '';
      this.bankAmount = b.amount;
      this.bankDate = b.date;
      this.bankSource = b.source || '';
      this.bankDescription = b.description || '';
      this.bankReferenceNumber = b.referenceNumber || '';
      this.bankErrorMessage.set('');
      this.showBankModal.set(true);
    }
  }

  closeBankModal() {
    this.showBankModal.set(false);
  }

  saveBankModal() {
    if (!this.bankAmount || this.bankAmount <= 0) {
      this.bankErrorMessage.set('Amount must be greater than 0.');
      return;
    }
    if (!this.bankDate) {
      this.bankErrorMessage.set('Please select a valid date.');
      return;
    }

    const restId = this.apiService.selectedRestaurantId() || (this.restaurants()[0]?.id || 'default-restaurant-id');

    if (this.bankModalMode() === 'payout') {
      const payload: Payout = {
        restaurantId: restId,
        platform: this.bankPlatform,
        amount: Number(this.bankAmount),
        date: this.bankDate,
        description: this.bankDescription || `${this.bankPlatform} Payout Credit`,
        referenceNumber: this.bankReferenceNumber || undefined
      };

      if (this.bankEntryId) {
        this.apiService.updatePayout(this.bankEntryId, payload).subscribe({
          next: () => {
            this.closeBankModal();
            this.fetchDashboardData();
          },
          error: (err) => this.bankErrorMessage.set(err.error?.error || 'Failed to update payout.')
        });
      } else {
        this.apiService.createPayout(payload).subscribe({
          next: () => {
            this.closeBankModal();
            this.fetchDashboardData();
          },
          error: (err) => this.bankErrorMessage.set(err.error?.error || 'Failed to record payout.')
        });
      }
    } else {
      const payload: Partial<BankEntry> = {
        restaurantId: restId,
        type: this.bankModalMode() as any,
        amount: Number(this.bankAmount),
        date: this.bankDate,
        source: this.bankSource || this.bankModalMode(),
        description: this.bankDescription || (this.bankModalMode() === 'opening_balance' ? 'Opening Balance' : (this.bankModalMode() === 'deduction' ? 'Account Withdrawal' : 'Deposit')),
        referenceNumber: this.bankReferenceNumber || undefined
      };

      if (this.bankEntryId) {
        this.apiService.updateBankTransaction(this.bankEntryId, payload).subscribe({
          next: () => {
            this.closeBankModal();
            this.fetchDashboardData();
          },
          error: (err) => this.bankErrorMessage.set(err.error?.error || 'Failed to update bank entry.')
        });
      } else {
        this.apiService.createBankTransaction(payload).subscribe({
          next: () => {
            this.closeBankModal();
            this.fetchDashboardData();
          },
          error: (err) => this.bankErrorMessage.set(err.error?.error || 'Failed to save bank entry.')
        });
      }
    }
  }

  deleteBankLedgerItem(item: UnifiedBankLedgerItem) {
    if (item.sourceType === 'upi_order') {
      alert('UPI collections are auto-calculated from customer orders and cannot be deleted from the bank ledger.');
      return;
    }

    if (!confirm(`Are you sure you want to delete this ${item.categoryLabel} entry of ₹${item.amount}?`)) return;

    if (item.sourceType === 'swiggy_payout' || item.sourceType === 'zomato_payout') {
      if (!item.id) return;
      this.apiService.deletePayout(item.id).subscribe({
        next: () => this.fetchDashboardData(),
        error: (err) => console.error('Error deleting payout:', err)
      });
    } else {
      if (!item.id) return;
      this.apiService.deleteBankTransaction(item.id).subscribe({
        next: () => this.fetchDashboardData(),
        error: (err) => console.error('Error deleting bank transaction:', err)
      });
    }
  }

  clearDateFilter() {
    this.setQuickFilter('all');
  }
}
