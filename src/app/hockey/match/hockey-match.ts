import { DatePipe, JsonPipe } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { combineLatest, finalize, Subject, takeUntil } from 'rxjs';
import {
  EspnHockeyService,
  HockeyMatchExtras,
  HockeyMatchSummary,
  HockeyPlayerStatsTeam,
  HockeyRosterPlayer,
  HockeyTeamDetail,
} from '../../shared/espn-hockey.service';

@Component({
  selector: 'app-hockey-match',
  imports: [DatePipe, JsonPipe, RouterLink],
  templateUrl: './hockey-match.html',
  styleUrl: './hockey-match.css',
})
export class HockeyMatch implements OnInit, OnDestroy {
  readonly slovakTimezone = 'Europe/Bratislava';

  loading = false;
  error = '';
  league = 'nhl';
  eventId = '';
  detailsRequested = false;
  summary: HockeyMatchSummary | null = null;

  extrasLoading = false;
  extrasError = '';
  extras: HockeyMatchExtras | null = null;

  showRaw = false;
  private destroyed = false;

  get requestUrl(): string {
    const safeLeague = encodeURIComponent(this.league);
    const safeEvent = encodeURIComponent(this.eventId);
    const host = typeof location === 'undefined' ? '' : location.hostname;
    const port = typeof location === 'undefined' ? '' : location.port;

    if (host === 'localhost' || host === '127.0.0.1' || port === '4200') {
      return `/espn/apis/site/v2/sports/hockey/${safeLeague}/summary?event=${safeEvent}`;
    }

    return `https://site.api.espn.com/apis/site/v2/sports/hockey/${safeLeague}/summary?event=${safeEvent}`;
  }

  private readonly destroyed$ = new Subject<void>();

