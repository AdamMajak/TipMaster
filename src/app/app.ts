import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { BetSlipService } from './shared/betslip.service';
import { AuthService } from './shared/auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule, DatePipe],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  private readonly betSlipService = inject(BetSlipService);
  private readonly authService = inject(AuthService);

  protected readonly title = signal('TipMaster');
  protected stake = 10;
  protected authMode: 'login' | 'register' = 'login';
  protected loginEmail = '';
  protected loginPassword = '';
  protected registerName = '';
  protected registerEmail = '';
  protected registerPassword = '';
  protected authMessage = '';

  protected readonly selections = this.betSlipService.entries;
  protected readonly selectionCount = this.betSlipService.count;
  protected readonly tickets = this.betSlipService.tickets;
  protected readonly currentUser = this.authService.currentUser;
  protected readonly isAuthenticated = this.authService.isAuthenticated;
  protected readonly canPlaceBet = computed(
    () => this.betSlipService.count() > 0 && this.stake > 0
  );

  protected readonly totalOdds = computed(() => {
    const count = this.betSlipService.count();
    return count ? this.betSlipService.totalOdds().toFixed(2) : '0.00';
  });

  protected setAuthMode(mode: 'login' | 'register'): void {
    this.authMode = mode;
    this.authMessage = '';
  }

  protected login(): void {
    const result = this.authService.login(this.loginEmail, this.loginPassword);
    if (!result.ok) {
      this.authMessage = result.message;
      return;
    }

    this.authMessage = '';
    this.loginPassword = '';
  }

  protected register(): void {
    const result = this.authService.register(
      this.registerName,
      this.registerEmail,
      this.registerPassword
    );
    if (!result.ok) {
      this.authMessage = result.message;
      return;
    }

    this.authMessage = '';
    this.registerPassword = '';
    this.authMode = 'login';
  }

  protected logout(): void {
    this.authService.logout();
  }

  protected removeSelection(eventId: string, market: string): void {
    this.betSlipService.removeSelection(eventId, market);
  }

  protected clearTicket(): void {
    this.betSlipService.clear();
  }

  protected placeBet(): void {
    if (!this.isAuthenticated()) {
      this.authMessage = 'Login first to place bets.';
      return;
    }
    this.betSlipService.placeBet(this.stake);
  }

  protected clearHistory(): void {
    this.betSlipService.clearTickets();
  }

  protected potentialWin(): string {
    if (!this.betSlipService.count()) {
      return '0.00';
    }
    return (this.betSlipService.totalOdds() * this.stake).toFixed(2);
  }
}
