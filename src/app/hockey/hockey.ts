import { DatePipe } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import {
  EspnHockeyService,
  HockeyGame,
  HockeyNewsItem,
  HockeyTeam,
  HockeyTeamDetail,
} from '../shared/espn-hockey.service';

@Component({
  selector: 'app-hockey',
  imports: [DatePipe],
  templateUrl: './hockey.html',
  styleUrl: './hockey.css',
})
export class Hockey implements OnInit {
  readonly pageTitle = 'Hockey Events';
  readonly subtitle = 'Live NHL scores, news, and team data from ESPN APIs.';

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
    this.hockeyService.getScoreboard().subscribe({
      next: (games) => {
        this.games = games;
        this.loadingScores = false;
      },
      error: (err) => {
        this.errorScores = err?.message ?? 'Failed to load NHL scores.';
        this.loadingScores = false;
      },
    });

    this.hockeyService.getNews().subscribe({
      next: (news) => {
        this.news = news;
        this.loadingNews = false;
      },
      error: (err) => {
        this.errorNews = err?.message ?? 'Failed to load NHL news.';
        this.loadingNews = false;
      },
    });

    this.hockeyService.getTeams().subscribe({
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

  private loadTeamDetail(teamId: string): void {
    this.loadingTeam = true;
    this.errorTeam = '';
    this.hockeyService.getTeam(teamId).subscribe({
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
}