  constructor(
    private readonly route: ActivatedRoute,
    private readonly hockeyService: EspnHockeyService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  private render(): void {
    if (this.destroyed) {
      return;
    }

    // Zoneless mode: force render after async updates.
    this.cdr.detectChanges();
  }

  formatStatName(value: string): string {
    const key = (value ?? '').trim();

    const pretty: Record<string, string> = {
      avgGoals: 'Goals / Game',
      avgGoalsAgainst: 'Goals Against / Game',
      avgShots: 'Shots / Game',
      avgShotsAgainst: 'Shots Against / Game',
      powerPlayPct: 'Power Play %',
      penaltyKillPct: 'Penalty Kill %',
      powerPlayGoals: 'PP Goals',
      powerPlayGoalsAgainst: 'PP Goals Against',
      shortHandedGoals: 'SH Goals',
      shortHandedGoalsAgainst: 'SH Goals Against',
      penaltyMinutes: 'Penalty Minutes',
    };

    if (pretty[key]) {
      return pretty[key];
    }

    return key
      .replace(/_/g, ' ')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim();
  }

  statDescription(value: string): string {
    const key = (value ?? '').trim();

    const desc: Record<string, string> = {
      avgGoals: 'Average goals scored per game (season).',
      avgGoalsAgainst: 'Average goals conceded per game (season). Lower is better.',
      avgShots: 'Average shots on goal per game (season).',
      avgShotsAgainst: 'Average shots allowed per game (season). Lower is better.',
      powerPlayPct: 'Power play conversion percentage (season).',
      penaltyKillPct: 'Penalty kill success percentage (season).',
      powerPlayGoals: 'Total power play goals (season).',
      powerPlayGoalsAgainst: 'Power play goals conceded (season). Lower is better.',
      shortHandedGoals: 'Short-handed goals scored (season).',
      shortHandedGoalsAgainst: 'Short-handed goals conceded (season). Lower is better.',
      penaltyMinutes: 'Total penalty minutes (season). Lower is generally better discipline.',
    };

    return desc[key] ?? '';
  }

  formatStatValue(value: string | undefined, statName: string): string {
    const raw = (value ?? '').toString().trim();
    if (!raw) return '-';

    const key = (statName ?? '').trim();
    const isPercent = key.toLowerCase().endsWith('pct') || key.toLowerCase().includes('percent');

    if (!isPercent) {
      return raw;
    }

    return raw.endsWith('%') ? raw : `${raw}%`;
  }

  ngOnInit(): void {
    combineLatest([this.route.paramMap, this.route.queryParamMap])
      .pipe(takeUntil(this.destroyed$))
      .subscribe({
        next: ([params, query]) => {
          this.eventId = (params.get('eventId') ?? '').trim();
          this.league = (query.get('league') ?? 'nhl').trim() || 'nhl';
          this.loading = false;
          this.error = '';
          this.detailsRequested = false;
          this.summary = null;
          this.extrasLoading = false;
          this.extrasError = '';
          this.extras = null;
          this.showRaw = false;
          this.render();

          if (this.eventId) {
            this.loadDetails();
          }
        },
      });
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  loadDetails(): void {
    const eventId = this.eventId.trim();
    this.detailsRequested = true;
    if (!eventId) {
      this.error = 'Missing event id.';
      return;
    }

    this.loading = true;
    this.error = '';
    this.summary = null;
    this.extrasLoading = false;
    this.extrasError = '';
    this.extras = null;
    this.showRaw = false;
    this.render();

    this.hockeyService
      .getMatchSummary(this.league, eventId)
      .pipe(
        takeUntil(this.destroyed$),
        finalize(() => {
          this.loading = false;
          this.render();
        })
      )
      .subscribe({
        next: (summary) => {
          if (!summary) {
            this.error =
              'No game details found for this event. It may be outside the scoreboard date window or the event id is invalid.';
            this.render();
            return;
          }

          this.summary = summary;
          this.render();

          const home = (summary.homeTeam ?? '').trim();
          const away = (summary.awayTeam ?? '').trim();
          if (home && away) {
            this.loadExtras(home, away);
          }
        },
        error: (err) => {
          this.error = err?.message ?? 'Failed to load game details.';
          this.render();
        },
      });
  }

  get homeTeamDetail(): HockeyTeamDetail | null {
    return this.extras?.homeTeamDetail ?? null;
  }

  get awayTeamDetail(): HockeyTeamDetail | null {
    return this.extras?.awayTeamDetail ?? null;
  }

  get homeRoster(): HockeyRosterPlayer[] {
    return this.extras?.homeRoster ?? [];
  }

  get awayRoster(): HockeyRosterPlayer[] {
    return this.extras?.awayRoster ?? [];
  }

  get h2hGames(): Array<{ label: string; score: string; date: string }> {
    const games = this.extras?.h2h ?? [];
    return games.map((g) => {
      const score =
        g.homeScore !== undefined || g.awayScore !== undefined ? `${g.awayScore ?? '-'}:${g.homeScore ?? '-'}` : '-';
      return {
        label: `${g.awayTeam} vs ${g.homeTeam}`,
        score,
        date: g.date,
      };
    });
  }

  private loadExtras(homeTeamName: string, awayTeamName: string): void {
    this.extrasLoading = true;
    this.extrasError = '';
    this.extras = null;

    this.hockeyService
      .getMatchExtras(this.league, homeTeamName, awayTeamName)
      .pipe(
        takeUntil(this.destroyed$),
        finalize(() => {
          this.extrasLoading = false;
          this.render();
        })
      )
      .subscribe({
        next: (extras) => {
          this.extras = extras;
          this.render();
        },
        error: (err) => {
          this.extrasError = err?.message ?? 'Failed to load match extras.';
          this.render();
        },
      });
  }

  trackTeam(team: HockeyPlayerStatsTeam): string {
    return team.teamId ?? team.teamName;
  }

  toggleRaw(): void {
    this.showRaw = !this.showRaw;
    this.render();
  }
}
