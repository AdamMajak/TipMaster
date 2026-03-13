import { DatePipe } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AnalysisService, UserAnalysis } from '../shared/analysis.service';
import { OddsEvent, OddsService } from '../shared/odds.service';
import { SPORT_KEYS } from '../shared/rapidapi-odds';

interface HomeMatch {
  id: string;
  kickoff: string;
  homeTeam: string;
  awayTeam: string;
  bookmaker: string;
  odds: Array<{ name: string; price: number }>;
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
    private readonly analysisService: AnalysisService
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

    this.oddsService.getOddsBySport(SPORT_KEYS.football).subscribe({
      next: (football) => {
        this.footballMatches = football.slice(0, 8).map((event) => this.toHomeMatch(event));
        this.refreshTodayMatches();
        this.loading = false;
      },
      error: (err) => {
        this.error = err?.message ?? 'Failed to load odds data.';
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
    const sorted = [...match.odds].sort((a, b) => a.price - b.price);
    const favorite = sorted[0];
    const outsider = sorted[sorted.length - 1];
    const pick = favorite?.name;

    const summary = favorite
      ? `Favorit ma nizky kurz ${favorite.price}. Pre hodnotu sleduj outsidera ${outsider?.name ?? ''} nad ${outsider?.price ?? ''}.`
      : 'Kurzy su zatial nejasne, sleduj pohyb trhu pocas dna.';

    return {
      id: `auto-${match.id}`,
      type: 'auto',
      title: `Rychla analyza: ${match.homeTeam} vs ${match.awayTeam}`,
      matchLabel: `${match.homeTeam} vs ${match.awayTeam}`,
      kickoff: match.kickoff,
      summary,
      pick,
      confidence: favorite ? 3 : 2,
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

  private refreshTodayMatches(): void {
    const all = this.mergeMatches(this.footballMatches, this.todayMatches);
    this.todayMatches = all.filter((match) => this.isToday(match.kickoff));
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
}
