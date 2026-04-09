import { DatePipe } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { OddsService } from '../shared/odds.service';
import { ESPN_SOCCER_LEAGUES } from '../shared/espn-soccer-leagues';
import { EspnSoccerService, SoccerGame, SoccerOddsOutcome } from '../shared/espn-soccer.service';

interface HomeMatch {
  id: string;
  sport: string;
  kickoff: string;
  homeTeam: string;
  awayTeam: string;
  competition: string;
  venue?: string;
  odds?: SoccerOddsOutcome[];
  insight: string;
  confidence?: number;
}

interface FeaturedLeagueOption {
  id: string;
  priority: number;
}

@Component({
  selector: 'app-home',
  imports: [RouterLink, DatePipe],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home implements OnInit {
  private readonly staleWindowMs = 2 * 60 * 60 * 1000;
  private readonly featuredWindowMs = 72 * 60 * 60 * 1000;
  private readonly featuredLeaguePool: FeaturedLeagueOption[] = [
    { id: 'uefa.champions', priority: 100 },
    { id: 'fifa.world', priority: 99 },
    { id: 'uefa.euro', priority: 98 },
    { id: 'fifa.worldq.uefa', priority: 96 },
    { id: 'fifa.worldq.conmebol', priority: 95 },
    { id: 'fifa.worldq.concacaf', priority: 94 },
    { id: 'fifa.worldq', priority: 93 },
    { id: 'uefa.nations', priority: 92 },
    { id: 'uefa.euroq', priority: 91 },
    { id: 'uefa.europa', priority: 89 },
    { id: 'uefa.europa.conf', priority: 87 },
    { id: 'concacaf.champions', priority: 85 },
    { id: 'concacaf.gold', priority: 84 },
    { id: 'eng.1', priority: 82 },
    { id: 'esp.1', priority: 81 },
    { id: 'ger.1', priority: 80 },
    { id: 'ita.1', priority: 80 },
    { id: 'fra.1', priority: 78 },
    { id: 'usa.1', priority: 74 },
    { id: 'por.1', priority: 73 },
    { id: 'ned.1', priority: 72 },
    { id: 'bel.1', priority: 69 },
    { id: 'tur.1', priority: 68 },
    { id: 'sco.1', priority: 66 },
  ];

  loading = true;
  error = '';
  sportsCount = 0;
  footballMatches: HomeMatch[] = [];

  constructor(
    private readonly oddsService: OddsService,
    private readonly soccerService: EspnSoccerService
  ) {}

  ngOnInit(): void {
    this.oddsService.getSports().subscribe({
      next: (sports) => {
        this.sportsCount = sports.filter((s) => s.active).length;
      },
      error: (err) => {
        this.error = err?.message ?? 'Failed to load sports data.';
      },
    });

    forkJoin(
      this.featuredLeaguePool.map((league) =>
        this.soccerService.getScoreboard(league.id).pipe(catchError(() => of([])))
      )
    ).subscribe({
      next: (responses) => {
        this.footballMatches = responses
          .flatMap((games, index) =>
            games
              .filter((game) => this.isScheduledEspnGame(game) && this.isFeaturedMatch(game.date))
              .map((game) => this.toEspnHomeMatch(game, this.featuredLeaguePool[index].id))
          )
          .sort((a, b) => this.compareFeaturedMatches(a, b))
          .filter((match, index, all) => all.findIndex((item) => item.id === match.id) === index)
          .slice(0, 8);
        this.loading = false;
      },
      error: (err) => {
        this.error = err?.message ?? 'Failed to load ESPN football data.';
        this.loading = false;
      },
    });
  }

  private compareFeaturedMatches(a: HomeMatch, b: HomeMatch): number {
    const priorityDiff = this.getFeaturedPriority(b) - this.getFeaturedPriority(a);
    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    return new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime();
  }

  private getFeaturedPriority(match: HomeMatch): number {
    const league = ESPN_SOCCER_LEAGUES.find((item) => item.label === match.competition);
    return this.featuredLeaguePool.find((item) => item.id === league?.id)?.priority ?? 0;
  }

  private isFeaturedMatch(isoDate: string): boolean {
    const kickoff = new Date(isoDate).getTime();
    const now = Date.now();
    return kickoff >= now - this.staleWindowMs && kickoff <= now + this.featuredWindowMs;
  }

  private isScheduledEspnGame(game: SoccerGame): boolean {
    if (!game) {
      return false;
    }
    return Boolean(game.id && game.homeTeam && game.awayTeam && game.date);
  }

  private toEspnHomeMatch(game: SoccerGame, leagueId: string): HomeMatch {
    const competition = ESPN_SOCCER_LEAGUES.find((league) => league.id === leagueId)?.label ?? leagueId;
    const odds = game.odds ?? [];

    return {
      id: `${leagueId}-${game.id}`,
      sport: 'Football',
      kickoff: game.date,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      competition,
      venue: game.venue,
      odds,
      insight: this.buildMatchInsight(odds),
      confidence: this.getConfidenceRating(odds),
    };
  }

  private buildMatchInsight(odds: Array<{ name: string; price: number }>): string {
    const sorted = [...odds].sort((a, b) => a.price - b.price);
    const favorite = sorted[0];
    const second = sorted[1];
    const outsider = sorted[sorted.length - 1];

    if (!favorite) {
      return 'Kurzovy trh este nema jasneho favorita, oplati sa pockat na dalsi pohyb cien.';
    }

    if (!second) {
      return `Najsilnejsie vyzera tip ${favorite.name} s kurzom ${favorite.price}.`;
    }

    const gap = Number((second.price - favorite.price).toFixed(2));
    if (gap >= 0.6) {
      return `Trh jasne veri moznosti ${favorite.name} (${favorite.price}). Outsider ${outsider?.name ?? '-'} je uz vysoko na ${outsider?.price ?? '-'}.`;
    }

    if (favorite.name === 'X' || gap <= 0.25) {
      return 'Kurzy su tesne pri sebe, zapas vyzera vyrovnane a remizovy scenar zostava silny.';
    }

    return `Mierny kurzovy naskok ma ${favorite.name} (${favorite.price}), ale trh nechava priestor aj pre alternativu ${second.name} (${second.price}).`;
  }

  private getConfidenceRating(odds: Array<{ name: string; price: number }>): number {
    const sorted = [...odds].sort((a, b) => a.price - b.price);
    const favorite = sorted[0];
    const second = sorted[1];

    if (!favorite || !second) {
      return 2;
    }

    const gap = second.price - favorite.price;
    if (gap >= 0.9) {
      return 5;
    }
    if (gap >= 0.6) {
      return 4;
    }
    if (gap >= 0.3) {
      return 3;
    }
    return 2;
  }
}
