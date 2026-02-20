import { DatePipe } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { OddsEvent, OddsService } from '../shared/odds.service';
import { SPORT_KEYS } from '../shared/rapidapi-odds';
import { BetSlipService } from '../shared/betslip.service';

interface SportMatch {
  id: string;
  kickoff: string;
  homeTeam: string;
  awayTeam: string;
  bookmaker: string;
  odds: Array<{ name: string; price: number }>;
}

@Component({
  selector: 'app-tennis',
  imports: [DatePipe],
  templateUrl: './tennis.html',
  styleUrl: './tennis.css',
})
export class Tennis implements OnInit {
  readonly pageTitle = 'Tennis Events';
  readonly subtitle = 'Live tennis events from Betfair Orbit API.';

  loading = true;
  error = '';
  matches: SportMatch[] = [];
  selectedMatch: SportMatch | null = null;

  constructor(
    private readonly oddsService: OddsService,
    private readonly betSlipService: BetSlipService
  ) {}

  ngOnInit(): void {
    this.oddsService.getOddsBySport(SPORT_KEYS.tennis).subscribe({
      next: (events) => {
        this.matches = events.slice(0, 16).map((event) => this.toSportMatch(event));
        this.selectedMatch = this.matches[0] ?? null;
        this.loading = false;
      },
      error: (err) => {
        this.error = err?.message ?? 'Failed to load tennis events.';
        this.loading = false;
      },
    });
  }

  private toSportMatch(event: OddsEvent): SportMatch {
    const fallbackBookmaker = { title: 'N/A', markets: [{ outcomes: [] as Array<{ name: string; price: number }> }] };
    const bookmaker = event.bookmakers?.find((b) => b.markets?.some((m) => m.key === 'h2h')) ?? event.bookmakers?.[0] ?? fallbackBookmaker;
    const h2h = bookmaker.markets?.find((m) => m.key === 'h2h') ?? bookmaker.markets?.[0];

    return {
      id: event.id,
      kickoff: event.commence_time,
      homeTeam: event.home_team,
      awayTeam: event.away_team,
      bookmaker: bookmaker.title,
      odds: (h2h?.outcomes ?? []).slice(0, 3),
    };
  }

  selectMatch(match: SportMatch): void {
    this.selectedMatch = match;
  }

  addToSlip(event: MouseEvent, match: SportMatch, odd: { name: string; price: number }): void {
    event.stopPropagation();
    this.betSlipService.toggleSelection({
      eventId: match.id,
      sport: 'Tennis',
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      kickoff: match.kickoff,
      market: odd.name,
      odds: odd.price,
    });
  }

  isSelected(match: SportMatch, odd: { name: string; price: number }): boolean {
    return this.betSlipService.isSelected(match.id, odd.name);
  }
}
