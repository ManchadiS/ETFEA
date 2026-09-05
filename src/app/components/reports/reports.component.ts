import { Component, inject, OnInit, signal, effect, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService, Restaurant, FoodItem, Expense, Billing, InventoryItem, PurchaseBill } from '../../services/api.service';
import { forkJoin } from 'rxjs';
import { FormsModule } from '@angular/forms';

export interface InventoryItemSpendReport {
  id?: string;
  name: string;
  currentStock: number;
  unit: string;
  threshold: number;
  stockStatus: 'In Stock' | 'Low Stock' | 'Out of Stock';
  totalSpend: number;
  transactionCount: number;
  averageSpendPerTransaction: number;
  percentageOfTotal: number;
  lastPurchasedDate: string;
  transactions: Array<{
    id?: string;
    date: string;
    amount: number;
    description: string;
    sourceType: 'Purchase Bill' | 'Expense Tracker';
    supplier?: string;
    imageUrl?: string;
    createdBy?: string;
  }>;
}

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
  rawInventoryItems = signal<InventoryItem[]>([]);
  rawBills = signal<Billing[]>([]);
  rawExpenses = signal<Expense[]>([]);
  rawPurchaseBills = signal<PurchaseBill[]>([]);

  isLoading = signal<boolean>(false);

  // Date filters
  activeQuickFilter = signal<string>('all');
  startDate = signal<string>('');
  endDate = signal<string>('');

  // Active sub-sidebar tab
  reportTab = signal<'bills' | 'food_sales' | 'expenses' | 'inventory_expenses'>('bills');

  // Inventory Report Specific Controls
  selectedInventoryItemFilter = signal<string>('All');
  inventorySearchQuery = signal<string>('');
  inventorySortBy = signal<'spend_desc' | 'spend_asc' | 'tx_desc' | 'name_asc'>('spend_desc');
  expandedItemName = signal<string | null>(null);

  // Receipt Modal
  receiptModal = signal<{ show: boolean; url: string; title: string }>({ show: false, url: '', title: '' });

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

  // Filtered purchase bills based on date filters
  purchaseBills = computed(() => {
    const start = this.startDate();
    const end = this.endDate();
    const list = this.rawPurchaseBills();
    if (!start && !end) return list;
    return list.filter(pb => {
      const d = pb.date;
      if (!d) return false;
      if (start && d < start) return false;
      if (end && d > end) return false;
      return true;
    });
  });

  // Filtered inventory expenses based on date filters
  inventoryExpenses = computed(() => {
    return this.expenses().filter(e => {
      const cat = (e.category || '').toLowerCase();
      const desc = (e.description || '').toLowerCase();
      return cat === 'inventory' || cat === 'purchase' || desc.startsWith('inventory:') || desc.startsWith('purchase bill:');
    });
  });

  // Helper: Normalize ingredient names into canonical categories so all variations (e.g. Chicken 5kg, Raw Chicken) aggregate into ONE single row
  private getCanonicalItemName(rawName: string, invItems: InventoryItem[]): { key: string; displayName: string } {
    const lower = rawName.toLowerCase().trim();

    // 1. High Priority Keyword Normalization for Core Raw Ingredients (Chicken, Paneer, Rice, Butter, etc.)
    if (lower.includes('chicken')) {
      const catalogItem = invItems.find(i => i.name.toLowerCase().includes('chicken'));
      return { 
        key: 'chicken', 
        displayName: catalogItem ? catalogItem.name : 'Chicken' 
      };
    }

    if (lower.includes('paneer')) {
      const catalogItem = invItems.find(i => i.name.toLowerCase().includes('paneer'));
      return { 
        key: 'paneer', 
        displayName: catalogItem ? catalogItem.name : 'Paneer' 
      };
    }

    if (lower.includes('butter')) {
      const catalogItem = invItems.find(i => i.name.toLowerCase().includes('butter'));
      return { 
        key: 'butter', 
        displayName: catalogItem ? catalogItem.name : 'Butter' 
      };
    }

    if (lower.includes('rice')) {
      const catalogItem = invItems.find(i => i.name.toLowerCase().includes('rice'));
      return { 
        key: 'rice', 
        displayName: catalogItem ? catalogItem.name : 'Rice' 
      };
    }

    if (lower.includes('frooti')) {
      const catalogItem = invItems.find(i => i.name.toLowerCase().includes('frooti'));
      return { 
        key: 'frooti', 
        displayName: catalogItem ? catalogItem.name : 'Frooti' 
      };
    }

    if (lower.includes('cheese')) {
      const catalogItem = invItems.find(i => i.name.toLowerCase().includes('cheese'));
      return { 
        key: 'cheese', 
        displayName: catalogItem ? catalogItem.name : 'Cheese' 
      };
    }

    if (lower.includes('oil')) {
      const catalogItem = invItems.find(i => i.name.toLowerCase().includes('oil'));
      return { 
        key: 'oil', 
        displayName: catalogItem ? catalogItem.name : 'Cooking Oil' 
      };
    }

    if (lower.includes('fries') || lower.includes('french fries')) {
      const catalogItem = invItems.find(i => i.name.toLowerCase().includes('fries'));
      return { 
        key: 'french fries', 
        displayName: catalogItem ? catalogItem.name : 'French Fries' 
      };
    }

    // 2. Check match with catalog inventory items
    for (const item of invItems) {
      if (item.name.toLowerCase().trim() === lower || lower.includes(item.name.toLowerCase().trim())) {
        return { key: item.name.toLowerCase().trim(), displayName: item.name };
      }
    }

    // 3. Clean fallback
    const cleaned = rawName
      .replace(/\s*\(\s*\d+\s*(kg|g|gm|ltr|l|ml|pc|pcs|packets|units)\s*\)/gi, '')
      .replace(/\s*\d+\s*(kg|g|gm|ltr|l|ml|pc|pcs|packets|units)\b/gi, '')
      .trim();

    return { 
      key: (cleaned || rawName).toLowerCase().trim(), 
      displayName: cleaned || rawName 
    };
  }

  // Detailed Inventory Items Spend Breakdown (Combines BOTH Purchase Bills and Direct Expenses into ONE single row per ingredient)
  inventoryItemReports = computed<InventoryItemSpendReport[]>(() => {
    const expenses = this.inventoryExpenses();
    const purchaseBillsList = this.purchaseBills();
    const invItems = this.rawInventoryItems();

    // Map by canonical key (case-insensitive)
    const reportMap = new Map<string, InventoryItemSpendReport>();

    // 1. Initialize with all registered inventory items (merged canonically)
    invItems.forEach(item => {
      const canonical = this.getCanonicalItemName(item.name, invItems);
      const qty = item.quantity ?? 0;
      const thres = item.threshold ?? 10;
      let status: 'In Stock' | 'Low Stock' | 'Out of Stock' = 'In Stock';
      if (qty === 0) status = 'Out of Stock';
      else if (qty <= thres) status = 'Low Stock';

      if (reportMap.has(canonical.key)) {
        const existing = reportMap.get(canonical.key)!;
        existing.currentStock += qty;
        if (existing.stockStatus !== 'In Stock') existing.stockStatus = status;
      } else {
        reportMap.set(canonical.key, {
          id: item.id,
          name: canonical.displayName,
          currentStock: qty,
          unit: item.unit || 'units',
          threshold: thres,
          stockStatus: status,
          totalSpend: 0,
          transactionCount: 0,
          averageSpendPerTransaction: 0,
          percentageOfTotal: 0,
          lastPurchasedDate: '',
          transactions: []
        });
      }
    });

    const unmappedTransactions: Array<{
      id?: string;
      date: string;
      amount: number;
      description: string;
      sourceType: 'Purchase Bill' | 'Expense Tracker';
      supplier?: string;
      imageUrl?: string;
      createdBy?: string;
    }> = [];

    // 2. Process all itemized entries from PURCHASE BILLS
    purchaseBillsList.forEach(pb => {
      if (pb.items && Array.isArray(pb.items)) {
        pb.items.forEach(pbItem => {
          const canonical = this.getCanonicalItemName(pbItem.name, invItems);
          const itemAmount = pbItem.total || (pbItem.quantity * pbItem.pricePerUnit) || 0;
          const txEntry = {
            id: pb.id,
            date: pb.date || '',
            amount: itemAmount,
            description: `Purchase Bill #${pb.billNumber || pb.id?.substring(0, 6)}: ${pbItem.quantity} ${pbItem.unit || ''} ${pbItem.name} @ ₹${pbItem.pricePerUnit}/${pbItem.unit || 'unit'} (Supplier: ${pb.supplierName})`,
            sourceType: 'Purchase Bill' as const,
            supplier: pb.supplierName,
            createdBy: 'Purchase Bill'
          };

          if (reportMap.has(canonical.key)) {
            const entry = reportMap.get(canonical.key)!;
            entry.totalSpend += itemAmount;
            entry.transactionCount += 1;
            entry.transactions.push(txEntry);
            if (!entry.lastPurchasedDate || (pb.date && pb.date > entry.lastPurchasedDate)) {
              entry.lastPurchasedDate = pb.date || '';
            }
          } else if (canonical.key) {
            const entry: InventoryItemSpendReport = {
              name: canonical.displayName,
              currentStock: 0,
              unit: pbItem.unit || 'units',
              threshold: 0,
              stockStatus: 'In Stock',
              totalSpend: itemAmount,
              transactionCount: 1,
              averageSpendPerTransaction: itemAmount,
              percentageOfTotal: 0,
              lastPurchasedDate: pb.date || '',
              transactions: [txEntry]
            };
            reportMap.set(canonical.key, entry);
          } else {
            unmappedTransactions.push(txEntry);
          }
        });
      }
    });

    // 3. Process all direct EXPENSES (Skipping auto-synced purchase bills to avoid double counting)
    expenses.forEach(e => {
      const desc = e.description || '';

      // Skip auto-synced purchase bills as we already processed their itemized lines above
      if (desc.startsWith('Purchase Bill: ')) {
        return;
      }

      let rawMatchedName = '';
      if (desc.startsWith('Inventory: ')) {
        const parts = desc.substring(11).split(' - ');
        rawMatchedName = parts[0].trim();
      } else {
        rawMatchedName = desc;
      }

      const canonical = this.getCanonicalItemName(rawMatchedName, invItems);

      const txEntry = {
        id: e.id,
        date: e.date || '',
        amount: e.amount || 0,
        description: desc,
        sourceType: 'Expense Tracker' as const,
        imageUrl: e.imageUrl,
        createdBy: e.createdBy
      };

      if (reportMap.has(canonical.key)) {
        const entry = reportMap.get(canonical.key)!;
        entry.totalSpend += e.amount || 0;
        entry.transactionCount += 1;
        entry.transactions.push(txEntry);
        if (!entry.lastPurchasedDate || (e.date && e.date > entry.lastPurchasedDate)) {
          entry.lastPurchasedDate = e.date || '';
        }
      } else if (canonical.key && canonical.key !== 'general') {
        const entry: InventoryItemSpendReport = {
          name: canonical.displayName,
          currentStock: 0,
          unit: 'units',
          threshold: 0,
          stockStatus: 'In Stock',
          totalSpend: e.amount || 0,
          transactionCount: 1,
          averageSpendPerTransaction: e.amount || 0,
          percentageOfTotal: 0,
          lastPurchasedDate: e.date || '',
          transactions: [txEntry]
        };
        reportMap.set(canonical.key, entry);
      } else {
        unmappedTransactions.push(txEntry);
      }
    });

    // Add general/unmapped inventory purchases if any
    if (unmappedTransactions.length > 0) {
      const generalSpend = unmappedTransactions.reduce((sum, t) => sum + t.amount, 0);
      reportMap.set('__general_inventory__', {
        name: 'General / Unclassified Inventory',
        currentStock: 0,
        unit: 'orders',
        threshold: 0,
        stockStatus: 'In Stock',
        totalSpend: generalSpend,
        transactionCount: unmappedTransactions.length,
        averageSpendPerTransaction: Math.round(generalSpend / unmappedTransactions.length),
        percentageOfTotal: 0,
        lastPurchasedDate: unmappedTransactions[0]?.date || '',
        transactions: unmappedTransactions
      });
    }

    // 4. Calculate total grand spend across all items
    let combinedGrandTotal = 0;
    reportMap.forEach(entry => {
      combinedGrandTotal += entry.totalSpend;
    });

    // 5. Finalize calculations (% of total, avg per transaction, sort transactions by date)
    const list: InventoryItemSpendReport[] = [];
    reportMap.forEach(entry => {
      entry.averageSpendPerTransaction = entry.transactionCount > 0 
        ? Math.round(entry.totalSpend / entry.transactionCount) 
        : 0;
      entry.percentageOfTotal = combinedGrandTotal > 0 
        ? Math.round((entry.totalSpend / combinedGrandTotal) * 1000) / 10 
        : 0;
      entry.transactions.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      list.push(entry);
    });

    return list;
  });

  // Total Inventory Spend computed directly from the unified item reports
  totalInventorySpend = computed(() => {
    return this.inventoryItemReports().reduce((sum, i) => sum + (i.totalSpend || 0), 0);
  });

  // Filtered & Sorted Inventory Reports
  filteredInventoryItemReports = computed(() => {
    const list = this.inventoryItemReports();
    const filterItem = this.selectedInventoryItemFilter();
    const query = this.inventorySearchQuery().toLowerCase().trim();
    const sortBy = this.inventorySortBy();

    let result = list.filter(item => {
      const matchesDropdown = filterItem === 'All' || item.name.toLowerCase() === filterItem.toLowerCase();
      const matchesQuery = !query || 
        item.name.toLowerCase().includes(query) ||
        item.transactions.some(t => t.description.toLowerCase().includes(query));
      return matchesDropdown && matchesQuery;
    });

    // Sorting
    result.sort((a, b) => {
      if (sortBy === 'spend_desc') return b.totalSpend - a.totalSpend;
      if (sortBy === 'spend_asc') return a.totalSpend - b.totalSpend;
      if (sortBy === 'tx_desc') return b.transactionCount - a.transactionCount;
      if (sortBy === 'name_asc') return a.name.localeCompare(b.name);
      return 0;
    });

    return result;
  });

  // Top spend item computation
  topInventorySpendItem = computed(() => {
    const list = this.inventoryItemReports();
    if (!list || list.length === 0) return null;
    const sorted = [...list].sort((a, b) => b.totalSpend - a.totalSpend);
    return sorted[0]?.totalSpend > 0 ? sorted[0] : null;
  });

  // Selected item details for hero card
  selectedItemReport = computed(() => {
    const selected = this.selectedInventoryItemFilter();
    if (selected === 'All') return null;
    return this.inventoryItemReports().find(i => i.name.toLowerCase() === selected.toLowerCase()) || null;
  });

  // List of distinct inventory item names for the selector dropdown
  availableInventoryItemNames = computed(() => {
    const names = new Set<string>();
    this.rawInventoryItems().forEach(i => names.add(i.name));
    this.inventoryItemReports().forEach(i => {
      if (i.name !== 'General / Unclassified Inventory') names.add(i.name);
    });
    return Array.from(names).sort();
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
      inventoryItems: this.apiService.getInventoryItems(restId),
      bills: this.apiService.getBills(restId),
      expenses: this.apiService.getExpenses(restId),
      purchaseBills: this.apiService.getPurchaseBills(restId)
    }).subscribe({
      next: (res) => {
        this.restaurants.set(res.restaurants);
        this.foodItems.set(res.foodItems);
        this.rawInventoryItems.set(res.inventoryItems);
        this.rawBills.set(res.bills);
        this.rawExpenses.set(res.expenses);
        this.rawPurchaseBills.set(res.purchaseBills || []);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error fetching report data:', err);
        this.isLoading.set(false);
      }
    });
  }

  setReportTab(tab: 'bills' | 'food_sales' | 'expenses' | 'inventory_expenses') {
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

  downloadInventoryExpensesExcel() {
    const list = this.filteredInventoryItemReports();
    const outletName = this.activeRestaurantName();
    const headers = [
      'Inventory Item Name',
      'Current Stock',
      'Unit',
      'Stock Status',
      'Purchase Orders Count',
      'Total Amount Spent (INR)',
      'Avg Spend / Order (INR)',
      '% of Inventory Spend',
      'Last Purchased Date'
    ];

    let totalSpendSum = 0;
    let totalTxCount = 0;

    const rows = list.map(item => {
      totalSpendSum += (item.totalSpend || 0);
      totalTxCount += (item.transactionCount || 0);

      return [
        item.name,
        item.currentStock,
        item.unit,
        item.stockStatus,
        item.transactionCount,
        item.totalSpend,
        item.averageSpendPerTransaction,
        `${item.percentageOfTotal}%`,
        item.lastPurchasedDate || 'N/A'
      ];
    });

    // Append Total Row
    rows.push([
      'TOTAL',
      '',
      '',
      '',
      totalTxCount,
      totalSpendSum,
      totalTxCount > 0 ? Math.round(totalSpendSum / totalTxCount) : 0,
      '100%',
      ''
    ]);

    const dateRangeSuffix = this.startDate() && this.endDate() ? `${this.startDate()}_to_${this.endDate()}` : 'all_time';
    const filename = `inventory_spend_report_${outletName.toLowerCase().replace(/\s+/g, '_')}_${dateRangeSuffix}.xls`;
    this.generateExcelFile(`Inventory Expense & Procurement Report`, headers, rows, filename);
  }

  toggleExpandItem(name: string) {
    if (this.expandedItemName() === name) {
      this.expandedItemName.set(null);
    } else {
      this.expandedItemName.set(name);
    }
  }

  openReceipt(url: string, title: string) {
    this.receiptModal.set({ show: true, url, title });
  }

  closeReceipt() {
    this.receiptModal.set({ show: false, url: '', title: '' });
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
