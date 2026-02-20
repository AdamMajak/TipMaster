import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { BetSlipService } from './shared/betslip.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule, DatePipe],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  private readonly betSlipService = inject(BetSlipService);

  protected readonly title = signal('TipMaster');
  protected stake = 10;

  protected readonly selections = this.betSlipService.entries;
  protected readonly selectionCount = this.betSlipService.count;
  protected readonly totalOdds = computed(() => {
    const count = this.betSlipService.count();
    return count ? this.betSlipService.totalOdds().toFixed(2) : '0.00';
  });

  protected removeSelection(eventId: string, market: string): void {
    this.betSlipService.removeSelection(eventId, market);
  }

  protected clearTicket(): void {
    this.betSlipService.clear();
  }

  protected potentialWin(): string {
    if (!this.betSlipService.count()) {
      return '0.00';
    }
    return (this.betSlipService.totalOdds() * this.stake).toFixed(2);
  }
}
