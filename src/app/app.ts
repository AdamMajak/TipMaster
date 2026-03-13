import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { NavigationEnd, Router, RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { BetSlipService } from './shared/betslip.service';
import { Bet365Service, Bet365League } from './shared/bet365.service';
import { filter } from 'rxjs';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule, DatePipe],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  private readonly betSlipService = inject(BetSlipService);
  private readonly bet365Service = inject(Bet365Service);
  private readonly router = inject(Router);

  protected readonly title = signal('TipMaster');
  protected stake = 10;

  protected readonly selections = this.betSlipService.entries;
  protected readonly selectionCount = this.betSlipService.count;
  protected readonly tickets = this.betSlipService.tickets;

  protected readonly currentSport = signal<'football' | 'hockey' | 'tennis' | null>(null);
  protected readonly currentSportLabel = computed(() => {
    const value = this.currentSport();
    if (value === 'football') return 'Football';
    if (value === 'hockey') return 'Hockey';
    if (value === 'tennis') return 'Tennis';
    return 'Leagues';
  });

  protected readonly leaguesLoading = signal(false);
  protected readonly leaguesError = signal<string | null>(null);
  protected readonly leagues = signal<Bet365League[]>([]);
  protected readonly leagueSearch = signal('');
  protected readonly visibleLeagues = computed(() => {
    const sport = this.currentSport();
    if (!sport) return [];
    return this.filterLeaguesFor(sport);
  });

  constructor() {
    this.setSportFromUrl(this.router.url);
    this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe(() => {
      this.setSportFromUrl(this.router.url);
    });
    this.loadLeagues(false);
  }

  protected readonly totalOdds = computed(() => {
    const count = this.betSlipService.count();
    return count ? this.betSlipService.totalOdds().toFixed(2) : '0.00';
  });

  protected refreshLeagues(): void {
    this.loadLeagues(true);
  }

  protected removeSelection(eventId: string, market: string): void {
    this.betSlipService.removeSelection(eventId, market);
  }

  protected clearTicket(): void {
    this.betSlipService.clear();
  }

  protected placeBet(): void {
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

  private loadLeagues(forceRefresh: boolean): void {
    this.leaguesLoading.set(true);
    this.leaguesError.set(null);

    this.bet365Service.getLeagues(forceRefresh).subscribe({
      next: (leagues) => {
        this.leagues.set(leagues ?? []);
        this.leaguesLoading.set(false);
        if (!this.leagues().length) {
          this.leaguesError.set('No leagues returned from API. Check RapidAPI key/plan or required params.');
        }
      },
      error: (err) => {
        this.leaguesLoading.set(false);
        const message =
          err?.error?.message ??
          err?.message ??
          (typeof err === 'string' ? err : null) ??
          'Failed to load leagues.';
        this.leaguesError.set(message);
      },
    });
  }

  private filterLeaguesFor(sport: 'football' | 'hockey' | 'tennis'): Bet365League[] {
    const all = this.leagues();
    const query = this.leagueSearch().trim().toLowerCase();

    const base = all.filter((league) => this.isLeagueSport(league, sport));

    if (!query) {
      return base.slice(0, 60);
    }

    return base
      .filter((league) => {
        const name = (league.name ?? '').toLowerCase();
        return name.includes(query);
      })
      .slice(0, 60);
  }

  private isLeagueSport(league: Bet365League, sport: 'football' | 'hockey' | 'tennis'): boolean {
    const raw = (league.sport ?? '').toLowerCase();

    if (!raw) {
      return false;
    }

    if (sport === 'football') {
      return raw.includes('soccer') || raw.includes('football');
    }

    if (sport === 'hockey') {
      return raw.includes('hockey') || raw.includes('icehockey') || raw.includes('ice-hockey');
    }

    return raw.includes('tennis');
  }

  private setSportFromUrl(url: string): void {
    const lower = (url ?? '').toLowerCase();
    if (lower.startsWith('/football')) {
      this.currentSport.set('football');
      return;
    }
    if (lower.startsWith('/hockey')) {
      this.currentSport.set('hockey');
      return;
    }
    if (lower.startsWith('/tennis')) {
      this.currentSport.set('tennis');
      return;
    }
    this.currentSport.set(null);
  }
}
