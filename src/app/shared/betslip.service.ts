import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';

export interface BetSelection {
  eventId: string;
  sport: string;
  homeTeam: string;
  awayTeam: string;
  kickoff: string;
  market: string;
  odds: number;
}

export interface BetTicket {
  id: string;
  placedAt: string;
  stake: number;
  totalOdds: number;
  potentialWin: number;
  selections: BetSelection[];
}

@Injectable({ providedIn: 'root' })
export class BetSlipService {
  private readonly authService = inject(AuthService);
  private readonly entriesStorageKey = 'tipmaster-betslip';
  private readonly ticketsStoragePrefix = 'tipmaster-bets';
  private readonly entriesSignal = signal<BetSelection[]>([]);
  private readonly ticketsSignal = signal<BetTicket[]>([]);

  readonly entries = this.entriesSignal.asReadonly();
  readonly tickets = this.ticketsSignal.asReadonly();
  readonly count = computed(() => this.entriesSignal().length);
  readonly totalOdds = computed(() =>
    this.entriesSignal().reduce((acc, entry) => acc * entry.odds, 1)
  );

  constructor() {
    this.entriesSignal.set(this.loadEntries());

    effect(() => {
      const user = this.authService.currentUser();
      this.ticketsSignal.set(this.loadTickets(user?.id));
    });
  }

  toggleSelection(selection: BetSelection): void {
    const current = this.entriesSignal();
    const exists = current.find(
      (item) => item.eventId === selection.eventId && item.market === selection.market
    );

    if (exists) {
      this.entriesSignal.set(
        current.filter(
          (item) => !(item.eventId === selection.eventId && item.market === selection.market)
        )
      );
      this.saveEntries(this.entriesSignal());
      return;
    }

    const withoutSameEvent = current.filter((item) => item.eventId !== selection.eventId);
    this.entriesSignal.set([...withoutSameEvent, selection]);
    this.saveEntries(this.entriesSignal());
  }

  removeSelection(eventId: string, market: string): void {
    this.entriesSignal.set(
      this.entriesSignal().filter((item) => !(item.eventId === eventId && item.market === market))
    );
    this.saveEntries(this.entriesSignal());
  }

  clear(): void {
    this.entriesSignal.set([]);
    this.saveEntries([]);
  }

  isSelected(eventId: string, market: string): boolean {
    return this.entriesSignal().some((item) => item.eventId === eventId && item.market === market);
  }

  placeBet(stake: number): BetTicket | null {
    const userId = this.authService.currentUser()?.id;
    if (!userId) {
      return null;
    }

    const selections = this.entriesSignal();
    if (!selections.length) {
      return null;
    }

    const totalOdds = this.totalOdds();
    const ticket: BetTicket = {
      id: `ticket-${Date.now()}`,
      placedAt: new Date().toISOString(),
      stake,
      totalOdds,
      potentialWin: totalOdds * stake,
      selections,
    };

    const next = [ticket, ...this.ticketsSignal()];
    this.ticketsSignal.set(next);
    this.saveTickets(next, userId);
    this.clear();
    return ticket;
  }

  clearTickets(): void {
    this.ticketsSignal.set([]);
    this.saveTickets([], this.authService.currentUser()?.id);
  }

  private loadEntries(): BetSelection[] {
    if (typeof localStorage === 'undefined') {
      return [];
    }
    try {
      const raw = localStorage.getItem(this.entriesStorageKey);
      const parsed = raw ? (JSON.parse(raw) as BetSelection[]) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private saveEntries(items: BetSelection[]): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    localStorage.setItem(this.entriesStorageKey, JSON.stringify(items));
  }

  private loadTickets(userId?: string): BetTicket[] {
    if (!userId) {
      return [];
    }
    if (typeof localStorage === 'undefined') {
      return [];
    }
    try {
      const raw = localStorage.getItem(this.ticketsKey(userId));
      const parsed = raw ? (JSON.parse(raw) as BetTicket[]) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private saveTickets(items: BetTicket[], userId?: string): void {
    if (!userId || typeof localStorage === 'undefined') {
      return;
    }
    localStorage.setItem(this.ticketsKey(userId), JSON.stringify(items));
  }
  private ticketsKey(userId: string): string {
    return `${this.ticketsStoragePrefix}:${userId}`;
  }
}
