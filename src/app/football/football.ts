import { DatePipe } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { OddsEvent, OddsService } from '../shared/odds.service';
import { SPORT_KEYS } from '../shared/rapidapi-odds';

interface SportMatch {
  id: string;
  kickoff: string;
  homeTeam: string;
  awayTeam: string;
  bookmaker: string;
  odds: Array<{ name: string; price: number }>;
}

@Component({
  selector: 'app-football',
  imports: [DatePipe],
  templateUrl: './football.html',
  styleUrl: './football.css',
})
export class Football implements OnInit {
  readonly pageTitle = 'Football Odds';
  readonly subtitle = 'Premier League live prices from RapidAPI.';

  loading = true;
  error = '';
  matches: SportMatch[] = [];
  selectedMatch: SportMatch | null = null;

  constructor(private readonly oddsService: OddsService) {}

  ngOnInit(): void {
    this.oddsService.getOddsBySport(SPORT_KEYS.football).subscribe({
      next: (events) => {
        this.matches = events.slice(0, 16).map((event) => this.toSportMatch(event));
        this.selectedMatch = this.matches[0] ?? null;
        this.loading = false;
      },
      error: (err) => {
        this.error = err?.message ?? 'Failed to load football odds.';
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
}
