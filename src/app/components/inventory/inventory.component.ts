import { Component, inject, OnInit, signal, effect, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { 
  ApiService, 
  InventoryItem, 
  Restaurant, 
  Recipe, 
  RecipeIngredient, 
  DailyInventoryReport 
} from '../../services/api.service';

@Component({
  selector: 'app-inventory',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './inventory.component.html',
  styleUrl: './inventory.component.css'
})
export class InventoryComponent implements OnInit {
  private apiService = inject(ApiService);
  private route = inject(ActivatedRoute);

  hasDeleteAccess(): boolean {
    const user = this.apiService.currentUser();
    if (!user) return false;
    if (user.email === 'sagarmanchadi324@gmail.com' || user.role === 'Super Admin') {
      return true;
    }
    return user.rights?.deleteAccess || false;
  }

  // Active Main Tab
  mainTab = signal<'stock' | 'recipes' | 'daily-report'>('stock');

  // ================= 1. STOCK STATE =================
  inventoryItems = signal<InventoryItem[]>([]);
  filteredItems = signal<InventoryItem[]>([]);
  restaurants = signal<Restaurant[]>([]);
  isLoading = signal<boolean>(false);
  searchQuery = signal<string>('');
  showModal = signal<boolean>(false);
  errorMessage = signal<string>('');
  activeFilter = signal<'All' | 'InStock' | 'LowStock' | 'OutOfStock'>('All');

  // Stock Inventory Pagination (1 page 10)
  currentPage = signal<number>(1);
  pageSize = signal<number>(10);

  totalPages = computed(() => {
    const total = this.filteredItems().length;
    return Math.max(1, Math.ceil(total / this.pageSize()));
  });

  paginatedItems = computed(() => {
    const page = this.currentPage();
    const size = this.pageSize();
    const start = (page - 1) * size;
    return this.filteredItems().slice(start, start + size);
  });

  pageStartRecord = computed(() => {
    if (this.filteredItems().length === 0) return 0;
    return (this.currentPage() - 1) * this.pageSize() + 1;
  });

  pageEndRecord = computed(() => {
    return Math.min(this.currentPage() * this.pageSize(), this.filteredItems().length);
  });

  paginationPages = computed(() => {
    const total = this.totalPages();
    const current = this.currentPage();
    const pages: (number | string)[] = [];

    if (total <= 7) {
      for (let i = 1; i <= total; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);
      if (current > 3) {
        pages.push('...');
      }
      const start = Math.max(2, current - 1);
      const end = Math.min(total - 1, current + 1);
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      if (current < total - 2) {
        pages.push('...');
      }
      pages.push(total);
    }
    return pages;
  });

  isEditing = false;
  modalTitle = 'Add Supply Item';
  currentId = '';
  name = '';
  restaurantId = '';
  quantity = 0;
  unit = 'kg';
  threshold = 10;

  // Quick Restock Modal
  showRestockModal = signal<boolean>(false);
  selectedRestockItem: InventoryItem | null = null;
  restockQty = 0;
  restockSupplier = '';
  restockCost = 0;

  // ================= 2. RECIPES STATE =================
  recipes = signal<Recipe[]>([]);
  filteredRecipes = signal<Recipe[]>([]);
  recipeSearchQuery = signal<string>('');
  recipeApplianceFilter = signal<string>('All');
  recipeCategoryFilter = signal<string>('All');
  isRecipesLoading = signal<boolean>(false);
  showRecipeModal = signal<boolean>(false);
  isEditingRecipe = false;
  recipeModalTitle = 'Create New Recipe';

  // Recipe Form Fields
  recipeId = '';
  recipeDishName = '';
  recipeDishId = '';
  recipeCategory = 'Sandwiches';
  recipeAppliance = 'Sandwich Maker';
  recipeYieldPortions = 1;
  recipeIngredients: RecipeIngredient[] = [];
  recipeNotes = '';
  recipeIsActive = true;
  recipeErrorMessage = signal<string>('');

  // Appliance Options
  applianceOptions = [
    { label: '🥪 Sandwich Maker', value: 'Sandwich Maker' },
    { label: '🍟 Air Fryer (0 Oil)', value: 'Air Fryer' },
    { label: '⚡ Induction Cooktop', value: 'Induction' },
    { label: '📡 Microwave Oven', value: 'Microwave' },
    { label: '🌪️ Mixer & Grinder', value: 'Mixer' },
    { label: '🥗 Assembly / Packaged', value: 'Assembly' }
  ];

  categoryOptions = ['All', 'Sandwiches', 'Shawarma', 'Sides', 'Main Course', 'Beverages', 'Combos'];

  // ================= 3. DAILY REPORT STATE =================
  dailyReportDate = signal<string>(new Date().toISOString().split('T')[0]);
  dailyReport = signal<DailyInventoryReport | null>(null);
  isDailyReportLoading = signal<boolean>(false);
  dailyReportSearch = signal<string>('');
  dailyReportStatusFilter = signal<'All' | 'healthy' | 'low' | 'out'>('All');

  constructor() {
    effect(() => {
      this.apiService.selectedRestaurantId();
      this.fetchInventoryItems();
      this.fetchRecipes();
      this.fetchDailyReport();
    });
  }

  ngOnInit() {
    this.fetchRestaurants();
    this.route.queryParams.subscribe(params => {
      if (params['tab'] === 'recipes') {
        this.mainTab.set('recipes');
      } else if (params['tab'] === 'daily-report') {
        this.mainTab.set('daily-report');
      }
    });
  }

  setMainTab(tab: 'stock' | 'recipes' | 'daily-report') {
    this.mainTab.set(tab);
    if (tab === 'recipes') {
      this.fetchRecipes();
    } else if (tab === 'daily-report') {
      this.fetchDailyReport();
    } else {
      this.fetchInventoryItems();
    }
  }

  fetchRestaurants() {
    this.apiService.getRestaurants().subscribe({
      next: (list) => this.restaurants.set(list),
      error: (err) => console.error('Error fetching restaurants:', err)
    });
  }

  // ================= 1. STOCK METHODS =================
  fetchInventoryItems() {
    this.isLoading.set(true);
    const restId = this.apiService.selectedRestaurantId();
    this.apiService.getInventoryItems(restId).subscribe({
      next: (list) => {
        this.inventoryItems.set(list);
        this.filterItems();
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error fetching inventory items:', err);
        this.isLoading.set(false);
      }
    });
  }

  filterItems() {
    const list = this.inventoryItems();
    const query = this.searchQuery().trim().toLowerCase();
    const filter = this.activeFilter();

    const filtered = list.filter(item => {
      const matchesSearch = !query || item.name.toLowerCase().includes(query);
      if (!matchesSearch) return false;

      const qty = item.quantity !== undefined ? item.quantity : 0;
      const thres = item.threshold !== undefined ? item.threshold : 10;

      if (filter === 'OutOfStock') {
        return qty === 0;
      } else if (filter === 'LowStock') {
        return qty > 0 && qty <= thres;
      } else if (filter === 'InStock') {
        return qty > thres;
      }
      return true;
    });

    this.filteredItems.set(filtered);
    if (this.currentPage() > Math.ceil(filtered.length / this.pageSize())) {
      this.currentPage.set(1);
    }
  }

  setFilter(filter: 'All' | 'InStock' | 'LowStock' | 'OutOfStock') {
    this.activeFilter.set(filter);
    this.currentPage.set(1);
    this.filterItems();
  }

  onSearch() {
    this.currentPage.set(1);
    this.filterItems();
  }

  goToPage(page: number | string) {
    if (typeof page === 'string') return;
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
    }
  }

  nextPage() {
    if (this.currentPage() < this.totalPages()) {
      this.currentPage.update(p => p + 1);
    }
  }

  prevPage() {
    if (this.currentPage() > 1) {
      this.currentPage.update(p => p - 1);
    }
  }

  changePageSize(size: number) {
    this.pageSize.set(Number(size));
    this.currentPage.set(1);
  }

  getMetricsCount(type: 'Total' | 'LowStock' | 'OutOfStock'): number {
    const list = this.inventoryItems();
    if (type === 'Total') return list.length;
    if (type === 'LowStock') {
      return list.filter(i => (i.quantity || 0) > 0 && (i.quantity || 0) <= (i.threshold !== undefined ? i.threshold : 10)).length;
    }
    if (type === 'OutOfStock') {
      return list.filter(i => (i.quantity || 0) === 0).length;
    }
    return 0;
  }

  openAddModal() {
    this.isEditing = false;
    this.modalTitle = 'Add Supply Item';
    this.currentId = '';
    this.name = '';
    this.restaurantId = this.apiService.selectedRestaurantId() || (this.restaurants()[0]?.id || '');
    this.quantity = 0;
    this.unit = 'kg';
    this.threshold = 10;
    this.errorMessage.set('');
    this.showModal.set(true);
  }

  openEditModal(item: InventoryItem) {
    this.isEditing = true;
    this.modalTitle = 'Edit Supply Item';
    this.currentId = item.id || '';
    this.name = item.name;
    this.restaurantId = item.restaurantId;
    this.quantity = item.quantity !== undefined ? item.quantity : 0;
    this.unit = item.unit || 'units';
    this.threshold = item.threshold !== undefined ? item.threshold : 10;
    this.errorMessage.set('');
    this.showModal.set(true);
  }

  closeModal() {
    this.showModal.set(false);
  }

  saveInventoryItem() {
    if (!this.name.trim()) {
      this.errorMessage.set('Supply item name is required.');
      return;
    }
    if (!this.restaurantId) {
      this.errorMessage.set('Please select a restaurant.');
      return;
    }
    if (this.quantity < 0) {
      this.errorMessage.set('Quantity cannot be negative.');
      return;
    }

    const payload: Partial<InventoryItem> = {
      name: this.name.trim(),
      restaurantId: this.restaurantId,
      quantity: Number(this.quantity),
      unit: this.unit.trim(),
      threshold: Number(this.threshold)
    };

    if (this.isEditing && this.currentId) {
      this.apiService.updateInventoryItem(this.currentId, payload).subscribe({
        next: () => {
          this.closeModal();
          this.fetchInventoryItems();
        },
        error: (err) => {
          console.error('Error updating inventory item:', err);
          this.errorMessage.set(err.error?.error || 'Failed to update supply item.');
        }
      });
    } else {
      this.apiService.createInventoryItem(payload).subscribe({
        next: () => {
          this.closeModal();
          this.fetchInventoryItems();
        },
        error: (err) => {
          console.error('Error creating inventory item:', err);
          this.errorMessage.set(err.error?.error || 'Failed to create supply item.');
        }
      });
    }
  }

  deleteInventoryItem(id?: string) {
    if (!id) return;
    if (!confirm('Are you sure you want to delete this supply item?')) return;

    this.apiService.deleteInventoryItem(id).subscribe({
      next: () => this.fetchInventoryItems(),
      error: (err) => console.error('Error deleting inventory item:', err)
    });
  }

  // Quick Restock
  openRestockModal(item: InventoryItem) {
    this.selectedRestockItem = item;
    this.restockQty = item.threshold ? item.threshold * 2 : 10;
    this.restockSupplier = 'Local Distributor';
    this.restockCost = 0;
    this.showRestockModal.set(true);
  }

  closeRestockModal() {
    this.showRestockModal.set(false);
    this.selectedRestockItem = null;
  }

  confirmRestock() {
    if (!this.selectedRestockItem || !this.selectedRestockItem.id) return;
    if (this.restockQty <= 0) {
      alert('Restock quantity must be greater than 0.');
      return;
    }

    const restId = this.selectedRestockItem.restaurantId || this.apiService.selectedRestaurantId();
    const item = this.selectedRestockItem;
    if (!item.id) return;
    const itemId: string = item.id;
    const addQty = Number(this.restockQty);
    const newTotal = (item.quantity || 0) + addQty;

    // 1. Update inventory item quantity
    this.apiService.updateInventoryItem(itemId, { quantity: newTotal }).subscribe({
      next: () => {
        // 2. Also log as purchase bill if cost > 0 or supplier is given
        if (this.restockCost > 0) {
          this.apiService.createPurchaseBill({
            restaurantId: restId,
            supplierName: this.restockSupplier || 'Supplier Delivery',
            date: new Date().toISOString().split('T')[0],
            items: [{
              inventoryItemId: item.id || '',
              name: item.name,
              quantity: addQty,
              unit: item.unit || 'units',
              pricePerUnit: Math.round((this.restockCost / addQty) * 100) / 100,
              total: Number(this.restockCost)
            }],
            totalAmount: Number(this.restockCost),
            paymentMode: 'Cash',
            status: 'paid'
          }).subscribe();
        }

        this.closeRestockModal();
        this.fetchInventoryItems();
      },
      error: (err) => {
        console.error('Error during restock:', err);
        alert('Failed to update stock quantity.');
      }
    });
  }

  // ================= 2. RECIPES METHODS =================
  fetchRecipes() {
    this.isRecipesLoading.set(true);
    const restId = this.apiService.selectedRestaurantId();
    this.apiService.getRecipes(restId).subscribe({
      next: (list) => {
        this.recipes.set(list);
        this.filterRecipes();
        this.isRecipesLoading.set(false);
      },
      error: (err) => {
        console.error('Error fetching recipes:', err);
        this.isRecipesLoading.set(false);
      }
    });
  }

  filterRecipes() {
    const list = this.recipes();
    const query = this.recipeSearchQuery().trim().toLowerCase();
    const appliance = this.recipeApplianceFilter();
    const category = this.recipeCategoryFilter();

    const filtered = list.filter(r => {
      const matchesSearch = !query || 
        r.dishName.toLowerCase().includes(query) || 
        (r.category && r.category.toLowerCase().includes(query)) ||
        (r.ingredients && r.ingredients.some(ing => ing.inventoryItemName.toLowerCase().includes(query)));

      if (!matchesSearch) return false;

      if (appliance !== 'All' && r.appliance !== appliance) return false;
      if (category !== 'All' && r.category !== category) return false;

      return true;
    });

    this.filteredRecipes.set(filtered);
  }

  onRecipeSearch() {
    this.filterRecipes();
  }

  setRecipeApplianceFilter(appliance: string) {
    this.recipeApplianceFilter.set(appliance);
    this.filterRecipes();
  }

  setRecipeCategoryFilter(category: string) {
    this.recipeCategoryFilter.set(category);
    this.filterRecipes();
  }

  openAddRecipeModal() {
    this.isEditingRecipe = false;
    this.recipeModalTitle = 'Create New Recipe';
    this.recipeId = '';
    this.recipeDishName = '';
    this.recipeDishId = '';
    this.recipeCategory = 'Sandwiches';
    this.recipeAppliance = 'Sandwich Maker';
    this.recipeYieldPortions = 1;
    this.recipeNotes = '';
    this.recipeIsActive = true;
    this.recipeErrorMessage.set('');

    // Start with 2 blank ingredient rows
    this.recipeIngredients = [
      { inventoryItemId: '', inventoryItemName: '', quantity: 0.1, unit: 'kg' },
      { inventoryItemId: '', inventoryItemName: '', quantity: 0.02, unit: 'kg' }
    ];

    this.showRecipeModal.set(true);
  }

  openEditRecipeModal(recipe: Recipe) {
    this.isEditingRecipe = true;
    this.recipeModalTitle = `Edit Recipe: ${recipe.dishName}`;
    this.recipeId = recipe.id || '';
    this.recipeDishName = recipe.dishName;
    this.recipeDishId = recipe.dishId || '';
    this.recipeCategory = recipe.category || 'General';
    this.recipeAppliance = recipe.appliance || 'Assembly';
    this.recipeYieldPortions = recipe.yieldPortions || 1;
    this.recipeNotes = recipe.notes || '';
    this.recipeIsActive = recipe.isActive !== undefined ? recipe.isActive : true;
    this.recipeErrorMessage.set('');

    // Clone ingredients
    this.recipeIngredients = (recipe.ingredients || []).map(ing => ({
      inventoryItemId: ing.inventoryItemId,
      inventoryItemName: ing.inventoryItemName,
      quantity: ing.quantity,
      unit: ing.unit || 'units'
    }));

    if (this.recipeIngredients.length === 0) {
      this.recipeIngredients.push({ inventoryItemId: '', inventoryItemName: '', quantity: 0.1, unit: 'kg' });
    }

    this.showRecipeModal.set(true);
  }

  closeRecipeModal() {
    this.showRecipeModal.set(false);
  }

  addIngredientRow() {
    this.recipeIngredients.push({
      inventoryItemId: '',
      inventoryItemName: '',
      quantity: 0.05,
      unit: 'kg'
    });
  }

  removeIngredientRow(index: number) {
    if (this.recipeIngredients.length <= 1) {
      alert('A recipe must have at least 1 ingredient.');
      return;
    }
    this.recipeIngredients.splice(index, 1);
  }

  onIngredientSelected(index: number, itemId: string) {
    const inv = this.inventoryItems().find(i => i.id === itemId);
    if (inv) {
      this.recipeIngredients[index].inventoryItemId = inv.id || '';
      this.recipeIngredients[index].inventoryItemName = inv.name;
      this.recipeIngredients[index].unit = inv.unit || 'units';
    }
  }

  saveRecipe() {
    if (!this.recipeDishName.trim()) {
      this.recipeErrorMessage.set('Dish name is required.');
      return;
    }

    const restId = this.apiService.selectedRestaurantId() || this.restaurants()[0]?.id || '';
    if (!restId) {
      this.recipeErrorMessage.set('Please select an active restaurant.');
      return;
    }

    // Validate ingredient rows
    for (let i = 0; i < this.recipeIngredients.length; i++) {
      const ing = this.recipeIngredients[i];
      if (!ing.inventoryItemId && !ing.inventoryItemName) {
        this.recipeErrorMessage.set(`Please choose a supply item for ingredient row #${i + 1}.`);
        return;
      }
      if (ing.quantity <= 0) {
        this.recipeErrorMessage.set(`Quantity for ${ing.inventoryItemName || 'ingredient #' + (i + 1)} must be greater than 0.`);
        return;
      }
    }

    const payload: Partial<Recipe> = {
      restaurantId: restId,
      dishName: this.recipeDishName.trim(),
      dishId: this.recipeDishId || undefined,
      category: this.recipeCategory,
      appliance: this.recipeAppliance,
      yieldPortions: Number(this.recipeYieldPortions || 1),
      ingredients: this.recipeIngredients,
      notes: this.recipeNotes.trim(),
      isActive: this.recipeIsActive
    };

    if (this.isEditingRecipe && this.recipeId) {
      this.apiService.updateRecipe(this.recipeId, payload).subscribe({
        next: () => {
          this.closeRecipeModal();
          this.fetchRecipes();
        },
        error: (err) => {
          console.error('Error updating recipe:', err);
          this.recipeErrorMessage.set(err.error?.error || 'Failed to update recipe.');
        }
      });
    } else {
      this.apiService.createRecipe(payload).subscribe({
        next: () => {
          this.closeRecipeModal();
          this.fetchRecipes();
        },
        error: (err) => {
          console.error('Error creating recipe:', err);
          this.recipeErrorMessage.set(err.error?.error || 'Failed to create recipe.');
        }
      });
    }
  }

  deleteRecipe(id?: string) {
    if (!id) return;
    if (!confirm('Are you sure you want to delete this recipe? Auto-deductions for this dish will stop.')) return;

    this.apiService.deleteRecipe(id).subscribe({
      next: () => this.fetchRecipes(),
      error: (err) => console.error('Error deleting recipe:', err)
    });
  }

  seedStandardRecipes() {
    const restId = this.apiService.selectedRestaurantId() || this.restaurants()[0]?.id || '';
    if (!restId) return;

    if (!confirm('Do you want to sync/reset the 47 standard recipes for Engineering Tadka (Sandwiches in Sandwich Maker, Air Fryer items 0 oil, Biryani with Ghee+Oil)?')) {
      return;
    }

    this.isRecipesLoading.set(true);
    this.apiService.seedDefaultRecipes(restId).subscribe({
      next: (res) => {
        alert(res.message || 'Recipes synchronized successfully!');
        this.fetchRecipes();
      },
      error: (err) => {
        console.error('Error syncing default recipes:', err);
        alert('Failed to sync recipes.');
        this.isRecipesLoading.set(false);
      }
    });
  }

  // ================= 3. DAILY REPORT METHODS =================
  fetchDailyReport() {
    const restId = this.apiService.selectedRestaurantId();
    if (!restId) return;

    this.isDailyReportLoading.set(true);
    this.apiService.getDailyInventoryReport(restId, this.dailyReportDate()).subscribe({
      next: (report) => {
        this.dailyReport.set(report);
        this.isDailyReportLoading.set(false);
      },
      error: (err) => {
        console.error('Error fetching daily inventory report:', err);
        this.isDailyReportLoading.set(false);
      }
    });
  }

  onDailyDateChange(newDate: string) {
    this.dailyReportDate.set(newDate);
    this.fetchDailyReport();
  }

  setTodayDailyDate() {
    const today = new Date().toISOString().split('T')[0];
    this.onDailyDateChange(today);
  }

  filteredDailyItems() {
    const report = this.dailyReport();
    if (!report || !report.items) return [];

    const query = this.dailyReportSearch().trim().toLowerCase();
    const filter = this.dailyReportStatusFilter();

    return report.items.filter(item => {
      const matchesSearch = !query || item.name.toLowerCase().includes(query);
      if (!matchesSearch) return false;

      if (filter !== 'All' && item.status !== filter) return false;

      return true;
    });
  }

  // Daily Report Pagination (1 page 10)
  dailyCurrentPage = signal<number>(1);
  dailyPageSize = signal<number>(10);

  dailyTotalPages = computed(() => {
    const total = this.filteredDailyItems().length;
    return Math.max(1, Math.ceil(total / this.dailyPageSize()));
  });

  paginatedDailyItems = computed(() => {
    const items = this.filteredDailyItems();
    const page = this.dailyCurrentPage();
    const size = this.dailyPageSize();
    const start = (page - 1) * size;
    return items.slice(start, start + size);
  });

  dailyPageStartRecord = computed(() => {
    if (this.filteredDailyItems().length === 0) return 0;
    return (this.dailyCurrentPage() - 1) * this.dailyPageSize() + 1;
  });

  dailyPageEndRecord = computed(() => {
    return Math.min(this.dailyCurrentPage() * this.dailyPageSize(), this.filteredDailyItems().length);
  });

  dailyPaginationPages = computed(() => {
    const total = this.dailyTotalPages();
    const current = this.dailyCurrentPage();
    const pages: (number | string)[] = [];

    if (total <= 7) {
      for (let i = 1; i <= total; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);
      if (current > 3) {
        pages.push('...');
      }
      const start = Math.max(2, current - 1);
      const end = Math.min(total - 1, current + 1);
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      if (current < total - 2) {
        pages.push('...');
      }
      pages.push(total);
    }
    return pages;
  });

  goToDailyPage(page: number | string) {
    if (typeof page === 'string') return;
    if (page >= 1 && page <= this.dailyTotalPages()) {
      this.dailyCurrentPage.set(page);
    }
  }

  nextDailyPage() {
    if (this.dailyCurrentPage() < this.dailyTotalPages()) {
      this.dailyCurrentPage.update(p => p + 1);
    }
  }

  prevDailyPage() {
    if (this.dailyCurrentPage() > 1) {
      this.dailyCurrentPage.update(p => p - 1);
    }
  }

  changeDailyPageSize(size: number) {
    this.dailyPageSize.set(Number(size));
    this.dailyCurrentPage.set(1);
  }

  formatNumber(val?: number): string {
    if (val === undefined || val === null) return '0';
    return Number(val).toLocaleString('en-IN', { maximumFractionDigits: 3 });
  }
}
