import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, Gstr3bSummary, GstSalesRegisterItem, GstPurchaseRegisterItem, Restaurant } from '../../services/api.service';

@Component({
  selector: 'app-gst-filing',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './gst-filing.component.html',
  styleUrl: './gst-filing.component.css'
})
export class GstFilingComponent implements OnInit {
  private apiService = inject(ApiService);

  // Authorization state
  currentUser = this.apiService.currentUser;
  isAuthorized = computed(() => this.currentUser()?.email === 'sagarmanchadi324@gmail.com');

  // Active filters
  restaurants = signal<Restaurant[]>([]);
  selectedRestaurantId = signal<string>('');
  selectedMonth = signal<string>(this.getDefaultMonth());
  selectedScheme = signal<'restaurant_5_no_itc' | 'standard_18_itc'>('restaurant_5_no_itc');

  // Active UI tab
  activeTab = signal<'gstr3b' | 'sales' | 'purchases' | 'guide' | 'settings'>('gstr3b');

  // Data states
  gstSummary = signal<Gstr3bSummary | null>(null);
  isLoading = signal<boolean>(false);
  errorMessage = signal<string>('');
  successMessage = signal<string>('');

  // Search & Filter for registers
  salesSearchQuery = signal<string>('');
  salesOrderTypeFilter = signal<string>('all');
  purchaseSearchQuery = signal<string>('');

  // Settings form
  settingsGstin = signal<string>('');
  settingsLegalName = signal<string>('');
  settingsTradeName = signal<string>('');
  settingsState = signal<string>('Maharashtra');
  settingsStateCode = signal<string>('27');
  settingsFilingFrequency = signal<string>('monthly');
  isSavingSettings = signal<boolean>(false);

  // Copy feedback state
  isCopied = signal<boolean>(false);

  ngOnInit() {
    if (!this.isAuthorized()) {
      this.errorMessage.set('Access Denied: GST Filing module is strictly confidential and restricted to authorized user sagarmanchadi324@gmail.com.');
      return;
    }

    this.loadRestaurants();
  }

  getDefaultMonth(): string {
    const d = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  }

  loadRestaurants() {
    this.apiService.getRestaurants().subscribe({
      next: (list) => {
        this.restaurants.set(list);
        if (list.length > 0) {
          const defaultId = list[0].id || '';
          this.selectedRestaurantId.set(defaultId);
          this.loadGstSummary();
        }
      },
      error: (err) => {
        console.error('Error fetching restaurants for GST filing:', err);
        this.errorMessage.set('Failed to load restaurant outlets.');
      }
    });
  }

  loadGstSummary() {
    if (!this.isAuthorized()) return;

    this.isLoading.set(true);
    this.errorMessage.set('');

    this.apiService.getGstSummary({
      restaurantId: this.selectedRestaurantId() || undefined,
      month: this.selectedMonth(),
      scheme: this.selectedScheme()
    }).subscribe({
      next: (summary) => {
        this.gstSummary.set(summary);
        this.isLoading.set(false);

        // Populate settings form from restaurant profile
        if (summary) {
          this.settingsGstin.set(summary.gstin || '');
          this.settingsLegalName.set(summary.legalName || '');
          this.settingsTradeName.set(summary.tradeName || '');
        }
      },
      error: (err) => {
        console.error('Error fetching GST summary:', err);
        this.errorMessage.set(err.error?.error || 'Failed to load GST 3B computation. Please check connection.');
        this.isLoading.set(false);
      }
    });
  }

  onRestaurantChange(id: string) {
    this.selectedRestaurantId.set(id);
    this.loadGstSummary();
  }

  onMonthChange(month: string) {
    this.selectedMonth.set(month);
    this.loadGstSummary();
  }

  onSchemeChange(scheme: 'restaurant_5_no_itc' | 'standard_18_itc') {
    this.selectedScheme.set(scheme);
    this.loadGstSummary();
  }

