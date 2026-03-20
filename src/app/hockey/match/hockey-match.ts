import { DatePipe, JsonPipe } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { combineLatest, Subject, takeUntil } from 'rxjs';
import { EspnHockeyService, HockeyMatchSummary, HockeyPlayerStatsTeam } from '../../shared/espn-hockey.service';

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

  showRaw = false;

  get requestUrl(): string {
    return `/espn/apis/site/v2/sports/hockey/${encodeURIComponent(this.league)}/summary?event=${encodeURIComponent(this.eventId)}`;
  }

  private readonly destroyed$ = new Subject<void>();

  constructor(
    private readonly route: ActivatedRoute,
    private readonly hockeyService: EspnHockeyService
  ) {}

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
          this.showRaw = false;
        },
      });
  }

  ngOnDestroy(): void {
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
    this.showRaw = false;

    this.hockeyService
      .getMatchSummary(this.league, eventId)
      .pipe(takeUntil(this.destroyed$))
      .subscribe({
        next: (summary) => {
          this.summary = summary;
          this.loading = false;
        },
        error: (err) => {
          this.error = err?.message ?? 'Failed to load game details.';
          this.loading = false;
        },
      });
  }

  trackTeam(team: HockeyPlayerStatsTeam): string {
    return team.teamId ?? team.teamName;
  }

  toggleRaw(): void {
    this.showRaw = !this.showRaw;
  }
}
