import { DatePipe, JsonPipe } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { combineLatest, of, Subject, switchMap, takeUntil } from 'rxjs';
import { EspnSoccerService, SoccerMatchSummary, SoccerPlayerStatsTeam } from '../../shared/espn-soccer.service';

@Component({
  selector: 'app-football-match',
  imports: [DatePipe, JsonPipe, RouterLink],
  templateUrl: './football-match.html',
  styleUrl: './football-match.css',
})
export class FootballMatch implements OnInit, OnDestroy {
  readonly slovakTimezone = 'Europe/Bratislava';

  loading = true;
  error = '';
  league = 'eng.1';
  eventId = '';

  summary: SoccerMatchSummary | null = null;
  showRaw = false;

  get requestUrl(): string {
    return `https://site.api.espn.com/apis/site/v2/sports/soccer/${encodeURIComponent(this.league)}/summary?event=${encodeURIComponent(this.eventId)}`;
  }

  private readonly destroyed$ = new Subject<void>();

  constructor(
    private readonly route: ActivatedRoute,
    private readonly soccerService: EspnSoccerService
  ) {}

  ngOnInit(): void {
    combineLatest([this.route.paramMap, this.route.queryParamMap])
      .pipe(
        takeUntil(this.destroyed$),
        switchMap(([params, query]) => {
          const eventId = (params.get('eventId') ?? '').trim();
          this.eventId = eventId;
          this.league = (query.get('league') ?? 'eng.1').trim() || 'eng.1';

          this.loading = true;
          this.error = '';
          this.summary = null;
          this.showRaw = false;

          if (!eventId) {
            this.loading = false;
            this.error = 'Missing event id.';
            return of(null);
          }

          return this.soccerService.getMatchSummary(this.league, eventId);
        })
      )
      .subscribe({
        next: (summary) => {
          this.summary = summary;
          this.loading = false;
        },
        error: (err) => {
          this.error = err?.message ?? 'Failed to load match details.';
          this.loading = false;
        },
      });
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  trackTeamStatsTeam(team: SoccerPlayerStatsTeam): string {
    return team.teamId ?? team.teamName;
  }

  toggleRaw(): void {
    this.showRaw = !this.showRaw;
  }
}
