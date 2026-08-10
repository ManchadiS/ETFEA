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

  getRestaurantName(id?: string): string {
    if (!id) return '';
    const rest = this.restaurants().find(r => r.id === id);
    return rest ? rest.name : id;
  }

  private generateExcelFile(title: string, headers: string[], rows: any[][], filename: string) {
    const sheetName = title.substring(0, 30).replace(/[:\\/?*\[\]]/g, '');
    const html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta http-equiv="content-type" content="application/vnd.ms-excel; charset=UTF-8">
        <!--[if gte mso 9]>
        <xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>${sheetName}</x:Name>
                <x:WorksheetOptions>
                  <x:DisplayGridlines/>
                </x:WorksheetOptions>
              </x:ExcelWorksheet>
            </x:ExcelWorksheets>
          </x:ExcelWorkbook>
        </xml>
        <![endif]-->
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
          h2 { color: #f25c05; margin-bottom: 4px; }
          p { margin: 2px 0; color: #555; font-size: 13px; }
          table { border-collapse: collapse; margin-top: 15px; width: 100%; }
          th { background-color: #f25c05; color: #ffffff; font-weight: bold; border: 1px solid #cccccc; padding: 8px; text-align: left; }
          td { border: 1px solid #dddddd; padding: 8px; font-size: 13px; }
          tr:nth-child(even) { background-color: #f9f9f9; }
          .total-row td { font-weight: bold; background-color: #f3f4f6; border-top: 2px double #888888; border-bottom: 2px double #888888; color: #000; }
        </style>
      </head>
      <body>
        <h2>${title}</h2>
        <p><strong>Outlet:</strong> ${this.activeRestaurantName()}</p>
        <p><strong>Date Period:</strong> ${this.startDate() && this.endDate() ? (this.startDate() + ' to ' + this.endDate()) : 'All Time'}</p>
        <p><strong>Export Date:</strong> ${this.todayStr()}</p>
        <table>
          <thead>
            <tr>
              ${headers.map(h => `<th>${h}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${rows.map(row => {
              const isTotal = row[0] === 'TOTAL';
              return `<tr class="${isTotal ? 'total-row' : ''}">
                ${row.map(cell => `<td>${cell !== undefined && cell !== null ? cell : ''}</td>`).join('')}
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob(['\ufeff' + html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  downloadBillsExcel() {
    const list = this.bills();
    const outletName = this.activeRestaurantName();
    const headers = [
      'Bill / Order No.',
      'Reference ID',
      'Date',
      'Restaurant Name',
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

    let totalSubtotal = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalGrand = 0;

    const rows = list.map(b => {
      const grandTotal = (b.amount || 0) + (b.cgst || 0) + (b.sgst || 0);
      const itemsStr = b.foodItems ? b.foodItems.map(item => `${item.name} (${item.quantity}x @ ₹${item.price})`).join('; ') : '';
      
      totalSubtotal += (b.amount || 0);
      totalCgst += (b.cgst || 0);
      totalSgst += (b.sgst || 0);
      totalGrand += grandTotal;

      return [
        b.orderNumber ? `#${b.orderNumber}` : '',
        b.id || '',
        b.date || '',
        this.getRestaurantName(b.restaurantId),
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

    // Append Total Row
    rows.push([
      'TOTAL',
      '',
      '',
      '',
      totalSubtotal,
      totalCgst,
      totalSgst,
      totalGrand,
      '',
      '',
      '',
      '',
      ''
    ]);

    const dateRangeSuffix = this.startDate() && this.endDate() ? `${this.startDate()}_to_${this.endDate()}` : 'all_time';
    const filename = `bills_report_${outletName.toLowerCase().replace(/\s+/g, '_')}_${dateRangeSuffix}.xls`;
    this.generateExcelFile(`Bills Invoice Report`, headers, rows, filename);
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

    let totalQty = 0;
    let totalRev = 0;

    const rows = list.map(item => {
      totalQty += (item.quantity || 0);
      totalRev += (item.revenue || 0);

      return [
        item.name,
        item.price,
        item.quantity,
        item.revenue
      ];
    });

    // Append Total Row
    rows.push([
      'TOTAL',
      '',
      totalQty,
      totalRev
    ]);

    const dateRangeSuffix = this.startDate() && this.endDate() ? `${this.startDate()}_to_${this.endDate()}` : 'all_time';
    const filename = `food_sales_report_${outletName.toLowerCase().replace(/\s+/g, '_')}_${dateRangeSuffix}.xls`;
    this.generateExcelFile(`Food Sales Report`, headers, rows, filename);
  }

  downloadExpensesExcel() {
    const list = this.expenses();
    const outletName = this.activeRestaurantName();
    const headers = [
      'Expense ID',
      'Date',
      'Restaurant Name',
      'Category',
      'Description',
      'Amount (INR)'
    ];

    let totalAmount = 0;

    const rows = list.map(e => {
      totalAmount += (e.amount || 0);

      return [
        e.id || '',
        e.date || '',
        this.getRestaurantName(e.restaurantId),
        e.category || '',
        e.description || '',
        e.amount || 0
      ];
    });

    // Append Total Row
    rows.push([
      'TOTAL',
      '',
      '',
      '',
      '',
      totalAmount
    ]);

    const dateRangeSuffix = this.startDate() && this.endDate() ? `${this.startDate()}_to_${this.endDate()}` : 'all_time';
    const filename = `expense_report_${outletName.toLowerCase().replace(/\s+/g, '_')}_${dateRangeSuffix}.xls`;
    this.generateExcelFile(`Expenses Report`, headers, rows, filename);
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

  clearDateFilter() {
    this.setQuickFilter('all');
  }
}
