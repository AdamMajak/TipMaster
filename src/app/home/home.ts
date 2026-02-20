import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { OddsEvent, OddsService } from '../shared/odds.service';
import { SPORT_KEYS } from '../shared/rapidapi-odds';
import { DatePipe } from '@angular/common';

interface HomeMatch {
  id: string;
  kickoff: string;
  homeTeam: string;
  awayTeam: string;
  bookmaker: string;
  odds: Array<{ name: string; price: number }>;
}

@Component({
  selector: 'app-home',
  imports: [RouterLink, DatePipe],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home implements OnInit {
  loading = true;
  error = '';
  sportsCount = 0;
  footballMatches: HomeMatch[] = [];

  constructor(private readonly oddsService: OddsService) {}

  ngOnInit(): void {
    forkJoin({
      sports: this.oddsService.getSports(),
      football: this.oddsService.getOddsBySport(SPORT_KEYS.football),
    }).subscribe({
      next: ({ sports, football }) => {
        this.sportsCount = sports.filter((s) => s.active).length;
        this.footballMatches = football.slice(0, 8).map((event) => this.toHomeMatch(event));
        this.loading = false;
      },
      error: (err) => {
        this.error = err?.message ?? 'Failed to load odds data.';
        this.loading = false;
      },
    });
  }

  private toHomeMatch(event: OddsEvent): HomeMatch {
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
}
