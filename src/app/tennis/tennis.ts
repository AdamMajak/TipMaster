import { DatePipe } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EspnTennisLeague, EspnTennisService, TennisGame, TennisNewsItem } from '../shared/espn-tennis.service';

interface TennisLeagueOption {
  id: EspnTennisLeague;
  label: string;
}

@Component({
  selector: 'app-tennis',
  imports: [DatePipe, FormsModule],
  templateUrl: './tennis.html',
  styleUrl: './tennis.css',
})
export class Tennis implements OnInit {
  readonly pageTitle = 'Tennis Events';
  readonly subtitle = 'ATP / WTA scoreboard and news from ESPN APIs.';
  readonly slovakTimezone = 'Europe/Bratislava';

  readonly leagues: TennisLeagueOption[] = [
    { id: 'atp', label: 'ATP' },
    { id: 'wta', label: 'WTA' },
  ];

  selectedLeague: EspnTennisLeague = 'atp';

  loadingScores = true;
  loadingNews = true;
  errorScores = '';
  errorNews = '';

  games: TennisGame[] = [];
  news: TennisNewsItem[] = [];

  constructor(private readonly tennisService: EspnTennisService) {}

  ngOnInit(): void {
    this.reloadLeague();
  }

  onLeagueChange(): void {
    this.reloadLeague();
  }

  get scheduledGames(): TennisGame[] {
    return this.games.filter((game) => this.isScheduledGame(game));
  }

  get liveGames(): TennisGame[] {
    return this.games.filter((game) => this.isLiveGame(game));
  }

  get finishedGames(): TennisGame[] {
    return this.games.filter((game) => this.isFinishedGame(game));
  }

  private reloadLeague(): void {
    this.loadingScores = true;
    this.loadingNews = true;
    this.errorScores = '';
    this.errorNews = '';
    this.games = [];
    this.news = [];

    this.tennisService.getScoreboard(this.selectedLeague).subscribe({
      next: (games) => {
        this.games = games;
        this.loadingScores = false;
      },
      error: (err) => {
        this.errorScores = err?.message ?? 'Failed to load tennis scoreboard.';
        this.loadingScores = false;
      },
    });

    this.tennisService.getNews(this.selectedLeague).subscribe({
      next: (news) => {
        this.news = news;
        this.loadingNews = false;
      },
      error: (err) => {
        this.errorNews = err?.message ?? 'Failed to load tennis news.';
        this.loadingNews = false;
      },
    });
  }

  private isScheduledGame(game: TennisGame): boolean {
    return !this.isLiveGame(game) && !this.isFinishedGame(game);
  }

  private isLiveGame(game: TennisGame): boolean {
    if (game.state?.toLowerCase() === 'in') {
      return true;
    }

    const normalized = `${game.status} ${game.detail}`.toLowerCase();
    return normalized.includes('live') || normalized.includes('in progress') || normalized.includes('progress');
  }

  private isFinishedGame(game: TennisGame): boolean {
    if (game.completed || game.state?.toLowerCase() === 'post') {
      return true;
    }

    const normalized = `${game.status} ${game.detail}`.toLowerCase();
    return normalized.includes('final') || normalized.includes('post');
  }
}
