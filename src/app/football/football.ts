import { DatePipe } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  EspnSoccerService,
  SoccerGame,
  SoccerNewsItem,
  SoccerTeam,
  SoccerTeamDetail,
} from '../shared/espn-soccer.service';

interface SoccerLeagueOption {
  id: string;
  label: string;
}

@Component({
  selector: 'app-football',
  imports: [DatePipe, FormsModule],
  templateUrl: './football.html',
  styleUrls: ['./football.css'],
})
export class Football implements OnInit {
  readonly pageTitle = 'Football Events';
  readonly subtitle = 'Live soccer scores, news, and teams from ESPN APIs.';

  readonly leagues: SoccerLeagueOption[] = [
    { id: 'eng.1', label: 'Premier League' },
    { id: 'esp.1', label: 'LaLiga' },
    { id: 'ita.1', label: 'Serie A' },
    { id: 'ger.1', label: 'Bundesliga' },
    { id: 'fra.1', label: 'Ligue 1' },
    { id: 'uefa.champions', label: 'Champions League' },
    { id: 'uefa.europa', label: 'Europa League' },
    { id: 'usa.1', label: 'MLS' },
  ];

  selectedLeague = this.leagues[0]?.id ?? 'eng.1';

  loadingScores = true;
  loadingNews = true;
  loadingTeams = true;
  loadingTeam = false;

  errorScores = '';
  errorNews = '';
  errorTeams = '';
  errorTeam = '';

  games: SoccerGame[] = [];
  news: SoccerNewsItem[] = [];
  teams: SoccerTeam[] = [];
  selectedTeam: SoccerTeam | null = null;
  teamDetail: SoccerTeamDetail | null = null;

  constructor(private readonly soccerService: EspnSoccerService) {}

  ngOnInit(): void {
    this.reloadLeague();
  }

  onLeagueChange(): void {
    this.reloadLeague();
  }

  selectTeam(team: SoccerTeam | null): void {
    if (!team) {
      this.selectedTeam = null;
      this.teamDetail = null;
      return;
    }

    this.selectedTeam = team;
    this.loadTeamDetail(team.id);
  }

  private reloadLeague(): void {
    this.resetLeagueState();

    this.soccerService.getScoreboard(this.selectedLeague).subscribe({
      next: (games) => {
        this.games = games;
        this.loadingScores = false;
      },
      error: (err) => {
        this.errorScores = err?.message ?? 'Failed to load league scores.';
        this.loadingScores = false;
      },
    });

    this.soccerService.getNews(this.selectedLeague).subscribe({
      next: (news) => {
        this.news = news;
        this.loadingNews = false;
      },
      error: (err) => {
        this.errorNews = err?.message ?? 'Failed to load league news.';
        this.loadingNews = false;
      },
    });

    this.soccerService.getTeams(this.selectedLeague).subscribe({
      next: (teams) => {
        this.teams = teams;
        this.loadingTeams = false;
        this.selectTeam(teams[0] ?? null);
      },
      error: (err) => {
        this.errorTeams = err?.message ?? 'Failed to load league teams.';
        this.loadingTeams = false;
      },
    });
  }

  private loadTeamDetail(teamId: string): void {
    this.loadingTeam = true;
    this.errorTeam = '';
    this.soccerService.getTeam(this.selectedLeague, teamId).subscribe({
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
}
