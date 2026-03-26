import { DatePipe } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  EspnSoccerService,
  SoccerGame,
  SoccerNewsItem,
  SoccerOddsOutcome,
  SoccerTeam,
  SoccerTeamDetail,
} from '../shared/espn-soccer.service';
import { ESPN_SOCCER_LEAGUES, SoccerLeagueOption } from '../shared/espn-soccer-leagues';
import { BetSlipService } from '../shared/betslip.service';

@Component({
  selector: 'app-football',
  imports: [DatePipe, FormsModule, RouterLink],
  templateUrl: './football.html',
  styleUrls: ['./football.css'],
})
export class Football implements OnInit {
  private readonly betSlipService = inject(BetSlipService);

  readonly pageTitle = 'Football Events';
  readonly subtitle = 'Live soccer scores, news, and teams from ESPN APIs.';
  readonly slovakTimezone = 'Europe/Bratislava';

  readonly leagues: SoccerLeagueOption[] = ESPN_SOCCER_LEAGUES;

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

  get scheduledGames(): SoccerGame[] {
    return this.games.filter((game) => this.isScheduledGame(game));
  }

  get liveGames(): SoccerGame[] {
    return this.games.filter((game) => this.isLiveGame(game));
  }

  get finishedGames(): SoccerGame[] {
    return this.games.filter((game) => this.isFinishedGame(game));
  }

  get latestMatchdayGames(): SoccerGame[] {
    const finishedGames = this.finishedGames;

    if (!finishedGames.length) {
      return [];
    }

    const latestMatchday = finishedGames.reduce<string | null>((latest, game) => {
      const gameDay = this.toSlovakDayKey(game.date);

      if (!latest || gameDay > latest) {
        return gameDay;
      }

      return latest;
    }, null);

    return finishedGames.filter((game) => this.toSlovakDayKey(game.date) === latestMatchday);
  }

  get olderFinishedGames(): SoccerGame[] {
    const latestIds = new Set(this.latestMatchdayGames.map((game) => game.id));
    return this.finishedGames.filter((game) => !latestIds.has(game.id));
  }

  toggleSelection(game: SoccerGame, odd: SoccerOddsOutcome): void {
    this.betSlipService.toggleSelection({
      eventId: `football-${this.selectedLeague}-${game.id}`,
      sport: `Football (${this.selectedLeague})`,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      kickoff: game.date,
      market: odd.name,
      odds: odd.price,
    });
  }

  isSelected(game: SoccerGame, odd: SoccerOddsOutcome): boolean {
    return this.betSlipService.isSelected(`football-${this.selectedLeague}-${game.id}`, odd.name);
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

  private isScheduledGame(game: SoccerGame): boolean {
    return !this.isLiveGame(game) && !this.isFinishedGame(game);
  }

  private isLiveGame(game: SoccerGame): boolean {
    if (this.isFutureGame(game)) {
      return false;
    }

    if (game.state?.toLowerCase() === 'in') {
      return true;
    }

    const normalized = `${game.status} ${game.detail}`.toLowerCase();
    return normalized.includes('live') || normalized.includes('progress') || normalized.includes('half');
  }

  private isFinishedGame(game: SoccerGame): boolean {
    if (this.isFutureGame(game)) {
      return false;
    }

    if (game.completed || game.state?.toLowerCase() === 'post') {
      return true;
    }

    if (game.state?.toLowerCase() === 'pre') {
      return false;
    }

    const normalized = `${game.status} ${game.detail}`.toLowerCase();
    return normalized.includes('final') || normalized.includes('post') || normalized.includes('after');
  }

  private isFutureGame(game: SoccerGame): boolean {
    return new Date(game.date).getTime() > Date.now();
  }

  private toSlovakDayKey(value: string): string {
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: this.slovakTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(value));
  }
}
