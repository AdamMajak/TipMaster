import { DatePipe } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { AnalysisService, UserAnalysis } from '../shared/analysis.service';
import { OddsEvent, OddsService } from '../shared/odds.service';
import { ESPN_SOCCER_LEAGUES } from '../shared/espn-soccer-leagues';
import { EspnSoccerService, SoccerGame } from '../shared/espn-soccer.service';
import { SPORT_KEYS } from '../shared/rapidapi-odds';

interface HomeMatch {
  id: string;
  kickoff: string;
  homeTeam: string;
  awayTeam: string;
  competition: string;
  venue?: string;
  insight: string;
  confidence?: number;
}

interface AnalysisCard {
  id: string;
  type: 'auto' | 'user';
  title: string;
  matchLabel: string;
  kickoff?: string;
  summary: string;
  pick?: string;
  confidence?: number;
}

@Component({
  selector: 'app-home',
  imports: [RouterLink, DatePipe, FormsModule],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home implements OnInit {
  private readonly staleWindowMs = 2 * 60 * 60 * 1000;
  private readonly featuredWindowMs = 36 * 60 * 60 * 1000;
  private readonly featuredLeagues = ['eng.1', 'esp.1', 'ger.1', 'ita.1', 'uefa.champions'];

  loading = true;
  error = '';
  sportsCount = 0;
  footballMatches: HomeMatch[] = [];
  todayMatches: HomeMatch[] = [];
  autoAnalyses: AnalysisCard[] = [];
  userAnalyses: UserAnalysis[] = [];

  analysisMatchId = '';
  analysisMatchLabel = '';
  analysisTitle = '';
  analysisSummary = '';
  analysisPick = '';
  analysisConfidence = 3;

  readonly todayDate = this.getDateKey(new Date());
  analysisDate = this.todayDate;

  constructor(
    private readonly oddsService: OddsService,
    private readonly analysisService: AnalysisService,
    private readonly soccerService: EspnSoccerService
  ) {}

  ngOnInit(): void {
    const stored = this.analysisService.getAll();
    const pruned = stored.filter(
      (item) => item.analysisDate >= this.todayDate && !item.id.startsWith('seed-')
    );
    if (pruned.length !== stored.length) {
      this.analysisService.replaceAll(pruned);
    }
    this.userAnalyses = pruned;

    this.oddsService.getSports().subscribe({
      next: (sports) => {
        this.sportsCount = sports.filter((s) => s.active).length;
      },
      error: (err) => {
        this.error = err?.message ?? 'Failed to load sports data.';
      },
    });

    forkJoin(
      this.featuredLeagues.map((league) =>
        this.soccerService.getScoreboard(league).pipe(catchError(() => of([])))
      )
    ).subscribe({
      next: (responses) => {
        this.footballMatches = responses
          .flatMap((games, index) =>
            games
              .filter((game) => this.isScheduledEspnGame(game) && this.isFeaturedMatch(game.date))
              .map((game) => this.toEspnHomeMatch(game, this.featuredLeagues[index]))
          )
          .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime())
          .slice(0, 8);
        this.refreshTodayMatches();
        this.loading = false;
      },
      error: (err) => {
        this.error = err?.message ?? 'Failed to load ESPN football data.';
        this.loading = false;
      },
    });

    this.oddsService.getOddsBySport(SPORT_KEYS.hockey).subscribe({
      next: (hockey) => {
        const mapped = hockey.slice(0, 6).map((event) => this.toHomeMatch(event));
        this.todayMatches = this.mergeMatches(this.todayMatches, mapped);
        this.refreshTodayMatches();
      },
      error: (err) => {
        this.error = err?.message ?? 'Failed to load hockey data.';
      },
    });

    this.oddsService.getOddsBySport(SPORT_KEYS.tennis).subscribe({
      next: (tennis) => {
        const mapped = tennis.slice(0, 6).map((event) => this.toHomeMatch(event));
        this.todayMatches = this.mergeMatches(this.todayMatches, mapped);
        this.refreshTodayMatches();
      },
      error: (err) => {
        this.error = err?.message ?? 'Failed to load tennis data.';
      },
    });
  }

  addAnalysis(): void {
    const match = this.todayMatches.find((item) => item.id === this.analysisMatchId);
    const matchLabel = match
      ? `${match.homeTeam} vs ${match.awayTeam}`
      : this.analysisMatchLabel.trim();

    if (!matchLabel || !this.analysisTitle.trim() || !this.analysisSummary.trim() || !this.analysisDate) {
      return;
    }

    const created: UserAnalysis = {
      id: `user-${Date.now()}`,
      createdAt: new Date().toISOString(),
      analysisDate: this.analysisDate,
      matchLabel,
      kickoff: match?.kickoff,
      title: this.analysisTitle.trim(),
      summary: this.analysisSummary.trim(),
      pick: this.analysisPick.trim() || undefined,
      confidence: this.analysisConfidence,
    };

    this.userAnalyses = this.analysisService.add(created);
    this.resetForm();
  }

  removeAnalysis(id: string): void {
    this.userAnalyses = this.analysisService.remove(id);
  }

  private resetForm(): void {
    this.analysisMatchId = '';
    this.analysisMatchLabel = '';
    this.analysisTitle = '';
    this.analysisSummary = '';
    this.analysisPick = '';
    this.analysisConfidence = 3;
    this.analysisDate = this.todayDate;
  }

  private buildAutoAnalysis(match: HomeMatch): AnalysisCard {
    return {
      id: `auto-${match.id}`,
      type: 'auto',
      title: `Rychla analyza: ${match.homeTeam} vs ${match.awayTeam}`,
      matchLabel: `${match.homeTeam} vs ${match.awayTeam}`,
      kickoff: match.kickoff,
      summary: match.insight,
      pick: match.competition,
      confidence: match.confidence ?? 2,
    };
  }

  filteredUserAnalyses(): UserAnalysis[] {
    return this.userAnalyses.filter((item) => item.analysisDate === this.analysisDate);
  }

  private isToday(isoDate: string): boolean {
    return this.getDateKey(new Date(isoDate)) === this.todayDate;
  }

  private getDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private toHomeMatch(event: OddsEvent): HomeMatch {
    const fallbackBookmaker = { title: 'N/A', markets: [{ outcomes: [] as Array<{ name: string; price: number }> }] };
    const bookmaker =
      event.bookmakers?.find((b) => b.markets?.some((m) => m.key === 'h2h')) ?? event.bookmakers?.[0] ?? fallbackBookmaker;

    return {
      id: event.id,
      kickoff: event.commence_time,
      homeTeam: event.home_team,
      awayTeam: event.away_team,
      competition: bookmaker.title,
      insight: 'Zapasy z odds feedu ostavaju dostupne v ostatnych sekciach aplikacie.',
      confidence: 2,
    };
  }

  private toEspnHomeMatch(game: SoccerGame, leagueId: string): HomeMatch {
    const competition = ESPN_SOCCER_LEAGUES.find((league) => league.id === leagueId)?.label ?? leagueId;

    return {
      id: `${leagueId}-${game.id}`,
      kickoff: game.date,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      competition,
      venue: game.venue,
      insight: this.buildEspnMatchInsight(game, competition),
      confidence: this.getEspnConfidenceRating(game),
    };
  }

  private refreshTodayMatches(): void {
    const all = this.mergeMatches(this.footballMatches, this.todayMatches);
    this.todayMatches = all
      .filter((match) => this.isToday(match.kickoff) && this.isFreshMatch(match.kickoff))
      .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
    this.autoAnalyses = this.todayMatches.map((match) => this.buildAutoAnalysis(match));
  }

  private mergeMatches(current: HomeMatch[], incoming: HomeMatch[]): HomeMatch[] {
    const existing = new Set(current.map((item) => item.id));
    const merged = [...current];
    for (const match of incoming) {
      if (!existing.has(match.id)) {
        merged.push(match);
      }
    }
    return merged;
  }

  private isFreshMatch(isoDate: string): boolean {
    return new Date(isoDate).getTime() >= Date.now() - this.staleWindowMs;
  }

  private isFeaturedMatch(isoDate: string): boolean {
    const kickoff = new Date(isoDate).getTime();
    const now = Date.now();
    return kickoff >= now - this.staleWindowMs && kickoff <= now + this.featuredWindowMs;
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
      return `Kurzy su tesne pri sebe, zapas vyzera vyrovnane a remizovy scenar zostava silny.`;
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

  private isScheduledEspnGame(game: SoccerGame): boolean {
    if (this.isFutureDate(game.date)) {
      return true;
    }

    if (game.state?.toLowerCase() === 'pre') {
      return true;
    }

    const normalized = `${game.status} ${game.detail}`.toLowerCase();
    return normalized.includes('scheduled') || normalized.includes('pre');
  }

  private isFutureDate(value: string): boolean {
    return new Date(value).getTime() > Date.now();
  }

  private buildEspnMatchInsight(game: SoccerGame, competition: string): string {
    const kickoff = new Date(game.date).getTime();
    const hoursUntilKickoff = Math.max(0, Math.round((kickoff - Date.now()) / (60 * 60 * 1000)));

    if (hoursUntilKickoff <= 6) {
      return `${competition} sa hra uz coskoro, takze toto je dobry kandidat na rychly prematch check zostav a formy tesne pred vykopom.`;
    }

    if (game.venue) {
      return `${competition} ponuka zaujimavy upcoming duel. Sleduj potvrdene zostavy a domace prostredie na stadione ${game.venue}.`;
    }

    return `${competition} ponuka upcoming zapas vhodny na dalsiu analyzu po zverejneni zostav a timovych noviniek.`;
  }

  private getEspnConfidenceRating(game: SoccerGame): number {
    const kickoff = new Date(game.date).getTime();
    const hoursUntilKickoff = Math.round((kickoff - Date.now()) / (60 * 60 * 1000));

    if (hoursUntilKickoff <= 3) {
      return 4;
    }
    if (hoursUntilKickoff <= 12) {
      return 3;
    }
    return 2;
  }
}
