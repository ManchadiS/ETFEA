import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService, EmailLog, EmailStatus } from '../../services/api.service';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'app-system-status',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './system-status.component.html',
  styleUrl: './system-status.component.css'
})
export class SystemStatusComponent implements OnInit {
  private apiService = inject(ApiService);

  // States using Signals
  emailStatus = signal<EmailStatus | null>(null);
  emailLogs = signal<EmailLog[]>([]);
  isLoading = signal<boolean>(false);
  isSeeding = signal<boolean>(false);
  message = signal<string>('');
  messageType = signal<'success' | 'error' | ''>('');

  ngOnInit() {
    this.fetchData();
  }

  fetchData() {
    this.isLoading.set(true);
    forkJoin({
      status: this.apiService.getEmailStatus(),
      logs: this.apiService.getEmailLogs()
    }).subscribe({
      next: (res) => {
        this.emailStatus.set(res.status);
        this.emailLogs.set(res.logs.emails);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error fetching system status:', err);
        this.isLoading.set(false);
      }
    });
  }

  clearLogs() {
    if (confirm('Are you sure you want to clear all email logs? This will clear logs in the backend memory.')) {
      this.isLoading.set(true);
      this.apiService.clearEmailLogs().subscribe({
        next: (res) => {
          this.showMessage('Email logs cleared successfully!', 'success');
          this.fetchData();
        },
        error: (err) => {
          this.showMessage('Failed to clear email logs.', 'error');
          this.isLoading.set(false);
        }
      });
    }
  }

  showMessage(msg: string, type: 'success' | 'error') {
    this.message.set(msg);
    this.messageType.set(type);
    setTimeout(() => {
      this.message.set('');
      this.messageType.set('');
    }, 5000);
  }

