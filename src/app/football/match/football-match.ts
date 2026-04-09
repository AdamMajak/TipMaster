import { DatePipe, JsonPipe } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { combineLatest, finalize, Subject, takeUntil } from 'rxjs';
import {
  EspnSoccerService,
  SoccerMatchExtras,
  SoccerMatchSummary,
  SoccerPlayerStatsTeam,
  SoccerRosterPlayer,
  SoccerTeamDetail,
} from '../../shared/espn-soccer.service';

@Component({
  selector: 'app-football-match',
  imports: [DatePipe, JsonPipe, RouterLink],
  templateUrl: './football-match.html',
  styleUrl: './football-match.css',
})
export class FootballMatch implements OnInit, OnDestroy {
  readonly slovakTimezone = 'Europe/Bratislava';

  loading = false;
  error = '';
  league = 'eng.1';
  eventId = '';

  detailsRequested = false;
  summary: SoccerMatchSummary | null = null;

  extrasLoading = false;
  extrasError = '';
  extras: SoccerMatchExtras | null = null;
  showRaw = false;
  private destroyed = false;

  get requestUrl(): string {
    const safeLeague = encodeURIComponent(this.league);
    const safeEvent = encodeURIComponent(this.eventId);
    const host = typeof location === 'undefined' ? '' : location.hostname;
    const port = typeof location === 'undefined' ? '' : location.port;

    if (host === 'localhost' || host === '127.0.0.1' || port === '4200') {
      return `/espn/apis/site/v2/sports/soccer/${safeLeague}/summary?event=${safeEvent}`;
    }

    return `https://site.api.espn.com/apis/site/v2/sports/soccer/${safeLeague}/summary?event=${safeEvent}`;
  }

  private readonly destroyed$ = new Subject<void>();

  constructor(
    private readonly route: ActivatedRoute,
    private readonly soccerService: EspnSoccerService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  private render(): void {
    if (this.destroyed) {
      return;
    }

    this.cdr.detectChanges();
  }

  formatStatName(value: string): string {
    const key = (value ?? '').trim();

    const pretty: Record<string, string> = {
      'Shots on Target': 'Shots on Target',
      'Total Shots': 'Total Shots',
      Possession: 'Possession %',
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
    const key = (value ?? '').trim().toLowerCase();

    if (key.includes('possession')) return 'Ball possession share (%).';
    if (key.includes('shots on target')) return 'Shots on target (on goal).';
    if (key.includes('total shots')) return 'All shots attempted.';

    return '';
  }

  ngOnInit(): void {
    combineLatest([this.route.paramMap, this.route.queryParamMap])
      .pipe(takeUntil(this.destroyed$))
      .subscribe({
        next: ([params, query]) => {
          this.eventId = (params.get('eventId') ?? '').trim();
          this.league = (query.get('league') ?? 'eng.1').trim() || 'eng.1';
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

  trackTeamStatsTeam(team: SoccerPlayerStatsTeam): string {
    return team.teamId ?? team.teamName;
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

    this.soccerService
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
              'No match details found for this event. It may be outside the scoreboard date window or the event id is invalid.';
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
          this.error = err?.message ?? 'Failed to load match details.';
          this.render();
        },
      });
  }

  get homeTeamDetail(): SoccerTeamDetail | null {
    return this.extras?.homeTeamDetail ?? null;
  }

  get awayTeamDetail(): SoccerTeamDetail | null {
    return this.extras?.awayTeamDetail ?? null;
  }

  get homeRoster(): SoccerRosterPlayer[] {
    return this.extras?.homeRoster ?? [];
  }

  get awayRoster(): SoccerRosterPlayer[] {
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

    this.soccerService
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

  toggleRaw(): void {
    this.showRaw = !this.showRaw;
    this.render();
  }
}
