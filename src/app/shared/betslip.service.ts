import { Injectable, computed, signal } from '@angular/core';

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
  private readonly storageKey = 'tipmaster-bets';
  private readonly entriesSignal = signal<BetSelection[]>([]);
  private readonly ticketsSignal = signal<BetTicket[]>(this.loadTickets());

  readonly entries = this.entriesSignal.asReadonly();
  readonly tickets = this.ticketsSignal.asReadonly();
  readonly count = computed(() => this.entriesSignal().length);
  readonly totalOdds = computed(() =>
    this.entriesSignal().reduce((acc, entry) => acc * entry.odds, 1)
  );

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
      return;
    }

    const withoutSameEvent = current.filter((item) => item.eventId !== selection.eventId);
    this.entriesSignal.set([...withoutSameEvent, selection]);
  }

  removeSelection(eventId: string, market: string): void {
    this.entriesSignal.set(
      this.entriesSignal().filter((item) => !(item.eventId === eventId && item.market === market))
    );
  }

  clear(): void {
    this.entriesSignal.set([]);
  }

  isSelected(eventId: string, market: string): boolean {
    return this.entriesSignal().some((item) => item.eventId === eventId && item.market === market);
  }

  placeBet(stake: number): BetTicket | null {
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
    this.saveTickets(next);
    this.clear();
    return ticket;
  }

  clearTickets(): void {
    this.ticketsSignal.set([]);
    this.saveTickets([]);
  }

  private loadTickets(): BetTicket[] {
    if (typeof localStorage === 'undefined') {
      return [];
    }
    try {
      const raw = localStorage.getItem(this.storageKey);
      const parsed = raw ? (JSON.parse(raw) as BetTicket[]) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private saveTickets(items: BetTicket[]): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    localStorage.setItem(this.storageKey, JSON.stringify(items));
  }
}