  seedData() {
    if (true) {
      this.isSeeding.set(true);
      this.showMessage('Seeding data in progress...', 'success');

      // 1. Create Restaurants first
      forkJoin({
        rest1: this.apiService.createRestaurant({ name: 'Engineering Tadka - Main HQ', address: 'Sector 5, Salt Lake, Kolkata' }),
        rest2: this.apiService.createRestaurant({ name: 'Engineering Tadka - Cafe & Bistro', address: 'Park Street, Kolkata' })
      }).subscribe({
        next: (rests) => {
          const id1 = rests.rest1.id;
          const id2 = rests.rest2.id;
          
          if (!id1 || !id2) {
            console.error('Restaurant IDs missing after creation');
            this.isSeeding.set(false);
            this.showMessage('Seeding failed: Restaurant IDs missing.', 'error');
            return;
          }

          // 2. Create Food Items linked to restaurants
          const foods1 = [
            { name: 'Butter Chicken', price: 380, category: 'Main Course', description: 'Rich creamy chicken gravy cooked with butter', restaurantId: id1 },
            { name: 'Paneer Tikka', price: 280, category: 'Starters', description: 'Spiced paneer cubes grilled in tandoor', restaurantId: id1 },
            { name: 'Garlic Naan', price: 60, category: 'Bread', description: 'Indian bread with minced garlic baked in tandoor', restaurantId: id1 },
            { name: 'Jeera Rice', price: 120, category: 'Main Course', description: 'Basmati rice cooked with cumin seeds', restaurantId: id1 },
            { name: 'Chicken Biryani', price: 320, category: 'Main Course', description: 'Fragrant rice layered with spiced chicken', restaurantId: id1 },
            { name: 'Mango Lassi', price: 90, category: 'Beverages', description: 'Traditional sweet yogurt drink flavored with mango', restaurantId: id1 },
            { name: 'Masala Chai', price: 40, category: 'Beverages', description: 'Spiced Indian tea with ginger', restaurantId: id1 },
            { name: 'Gulab Jamun', price: 80, category: 'Desserts', description: 'Deep fried dough balls soaked in sugar syrup', restaurantId: id1 }
          ].map(f => this.apiService.createFoodItem(f));

          const foods2 = [
            { name: 'Chicken Alfredo Pasta', price: 340, category: 'Main Course', description: 'Alfredo sauce with tender chicken over penne', restaurantId: id2 },
            { name: 'Mushroom Risotto', price: 310, category: 'Main Course', description: 'Creamy arborio rice with mixed mushrooms', restaurantId: id2 },
            { name: 'Bruschetta', price: 180, category: 'Starters', description: 'Grilled bread rubbed with garlic and topped with tomatoes', restaurantId: id2 },
            { name: 'Cappuccino', price: 110, category: 'Beverages', description: 'Double espresso with steamed milk foam', restaurantId: id2 },
            { name: 'Chocolate Brownie', price: 150, category: 'Desserts', description: 'Warm fudge brownie served with vanilla ice cream', restaurantId: id2 }
          ].map(f => this.apiService.createFoodItem(f));

          // 3. Create Expenses linked to restaurants
          const expenses1 = [
            { amount: 12000, category: 'Salary', description: 'Staff salary for June 2026', date: '2026-06-20', restaurantId: id1 },
            { amount: 4500, category: 'Utilities', description: 'Gas cylinder and utility refill', date: '2026-06-18', restaurantId: id1 },
            { amount: 8500, category: 'Inventory', description: 'Vegetable and raw meat grocery purchase', date: '2026-06-21', restaurantId: id1 }
          ].map(e => this.apiService.createExpense(e));

          const expenses2 = [
            { amount: 9500, category: 'Salary', description: 'Bistro staff payroll', date: '2026-06-20', restaurantId: id2 },
            { amount: 6200, category: 'Rent', description: 'Monthly space rental for cafe', date: '2026-06-15', restaurantId: id2 },
            { amount: 1500, category: 'Marketing', description: 'Pamphlet printing for local distribution', date: '2026-06-15', restaurantId: id2 }
          ].map(e => this.apiService.createExpense(e));

          forkJoin([...foods1, ...foods2, ...expenses1, ...expenses2]).subscribe({
            next: () => {
              // 4. Create Billing items once food items and expenses are created
              const b1 = this.apiService.createBill({
                amount: 730,
                restaurantId: id1,
                date: '2026-06-21',
                description: 'Dinner - Table 04',
                status: 'paid',
                mobile: '9870859624',
                emailId: 'customer@example.com',
                cgst: 65.7,
                sgst: 65.7,
                foodItems: [
                  { name: 'Chicken Biryani', price: 320, quantity: 2, time: '20:15' },
                  { name: 'Mango Lassi', price: 90, quantity: 1, time: '20:20' }
                ]
              });

              const b2 = this.apiService.createBill({
                amount: 400,
                restaurantId: id1,
                date: '2026-06-22',
                description: 'Lunch - Table 09',
                status: 'pending',
                mobile: '9001234567',
                emailId: 'tester@example.com',
                cgst: 36,
                sgst: 36,
                foodItems: [
                  { name: 'Paneer Tikka', price: 280, quantity: 1, time: '13:10' },
                  { name: 'Jeera Rice', price: 120, quantity: 1, time: '13:15' }
                ]
              });

              const b3 = this.apiService.createBill({
                amount: 490,
                restaurantId: id2,
                date: '2026-06-22',
                description: 'Cafe Table 02',
                status: 'paid',
                mobile: '9888877777',
                emailId: 'bistro_fan@example.com',
                cgst: 44.1,
                sgst: 44.1,
                foodItems: [
                  { name: 'Chicken Alfredo Pasta', price: 340, quantity: 1, time: '15:30' },
                  { name: 'Cappuccino', price: 110, quantity: 1, time: '15:45' }
                ]
              });

              forkJoin([b1, b2, b3]).subscribe({
                next: () => {
                  this.isSeeding.set(false);
                  this.showMessage('Database seeded successfully!', 'success');
                  this.fetchData();
                },
                error: (err) => {
                  console.error('Error seeding bills:', err);
                  this.isSeeding.set(false);
                  this.showMessage('Error seeding bills.', 'error');
                }
              });
            },
            error: (err) => {
              console.error('Error seeding core items:', err);
              this.isSeeding.set(false);
              this.showMessage('Error seeding core models.', 'error');
            }
          });
        },
        error: (err) => {
          console.error('Error creating seed restaurants:', err);
          this.isSeeding.set(false);
          this.showMessage('Error creating restaurants.', 'error');
        }
      });
    }
  }
}