  setQuickMonth(offset: number) {
    const d = new Date();
    d.setMonth(d.getMonth() + offset);
    const pad = (n: number) => n.toString().padStart(2, '0');
    this.selectedMonth.set(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
    this.loadGstSummary();
  }

  // Filtered sales register
  filteredSales = computed(() => {
    const summary = this.gstSummary();
    if (!summary || !summary.salesRegister) return [];
    const query = this.salesSearchQuery().toLowerCase().trim();
    const type = this.salesOrderTypeFilter().toLowerCase();

    return summary.salesRegister.filter(item => {
      const matchesQuery = !query ||
        item.invoiceNumber.toLowerCase().includes(query) ||
        item.customerMobile.includes(query) ||
        item.paymentMode.toLowerCase().includes(query) ||
        item.date.includes(query);

      const matchesType = type === 'all' || item.orderType.toLowerCase() === type;
      return matchesQuery && matchesType;
    });
  });

  // Filtered purchase register
  filteredPurchases = computed(() => {
    const summary = this.gstSummary();
    if (!summary || !summary.purchaseRegister) return [];
    const query = this.purchaseSearchQuery().toLowerCase().trim();

    return summary.purchaseRegister.filter(item => {
      return !query ||
        item.billNumber.toLowerCase().includes(query) ||
        item.supplierName.toLowerCase().includes(query) ||
        item.supplierGstin.toLowerCase().includes(query) ||
        item.date.includes(query);
    });
  });

  // 1-Click Copy formatted text for CA
  copyCaSummary() {
    const s = this.gstSummary();
    if (!s) return;

    const text = `
*--- GSTR-3B FILING SUMMARY FOR CA ---*
Restaurant: ${s.tradeName} (${s.legalName})
GSTIN: ${s.gstin}
Period: ${s.periodLabel} (FY ${s.year})
Scheme: ${s.scheme === 'restaurant_5_no_itc' ? '5% Restaurant (No ITC)' : '18% Standard (With ITC)'}

TABLE 3.1: OUTWARD TAXABLE SUPPLIES (Food Sales)
• Taxable Value: ₹${s.table3_1.a_outward_taxable_supplies.taxableValue.toFixed(2)}
• Central Tax (CGST 2.5%): ₹${s.table3_1.a_outward_taxable_supplies.centralTax.toFixed(2)}
• State Tax (SGST 2.5%): ₹${s.table3_1.a_outward_taxable_supplies.stateUtTax.toFixed(2)}
• Integrated Tax (IGST): ₹0.00
• Total Output Tax: ₹${(s.table3_1.a_outward_taxable_supplies.centralTax + s.table3_1.a_outward_taxable_supplies.stateUtTax).toFixed(2)}

TABLE 3.1.1: E-COMMERCE SUPPLIES U/S 9(5) (Swiggy / Zomato)
• Taxable Value: ₹${s.table3_1_1.i_supplies_where_eco_pays_tax.taxableValue.toFixed(2)}
• CGST / SGST by ECO: ₹${s.table3_1_1.i_supplies_where_eco_pays_tax.centralTax.toFixed(2)} each

TABLE 4: INPUT TAX CREDIT (ITC)
• Eligible ITC [4(A)(5)]: ₹${(s.table4_itc.A_itc_available._5_all_other_itc.centralTax + s.table4_itc.A_itc_available._5_all_other_itc.stateUtTax).toFixed(2)}
• Ineligible ITC u/s 17(5) [4(D)(1)]: ₹${(s.table4_itc.D_ineligible_itc._1_as_per_section_17_5.centralTax + s.table4_itc.D_ineligible_itc._1_as_per_section_17_5.stateUtTax).toFixed(2)}

TABLE 6.1: PAYMENT OF TAX (NET CASH CHALLAN REQUIRED)
• Net CGST in Cash: ₹${s.table6_1_payment.centralTax.taxPaidInCash.toFixed(2)}
• Net SGST in Cash: ₹${s.table6_1_payment.stateUtTax.taxPaidInCash.toFixed(2)}
• TOTAL CASH CHALLAN DEPOSIT: ₹${s.table6_1_payment.totalCashDepositRequired.toFixed(2)}
---------------------------------------------
Generated via Engineering Tadka GST Portal
`.trim();

    navigator.clipboard.writeText(text).then(() => {
      this.isCopied.set(true);
      setTimeout(() => this.isCopied.set(false), 3000);
    }).catch(err => {
      console.error('Clipboard copy failed:', err);
    });
  }

  downloadCsv(type: 'summary' | 'sales' | 'purchases') {
    this.apiService.downloadGstCsv({
      restaurantId: this.selectedRestaurantId() || undefined,
      month: this.selectedMonth(),
      scheme: this.selectedScheme(),
      type
    }).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `GSTR3B_${this.selectedMonth()}_${type}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      },
      error: (err) => {
        console.error('Error downloading CSV:', err);
        this.errorMessage.set('Failed to download CSV export.');
      }
    });
  }

  saveGstSettings() {
    this.isSavingSettings.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    this.apiService.updateGstSettings({
      restaurantId: this.selectedRestaurantId(),
      gstin: this.settingsGstin().trim(),
      legalName: this.settingsLegalName().trim(),
      tradeName: this.settingsTradeName().trim(),
      state: this.settingsState().trim(),
      stateCode: this.settingsStateCode().trim(),
      filingFrequency: this.settingsFilingFrequency(),
      defaultGstScheme: this.selectedScheme()
    }).subscribe({
      next: () => {
        this.isSavingSettings.set(false);
        this.successMessage.set('GST profile and settings updated successfully!');
        this.loadGstSummary();
        setTimeout(() => this.successMessage.set(''), 4000);
      },
      error: (err) => {
        console.error('Error saving GST settings:', err);
        this.errorMessage.set(err.error?.error || 'Failed to update GST settings.');
        this.isSavingSettings.set(false);
      }
    });
  }
}
