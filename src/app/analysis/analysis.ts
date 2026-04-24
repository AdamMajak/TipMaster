import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, effect, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, forkJoin, map, of, type Observable } from 'rxjs';
import { AnalysisRating, AnalysisService, UserAnalysis } from '../shared/analysis.service';
import { AuthService } from '../shared/auth.service';
import { EspnHockeyService, HockeyGame } from '../shared/espn-hockey.service';
import { ESPN_SOCCER_LEAGUES } from '../shared/espn-soccer-leagues';
import { EspnSoccerService, SoccerGame } from '../shared/espn-soccer.service';
import { EspnTennisService, TennisGame } from '../shared/espn-tennis.service';
import { OddsEvent, OddsService } from '../shared/odds.service';
import { SPORT_KEYS } from '../shared/rapidapi-odds';

interface AnalysisMatch {
  id: string;
  sportKey: string;
  sportTitle: string;
  kickoff: string;
  homeTeam: string;
  awayTeam: string;
  competition: string;
  synthetic?: boolean;
}

type SportFilter = 'all' | 'soccer' | 'hockey' | 'tennis';
type PickOption = { value: string; label: string };

@Component({
  selector: 'app-analyses',
  imports: [FormsModule, DatePipe],
  templateUrl: './analysis.html',
  styleUrl: './analysis.css',
})
export class Analyses implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly analysisService = inject(AnalysisService);
  private readonly soccerService = inject(EspnSoccerService);
  private readonly hockeyService = inject(EspnHockeyService);
  private readonly tennisService = inject(EspnTennisService);

  loadingMatches = true;
  errorMatches = '';
  showingDemoMatches = false;

  matches: AnalysisMatch[] = [];
  selectedMatchIds: string[] = [];
  sportFilter: SportFilter = 'all';
  matchSearch = '';

  matchLabel = '';
  title = '';
  summary = '';
  pick = '';
  confidence = 3;
  formMessage = '';

  readonly todayDate = this.getDateKey(new Date());
  analysisDate = this.todayDate;

  analyses: UserAnalysis[] = [];
  reviewStars: Record<string, number> = {};
  reviewComments: Record<string, string> = {};

  readonly isAuthenticated = this.authService.isAuthenticated;
  readonly isAdmin = this.authService.isAdmin;
  readonly currentUser = this.authService.currentUser;
  readonly selectedCount = computed(() => this.selectedMatchIds.length);
  readonly pickOptions = computed((): PickOption[] => {
    if (this.selectedMatches.length !== 1) {
      return [];
    }

    const match = this.selectedMatches[0];
    switch (match.sportKey) {
      case 'soccer':
        return [
          { value: '1', label: '1 (Home)' },
          { value: 'X', label: 'X (Draw)' },
          { value: '2', label: '2 (Away)' },
        ];
      case 'hockey':
      case 'tennis':
        return [
          { value: '1', label: '1' },
          { value: '2', label: '2' },
        ];
      default:
        return [];
    }
  });

  constructor(private readonly oddsService: OddsService) {
    effect(() => {
      this.authService.currentUser();
      const stored = this.analysisService.getAll();
      const pruned = stored.filter((item) => item.analysisDate >= this.todayDate && !item.id.startsWith('seed-'));
      if (pruned.length !== stored.length) {
        this.analysisService.replaceAll(pruned);
      }
      this.analyses = pruned;
    });
  }

  ngOnInit(): void {
    this.reloadMatches();
    void this.loadAnalysesForDate();
  }

  onAnalysisDateChange(): void {
    void this.loadAnalysesForDate();
  }

  private async loadAnalysesForDate(): Promise<void> {
    const dateKey = (this.analysisDate ?? '').trim() || this.todayDate;
    this.analysisDate = dateKey;
    this.analyses = await this.analysisService.getByDate(dateKey);
  }

  reloadMatches(): void {
    this.loadingMatches = true;
    this.errorMatches = '';
    this.showingDemoMatches = false;

    forkJoin({
      soccer: this.oddsService.getOddsBySport(SPORT_KEYS.soccer).pipe(catchError(() => of([]))),
      hockey: this.oddsService.getOddsBySport(SPORT_KEYS.hockey).pipe(catchError(() => of([]))),
      tennis: this.oddsService.getOddsBySport(SPORT_KEYS.tennis).pipe(catchError(() => of([]))),
    }).subscribe({
      next: ({ soccer, hockey, tennis }) => {
        const all = [...soccer, ...hockey, ...tennis].map((event) => this.toMatch(event));
        const unique = this.deduplicateMatches(all);
        const liveOdds = unique.filter((match) => !match.synthetic);
        const demoOdds = unique.filter((match) => Boolean(match.synthetic));

        if (liveOdds.length) {
          this.matches = this.sortMatches(liveOdds.filter((match) => this.isInSelectableWindow(match.kickoff)));
          this.loadingMatches = false;
          return;
        }

        // If odds API returns only fallback/demo matches, use ESPN scoreboards for upcoming fixtures.
        this.loadEspnMatches().subscribe({
          next: (espn) => {
            const espnUnique = this.deduplicateMatches(espn);
            const source = espnUnique.length ? espnUnique : demoOdds;

            this.showingDemoMatches = !espnUnique.length && demoOdds.length > 0;
            this.matches = this.sortMatches(source.filter((match) => this.isInSelectableWindow(match.kickoff)));

            if (!this.matches.length) {
              this.errorMatches = 'No matches available right now. Try Refresh.';
            } else if (this.showingDemoMatches) {
              this.errorMatches = 'Showing demo matches because live feed is unavailable right now.';
            } else {
              this.errorMatches = '';
            }

            this.loadingMatches = false;
          },
          error: (err) => {
            this.matches = this.sortMatches(demoOdds.filter((match) => this.isInSelectableWindow(match.kickoff)));
            this.showingDemoMatches = Boolean(this.matches.length);
            this.errorMatches = this.showingDemoMatches
              ? 'Showing demo matches because live feed is unavailable right now.'
              : (err?.message ?? 'Failed to load match list.');
            this.loadingMatches = false;
          },
        });
      },
      error: (err) => {
        this.errorMatches = err?.message ?? 'Failed to load match list.';
        this.loadingMatches = false;
      },
    });
  }

  get filteredMatches(): AnalysisMatch[] {
    const search = this.normalizeSearch(this.matchSearch);

    return this.matches.filter((match) => {
      if (this.sportFilter !== 'all' && match.sportKey !== this.sportFilter) {
        return false;
      }

      if (!search) {
        return true;
      }

      const haystack = this.normalizeSearch(
        `${match.sportTitle} ${match.competition} ${match.homeTeam} ${match.awayTeam}`
      );
      return haystack.includes(search);
    });
  }

  get selectedMatches(): AnalysisMatch[] {
    const selected = new Set(this.selectedMatchIds);
    return this.matches.filter((match) => selected.has(match.id));
  }

  toggleMatch(matchId: string): void {
    if (this.selectedMatchIds.includes(matchId)) {
      this.selectedMatchIds = this.selectedMatchIds.filter((id) => id !== matchId);
      this.ensurePickValid();
      return;
    }

    this.selectedMatchIds = [...this.selectedMatchIds, matchId];
    this.ensurePickValid();
  }

  removeSelected(matchId: string): void {
    this.selectedMatchIds = this.selectedMatchIds.filter((id) => id !== matchId);
    this.ensurePickValid();
  }

  clearSelected(): void {
    this.selectedMatchIds = [];
    this.ensurePickValid();
  }

  formatMatch(match: AnalysisMatch): string {
    return `${match.homeTeam} vs ${match.awayTeam}`;
  }

  addAnalysis(): void {
    this.formMessage = '';

    const user = this.authService.currentUser();
    if (!user) {
      this.formMessage = 'Login first to add an analysis.';
      return;
    }
    if (user.disabled) {
      this.formMessage = 'This account has been blocked by admin.';
      return;
    }

    const selectedLabels = this.selectedMatches.map((match) => this.formatMatch(match));
    const computedLabel = selectedLabels.length ? selectedLabels.join(' | ') : this.matchLabel.trim();
    const kickoff = this.selectedMatches.length === 1 ? this.selectedMatches[0].kickoff : undefined;

    if (!this.analysisDate) {
      this.formMessage = 'Pick an analysis date.';
      return;
    }

    if (!computedLabel) {
      this.formMessage = 'Select matches or fill in a custom label.';
      return;
    }

    if (!this.title.trim() || !this.summary.trim()) {
      this.formMessage = 'Fill in title and analysis text.';
      return;
    }

    const created: UserAnalysis = {
      id: `analysis-${Date.now()}-${this.slugify(user.name ?? user.email ?? 'user')}`,
      authorId: user.id,
      authorName: user.name,
      createdAt: new Date().toISOString(),
      analysisDate: this.analysisDate,
      matchLabel: computedLabel,
      relatedMatches: selectedLabels.length ? selectedLabels : undefined,
      kickoff,
      title: this.title.trim(),
      summary: this.summary.trim(),
      pick: this.selectedMatches.length === 1 ? this.pick.trim() || undefined : undefined,
      confidence: this.confidence,
      ratings: [],
    };

    void (async () => {
      this.analyses = await this.analysisService.add(created);
      await this.loadAnalysesForDate();
      this.resetForm();
    })();
  }

  private slugify(value: string): string {
    const normalized = (value ?? 'user')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/(^-|-$)/g, '')
      .trim();

    return normalized || 'user';
  }

  removeAnalysis(id: string): void {
    void (async () => {
      this.analyses = await this.analysisService.remove(id);
      await this.loadAnalysesForDate();
    })();
  }

  canDeleteAnalysis(item: UserAnalysis): boolean {
    const user = this.authService.currentUser();
    if (!user) {
      return false;
    }

    return user.role === 'admin' || item.authorId === user.id;
  }

  private resetForm(): void {
    this.selectedMatchIds = [];
    this.matchLabel = '';
    this.title = '';
    this.summary = '';
    this.pick = '';
    this.confidence = 3;
    this.analysisDate = this.todayDate;
  }

  private ensurePickValid(): void {
    if (this.selectedMatches.length !== 1) {
      this.pick = '';
      return;
    }

    const options = this.pickOptions();
    if (!options.length) {
      this.pick = '';
      return;
    }

    if (this.pick && !options.some((option) => option.value === this.pick)) {
      this.pick = '';
    }
  }

  myAnalyses(): UserAnalysis[] {
    const currentUserId = this.authService.currentUser()?.id;
    return this.analyses.filter((item) => item.analysisDate === this.analysisDate && item.authorId === currentUserId);
  }

  communityAnalyses(): UserAnalysis[] {
    const currentUserId = this.authService.currentUser()?.id;
    return this.analyses.filter((item) => item.analysisDate === this.analysisDate && item.authorId !== currentUserId);
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

  relatedMatchesLabel(analysis: UserAnalysis): string {
    return analysis.relatedMatches?.join(' | ') ?? '';
  }

  addRating(analysisId: string): void {
    const user = this.authService.currentUser();
    if (!user || user.disabled) {
      return;
    }

    const stars = this.reviewStars[analysisId] ?? 0;
    const comment = this.reviewComments[analysisId]?.trim();
    void (async () => {
      this.analyses = await this.analysisService.addRating(analysisId, stars, comment);
      await this.loadAnalysesForDate();
      this.reviewStars[analysisId] = stars;
      this.reviewComments[analysisId] = '';
    })();
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

  canRateAnalysis(analysis: UserAnalysis): boolean {
    const user = this.authService.currentUser();
    if (!user || user.disabled) {
      return false;
    }

    return analysis.authorId !== user.id;
  }

  private toMatch(event: OddsEvent): AnalysisMatch {
    const fallbackBookmaker = { title: 'N/A', markets: [{ outcomes: [] as Array<{ name: string; price: number }> }] };
    const bookmaker =
      event.bookmakers?.find((b) => b.markets?.some((m) => m.key === 'h2h')) ?? event.bookmakers?.[0] ?? fallbackBookmaker;

    return {
      id: `${event.sport_key}-${event.id}`,
      sportKey: event.sport_key,
      sportTitle: event.sport_title,
      kickoff: event.commence_time,
      homeTeam: event.home_team,
      awayTeam: event.away_team,
      competition: bookmaker.title,
      synthetic: event.id.startsWith('fallback-'),
    };
  }

  private loadEspnMatches(): Observable<AnalysisMatch[]> {
    const soccerRequests = ESPN_SOCCER_LEAGUES.map((league) =>
      this.soccerService.getScoreboard(league.id).pipe(
        catchError(() => of([] as SoccerGame[])),
        map((games) =>
          games
            .filter((game) => this.isScheduledEspnGame(game))
            .map((game) => this.toEspnSoccerMatch(league.id, league.label, game))
        )
      )
    );

    return forkJoin({
      soccer: forkJoin(soccerRequests).pipe(map((items) => items.flat())),
      hockey: this.hockeyService.getScoreboard('nhl').pipe(
        catchError(() => of([] as HockeyGame[])),
        map((games) => games.filter((game) => this.isScheduledHockeyGame(game)).map((game) => this.toEspnHockeyMatch(game)))
      ),
      tennis: forkJoin([
        this.tennisService.getScoreboard('atp').pipe(catchError(() => of([] as TennisGame[]))),
        this.tennisService.getScoreboard('wta').pipe(catchError(() => of([] as TennisGame[]))),
      ]).pipe(
        map(([atp, wta]) =>
          [...atp, ...wta].filter((game) => this.isScheduledTennisGame(game)).map((game) => this.toEspnTennisMatch(game))
        )
      ),
    }).pipe(map(({ soccer, hockey, tennis }) => [...soccer, ...hockey, ...tennis]));
  }

  private toEspnSoccerMatch(leagueId: string, leagueLabel: string, game: SoccerGame): AnalysisMatch {
    return {
      id: `soccer-espn-${leagueId}-${game.id}`,
      sportKey: 'soccer',
      sportTitle: 'Football',
      kickoff: game.date,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      competition: leagueLabel,
    };
  }

  private toEspnHockeyMatch(game: HockeyGame): AnalysisMatch {
    return {
      id: `hockey-espn-${game.id}`,
      sportKey: 'hockey',
      sportTitle: 'Hockey',
      kickoff: game.date,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      competition: 'NHL',
    };
  }

  private toEspnTennisMatch(game: TennisGame): AnalysisMatch {
    return {
      id: `tennis-espn-${game.id}`,
      sportKey: 'tennis',
      sportTitle: 'Tennis',
      kickoff: game.date,
      homeTeam: game.playerA,
      awayTeam: game.playerB,
      competition: game.tournament ?? game.round ?? 'Tennis',
    };
  }

  private isScheduledEspnGame(game: SoccerGame): boolean {
    return Boolean(game?.id && game?.homeTeam && game?.awayTeam && game?.date);
  }

  private isScheduledHockeyGame(game: HockeyGame): boolean {
    return Boolean(game?.id && game?.homeTeam && game?.awayTeam && game?.date);
  }

  private isScheduledTennisGame(game: TennisGame): boolean {
    return Boolean(game?.id && game?.playerA && game?.playerB && game?.date);
  }

  private deduplicateMatches(matches: AnalysisMatch[]): AnalysisMatch[] {
    const unique = new Map<string, AnalysisMatch>();
    for (const match of matches) {
      unique.set(match.id, match);
    }
    return Array.from(unique.values());
  }

  private sortMatches(matches: AnalysisMatch[]): AnalysisMatch[] {
    return [...matches].sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
  }

  private isInSelectableWindow(isoDate: string): boolean {
    const kickoff = new Date(isoDate).getTime();
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    return kickoff >= now - dayMs && kickoff <= now + 7 * dayMs;
  }

  private getDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private normalizeSearch(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }
}
