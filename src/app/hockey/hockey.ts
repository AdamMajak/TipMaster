import { DatePipe } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  EspnHockeyService,
  HockeyGame,
  HockeyNewsItem,
  HockeyTeam,
  HockeyTeamDetail,
} from '../shared/espn-hockey.service';
import { RouterLink } from '@angular/router';
import { ESPN_HOCKEY_LEAGUES, HockeyLeagueOption } from '../shared/espn-hockey-leagues';

@Component({
  selector: 'app-hockey',
  imports: [DatePipe, RouterLink, FormsModule],
  templateUrl: './hockey.html',
  styleUrl: './hockey.css',
})
export class Hockey implements OnInit {
  readonly pageTitle = 'Hockey Events';
  readonly subtitle = 'Live scores, news, and teams from ESPN hockey APIs.';
  readonly slovakTimezone = 'Europe/Bratislava';

  readonly leagues: HockeyLeagueOption[] = ESPN_HOCKEY_LEAGUES;
  selectedLeague = this.leagues[0]?.id ?? 'nhl';

  loadingScores = true;
  loadingNews = true;
  loadingTeams = true;
  loadingTeam = false;

  errorScores = '';
  errorNews = '';
  errorTeams = '';
  errorTeam = '';

  games: HockeyGame[] = [];
  news: HockeyNewsItem[] = [];
  teams: HockeyTeam[] = [];
  selectedTeam: HockeyTeam | null = null;
  teamDetail: HockeyTeamDetail | null = null;

  constructor(private readonly hockeyService: EspnHockeyService) {}

  ngOnInit(): void {
    this.reloadLeague();
  }

  onLeagueChange(): void {
    this.reloadLeague();
  }

  private reloadLeague(): void {
    this.resetLeagueState();

    this.hockeyService.getScoreboard(this.selectedLeague).subscribe({
      next: (games) => {
        this.games = games;
        this.loadingScores = false;
      },
      error: (err) => {
        this.errorScores = err?.message ?? 'Failed to load NHL scores.';
        this.loadingScores = false;
      },
    });

    this.hockeyService.getNews(this.selectedLeague).subscribe({
      next: (news) => {
        this.news = news;
        this.loadingNews = false;
      },
      error: (err) => {
        this.errorNews = err?.message ?? 'Failed to load NHL news.';
        this.loadingNews = false;
      },
    });

    this.hockeyService.getTeams(this.selectedLeague).subscribe({
      next: (teams) => {
        this.teams = teams;
        this.loadingTeams = false;
        this.selectTeam(teams[0] ?? null);
      },
      error: (err) => {
        this.errorTeams = err?.message ?? 'Failed to load NHL teams.';
        this.loadingTeams = false;
      },
    });
  }

  selectTeam(team: HockeyTeam | null): void {
    if (!team) {
      this.selectedTeam = null;
      this.teamDetail = null;
      return;
    }

    this.selectedTeam = team;
    this.loadTeamDetail(team.id);
  }

  get scheduledGames(): HockeyGame[] {
    return this.games.filter((game) => this.isScheduledGame(game));
  }

  get liveGames(): HockeyGame[] {
    return this.games.filter((game) => this.isLiveGame(game));
  }

  get finishedGames(): HockeyGame[] {
    return this.games.filter((game) => this.isFinishedGame(game));
  }

  private loadTeamDetail(teamId: string): void {
    this.loadingTeam = true;
    this.errorTeam = '';
    this.hockeyService.getTeam(this.selectedLeague, teamId).subscribe({
      next: (detail) => {
        this.teamDetail = detail;
        this.loadingTeam = false;
      },
      error: (err) => {
        this.errorTeam = err?.message ?? 'Failed to load team details.';
        this.loadingTeam = false;
      },
    });
  }

  private resetLeagueState(): void {
    this.loadingScores = true;
    this.loadingNews = true;
    this.loadingTeams = true;
    this.loadingTeam = false;

    this.errorScores = '';
    this.errorNews = '';
    this.errorTeams = '';
    this.errorTeam = '';

    this.games = [];
    this.news = [];
    this.teams = [];
    this.selectedTeam = null;
    this.teamDetail = null;
  }

  private isScheduledGame(game: HockeyGame): boolean {
    return !this.isLiveGame(game) && !this.isFinishedGame(game);
  }

  private isLiveGame(game: HockeyGame): boolean {
    const normalized = `${game.status} ${game.detail}`.toLowerCase();
    return normalized.includes('live') || normalized.includes('progress') || normalized.includes('intermission');
  }

  private isFinishedGame(game: HockeyGame): boolean {
    const normalized = `${game.status} ${game.detail}`.toLowerCase();
    return normalized.includes('final') || normalized.includes('post');
  }
}
