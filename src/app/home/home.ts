import { DatePipe } from '@angular/common';
import { Component, OnInit, effect, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { AnalysisRating, AnalysisService, UserAnalysis } from '../shared/analysis.service';
import { AuthService } from '../shared/auth.service';
import { OddsEvent, OddsService } from '../shared/odds.service';
import { EspnHockeyService, HockeyGame } from '../shared/espn-hockey.service';
import { ESPN_SOCCER_LEAGUES } from '../shared/espn-soccer-leagues';
import { EspnSoccerService, SoccerGame, SoccerOddsOutcome } from '../shared/espn-soccer.service';
import { EspnTennisService, TennisGame } from '../shared/espn-tennis.service';
import { SPORT_KEYS } from '../shared/rapidapi-odds';

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
  synthetic?: boolean;
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

interface FeaturedLeagueOption {
  id: string;
  priority: number;
}

@Component({
  selector: 'app-home',
  imports: [RouterLink, DatePipe, FormsModule],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home implements OnInit {
  private readonly authService = inject(AuthService);
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
  footballAnalysisMatches: HomeMatch[] = [];
  footballOddsMatches: HomeMatch[] = [];
  hockeyMatches: HomeMatch[] = [];
  tennisMatches: HomeMatch[] = [];
  todayMatches: HomeMatch[] = [];
  analysisMatches: HomeMatch[] = [];
  autoAnalyses: AnalysisCard[] = [];
  userAnalyses: UserAnalysis[] = [];
  reviewStars: Record<string, number> = {};
  reviewComments: Record<string, string> = {};

  selectedAnalysisMatchIds: string[] = [];
  analysisSportFilter = 'all';
  analysisMatchSearch = '';
  analysisMatchLabel = '';
  analysisTitle = '';
  analysisSummary = '';
  analysisPick = '';
  analysisConfidence = 3;

  readonly todayDate = this.getDateKey(new Date());
  readonly isAuthenticated = this.authService.isAuthenticated;
  analysisDate = this.todayDate;

  constructor(
    private readonly oddsService: OddsService,
    private readonly analysisService: AnalysisService,
    private readonly soccerService: EspnSoccerService,
    private readonly hockeyService: EspnHockeyService,
    private readonly tennisService: EspnTennisService
  ) {
    effect(() => {
      this.authService.currentUser();
      const stored = this.analysisService.getAll();
      const pruned = stored.filter(
        (item) => item.analysisDate >= this.todayDate && !item.id.startsWith('seed-')
      );
      if (pruned.length !== stored.length) {
        this.analysisService.replaceAll(pruned);
      }
      this.userAnalyses = pruned;
    });
  }

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
        this.refreshTodayMatches();
        this.loading = false;
      },
      error: (err) => {
        this.error = err?.message ?? 'Failed to load ESPN football data.';
        this.loading = false;
      },
    });

    forkJoin(
      ESPN_SOCCER_LEAGUES.map((league) =>
        this.soccerService.getScoreboard(league.id).pipe(catchError(() => of([])))
      )
    ).subscribe({
      next: (responses) => {
        this.footballAnalysisMatches = responses
          .flatMap((games, index) =>
            games
              .filter((game) => this.isScheduledEspnGame(game) && this.isFutureWindowMatch(game.date))
              .map((game) => this.toEspnHomeMatch(game, ESPN_SOCCER_LEAGUES[index].id))
          )
          .filter((match, index, all) => all.findIndex((item) => item.id === match.id) === index)
          .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
        this.refreshTodayMatches();
      },
      error: () => {
        this.refreshTodayMatches();
      },
    });

    this.hockeyService.getScoreboard('nhl').pipe(catchError(() => of([]))).subscribe({
      next: (games) => {
        this.hockeyMatches = games
          .filter((game) => this.isFutureWindowMatch(game.date))
          .map((game) => this.toEspnHockeyMatch(game, 'NHL'));
        this.refreshTodayMatches();
      },
    });

    forkJoin([
      this.tennisService.getScoreboard('atp').pipe(catchError(() => of([]))),
      this.tennisService.getScoreboard('wta').pipe(catchError(() => of([]))),
    ]).subscribe({
      next: ([atp, wta]) => {
        this.tennisMatches = [...atp, ...wta]
          .filter((game) => this.isScheduledTennisGame(game) && this.isFutureWindowMatch(game.date))
          .map((game) => this.toEspnTennisMatch(game));
        this.refreshTodayMatches();
      },
    });

    this.oddsService.getOddsBySport(SPORT_KEYS.hockey).subscribe({
      next: (hockey) => {
        const fallback = hockey.map((event) => this.toHomeMatch(event));
        this.hockeyMatches = this.mergeMatches(this.hockeyMatches, fallback);
        this.refreshTodayMatches();
      },
      error: (err) => {
        this.error = err?.message ?? 'Failed to load hockey data.';
      },
    });

    this.oddsService.getOddsBySport(SPORT_KEYS.tennis).subscribe({
      next: (tennis) => {
        const fallback = tennis.map((event) => this.toHomeMatch(event));
        this.tennisMatches = this.mergeMatches(this.tennisMatches, fallback);
        this.refreshTodayMatches();
      },
      error: (err) => {
        this.error = err?.message ?? 'Failed to load tennis data.';
      },
    });

    this.oddsService.getOddsBySport(SPORT_KEYS.soccer).subscribe({
      next: (football) => {
        this.footballOddsMatches = football.map((event) => this.toHomeMatch(event));
        this.refreshTodayMatches();
      },
      error: (err) => {
        this.error = err?.message ?? 'Failed to load football data.';
      },
    });
  }

  addAnalysis(): void {
    if (!this.authService.currentUser()) {
      return;
    }

    const selectedMatches = this.analysisMatches.filter((item) => this.selectedAnalysisMatchIds.includes(item.id));
    const selectedLabels = selectedMatches.map((item) => this.formatMatchLabel(item));
    const matchLabel = selectedLabels.length ? selectedLabels.join(' | ') : this.analysisMatchLabel.trim();
    const kickoff = selectedMatches.length === 1 ? selectedMatches[0].kickoff : undefined;

    if (!matchLabel || !this.analysisTitle.trim() || !this.analysisSummary.trim() || !this.analysisDate) {
      return;
    }

    const created: UserAnalysis = {
      id: `user-${Date.now()}`,
      authorId: this.authService.currentUser()!.id,
      authorName: this.authService.currentUser()!.name,
      createdAt: new Date().toISOString(),
      analysisDate: this.analysisDate,
      matchLabel,
      relatedMatches: selectedLabels.length ? selectedLabels : undefined,
      kickoff,
      title: this.analysisTitle.trim(),
      summary: this.analysisSummary.trim(),
      pick: this.analysisPick.trim() || undefined,
      confidence: this.analysisConfidence,
      ratings: [],
    };

    this.userAnalyses = this.analysisService.add(created);
    this.resetForm();
  }

  removeAnalysis(id: string): void {
    this.userAnalyses = this.analysisService.remove(id);
  }

  private resetForm(): void {
    this.selectedAnalysisMatchIds = [];
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
    const currentUserId = this.authService.currentUser()?.id;
    return this.userAnalyses.filter(
      (item) => item.analysisDate === this.analysisDate && item.authorId === currentUserId
    );
  }

  communityAnalyses(): UserAnalysis[] {
    const currentUserId = this.authService.currentUser()?.id;
    return this.userAnalyses.filter(
      (item) => item.analysisDate === this.analysisDate && item.authorId !== currentUserId
    );
  }

  averageStars(analysis: UserAnalysis): string {
    if (!analysis.ratings.length) {
      return '-';
    }

    const average =
      analysis.ratings.reduce((sum, rating) => sum + rating.stars, 0) / analysis.ratings.length;
    return average.toFixed(1);
  }

  starsLabel(count: number): string {
    const normalized = Math.max(0, Math.min(5, count));
    return `${normalized}/5`;
  }

  addRating(analysisId: string): void {
    if (!this.authService.currentUser()) {
      return;
    }

    const stars = this.reviewStars[analysisId] ?? 0;
    const comment = this.reviewComments[analysisId]?.trim();
    this.userAnalyses = this.analysisService.addRating(analysisId, stars, comment);
    this.reviewStars[analysisId] = stars;
    this.reviewComments[analysisId] = '';
  }

  setReviewStars(analysisId: string, value: number | string | null): void {
    const parsed = Number(value);
    this.reviewStars[analysisId] = Number.isNaN(parsed) ? 0 : Math.max(0, Math.min(5, Math.round(parsed)));
  }

  setReviewComment(analysisId: string, value: string | null): void {
    this.reviewComments[analysisId] = value ?? '';
  }

  reviewStarsValue(analysis: UserAnalysis): number {
    const draft = this.reviewStars[analysis.id];
    if (draft !== undefined) {
      return draft;
    }

    return this.currentUserRating(analysis)?.stars ?? 5;
  }

  reviewCommentValue(analysis: UserAnalysis): string {
    const draft = this.reviewComments[analysis.id];
    if (draft !== undefined) {
      return draft;
    }

    return this.currentUserRating(analysis)?.comment ?? '';
  }

  currentUserRating(analysis: UserAnalysis): AnalysisRating | undefined {
    const currentUserId = this.authService.currentUser()?.id;
    return analysis.ratings.find((item) => item.authorId === currentUserId);
  }

  toggleAnalysisMatchSelection(matchId: string, checked: boolean): void {
    if (checked) {
      if (!this.selectedAnalysisMatchIds.includes(matchId)) {
        this.selectedAnalysisMatchIds = [...this.selectedAnalysisMatchIds, matchId];
      }
      return;
    }

    this.selectedAnalysisMatchIds = this.selectedAnalysisMatchIds.filter((id) => id !== matchId);
  }

  isAnalysisMatchSelected(matchId: string): boolean {
    return this.selectedAnalysisMatchIds.includes(matchId);
  }

  formatMatchLabel(match: HomeMatch): string {
    return `${match.homeTeam} vs ${match.awayTeam}`;
  }

  formatAnalysisOption(match: HomeMatch): string {
    return `${match.sport} | ${match.competition} | ${this.formatMatchLabel(match)}`;
  }

  filteredAnalysisMatches(): HomeMatch[] {
    const search = this.normalizeSearch(this.analysisMatchSearch);

    return this.analysisMatches.filter((match) => {
      const sportMatches = this.analysisSportFilter === 'all' || match.sport.toLowerCase() === this.analysisSportFilter;
      if (!sportMatches) {
        return false;
      }

      if (!search) {
        return true;
      }

      const haystack = this.normalizeSearch(
        `${match.sport} ${match.competition} ${match.homeTeam} ${match.awayTeam} ${this.formatMatchLabel(match)}`
      );
      return haystack.includes(search);
    });
  }

  relatedMatchesLabel(analysis: UserAnalysis): string {
    return analysis.relatedMatches?.join(' | ') ?? '';
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
      sport: event.sport_title,
      kickoff: event.commence_time,
      homeTeam: event.home_team,
      awayTeam: event.away_team,
      competition: bookmaker.title,
      insight: 'Zapasy z odds feedu ostavaju dostupne v ostatnych sekciach aplikacie.',
      confidence: 2,
      synthetic: event.id.startsWith('fallback-'),
    };
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

  private toEspnHockeyMatch(game: HockeyGame, competition: string): HomeMatch {
    return {
      id: `hockey-${game.id}`,
      sport: 'Hockey',
      kickoff: game.date,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      competition,
      venue: game.venue,
      odds: game.odds,
      insight: this.buildMatchInsight(game.odds),
      confidence: this.getConfidenceRating(game.odds),
    };
  }

  private toEspnTennisMatch(game: TennisGame): HomeMatch {
    return {
      id: `tennis-${game.id}`,
      sport: 'Tennis',
      kickoff: game.date,
      homeTeam: game.playerA,
      awayTeam: game.playerB,
      competition: game.tournament ?? game.round ?? 'Tennis',
      venue: game.venue,
      odds: game.odds,
      insight: this.buildMatchInsight(game.odds),
      confidence: this.getConfidenceRating(game.odds),
    };
  }

  private compareFeaturedMatches(a: HomeMatch, b: HomeMatch): number {
    const priorityDiff = this.getFeaturedPriority(b) - this.getFeaturedPriority(a);
    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    return new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime();
  }

  private refreshTodayMatches(): void {
    const all = this.mergeMatches(
      this.mergeMatches(this.mergeMatches(this.footballMatches, this.footballAnalysisMatches), this.footballOddsMatches),
      this.mergeMatches(this.hockeyMatches, this.tennisMatches)
    );
    this.todayMatches = all
      .filter((match) => this.isToday(match.kickoff) && this.isFreshMatch(match.kickoff))
      .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
    this.analysisMatches = all
      .filter((match) => !match.synthetic && this.isFutureDate(match.kickoff))
      .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
    this.autoAnalyses = this.todayMatches
      .filter((match) => !match.synthetic)
      .map((match) => this.buildAutoAnalysis(match));
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

  private isFutureWindowMatch(isoDate: string): boolean {
    const kickoff = new Date(isoDate).getTime();
    const now = Date.now();
    return kickoff >= now - this.staleWindowMs && kickoff <= now + this.featuredWindowMs;
  }

  private getFeaturedPriority(match: HomeMatch): number {
    const league = ESPN_SOCCER_LEAGUES.find((item) => item.label === match.competition);
    return this.featuredLeaguePool.find((item) => item.id === league?.id)?.priority ?? 0;
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

  private isScheduledTennisGame(game: TennisGame): boolean {
    if (this.isFutureDate(game.date)) {
      return true;
    }

    if (game.state?.toLowerCase() === 'pre') {
      return true;
    }

    const normalized = `${game.status} ${game.detail}`.toLowerCase();
    return normalized.includes('scheduled') || normalized.includes('pre');
  }

  private normalizeSearch(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

}
