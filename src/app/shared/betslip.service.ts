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

@Injectable({ providedIn: 'root' })
export class BetSlipService {
  private readonly entriesSignal = signal<BetSelection[]>([]);

  readonly entries = this.entriesSignal.asReadonly();
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

    this.entriesSignal.set([...current, selection]);
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
}
