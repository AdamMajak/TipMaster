import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { forkJoin, map, Observable } from 'rxjs';

export interface HockeyGame {
  id: string;
  date: string;
  status: string;
  detail: string;
  homeTeam: string;
  awayTeam: string;
  homeScore?: number;
  awayScore?: number;
  venue?: string;
}

export interface HockeyNewsItem {
  id: string;
  headline: string;
  description?: string;
  published?: string;
  image?: string;
  link?: string;
  source?: string;
}

export interface HockeyTeam {
  id: string;
  name: string;
  abbreviation?: string;
  logo?: string;
}

export interface HockeyTeamDetail {
  id: string;
  name: string;
  abbreviation?: string;
  location?: string;
  record?: string;
  venue?: string;
  color?: string;
  alternateColor?: string;
  logo?: string;
}

const ESPN_NHL_BASE_URL = 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl';

@Injectable({ providedIn: 'root' })
export class EspnHockeyService {
  constructor(private readonly http: HttpClient) {}

  getScoreboard(): Observable<HockeyGame[]> {
    const dates = this.buildScoreboardDates();
    const requests = dates.map((date) =>
      this.http.get<any>(`${ESPN_NHL_BASE_URL}/scoreboard?dates=${date}`)
    );

    return forkJoin(requests).pipe(
      map((responses) => responses.flatMap((data) => this.mapScoreboard(data))),
      map((games) => this.deduplicateGames(games)),
      map((games) => this.sortGames(games))
    );
  }

  getNews(): Observable<HockeyNewsItem[]> {
    return this.http.get<any>(`${ESPN_NHL_BASE_URL}/news`).pipe(
      map((data) => this.mapNews(data))
    );
  }

  getTeams(): Observable<HockeyTeam[]> {
    return this.http.get<any>(`${ESPN_NHL_BASE_URL}/teams`).pipe(
      map((data) => this.mapTeams(data))
    );
  }

  getTeam(teamId: string): Observable<HockeyTeamDetail | null> {
    return this.http.get<any>(`${ESPN_NHL_BASE_URL}/teams/${teamId}`).pipe(
      map((data) => this.mapTeamDetail(data))
    );
  }

  private mapScoreboard(data: any): HockeyGame[] {
    const events = data?.events ?? [];
    return events.map((event: any) => {
      const competition = event?.competitions?.[0];
      const competitors = competition?.competitors ?? [];
      const home = competitors.find((c: any) => c.homeAway === 'home') ?? competitors[0] ?? {};
      const away = competitors.find((c: any) => c.homeAway === 'away') ?? competitors[1] ?? {};
      const statusType = competition?.status?.type ?? event?.status?.type ?? {};
      const status = statusType?.shortDetail ?? statusType?.detail ?? statusType?.description ?? 'Scheduled';
      const displayStatus = statusType?.name ?? statusType?.description ?? status;
      const venue = competition?.venue?.fullName ?? competition?.venue?.name;

      return {
        id: event?.id ?? competition?.id ?? `${home?.team?.id ?? 'home'}-${away?.team?.id ?? 'away'}`,
        date: event?.date ?? competition?.date ?? new Date().toISOString(),
        status: displayStatus,
        detail: status,
        homeTeam: home?.team?.displayName ?? home?.team?.shortDisplayName ?? 'Home',
        awayTeam: away?.team?.displayName ?? away?.team?.shortDisplayName ?? 'Away',
        homeScore: this.toScore(home?.score),
        awayScore: this.toScore(away?.score),
        venue,
      };
    });
  }

  private buildScoreboardDates(): string[] {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    return [yesterday, today, tomorrow].map((date) => this.toEspnDate(date));
  }

  private toEspnDate(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}${month}${day}`;
  }

  private deduplicateGames(games: HockeyGame[]): HockeyGame[] {
    const unique = new Map<string, HockeyGame>();

    for (const game of games) {
      unique.set(game.id, game);
    }

    return Array.from(unique.values());
  }

  private sortGames(games: HockeyGame[]): HockeyGame[] {
    return [...games].sort((a, b) => {
      const aPriority = this.getStatusPriority(a.status);
      const bPriority = this.getStatusPriority(b.status);

      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }

      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });
  }

  private getStatusPriority(status: string): number {
    const normalized = status.toLowerCase();

    if (normalized.includes('in') || normalized.includes('live') || normalized.includes('progress')) {
      return 0;
    }

    if (normalized.includes('pre') || normalized.includes('scheduled')) {
      return 1;
    }

    if (normalized.includes('post') || normalized.includes('final')) {
      return 2;
    }

    return 1;
  }

  private mapNews(data: any): HockeyNewsItem[] {
    const articles = data?.articles ?? [];
    return articles.map((article: any) => ({
      id: article?.id?.toString() ?? article?.headline ?? `${article?.published ?? ''}`,
      headline: article?.headline ?? 'NHL Update',
      description: article?.description ?? article?.summary ?? '',
      published: article?.published ?? article?.lastModified,
      image: article?.images?.[0]?.url,
      link: article?.links?.web?.href,
      source: article?.source ?? article?.type,
    }));
  }

  private mapTeams(data: any): HockeyTeam[] {
    const teams =
      data?.sports?.[0]?.leagues?.[0]?.teams ??
      data?.leagues?.[0]?.teams ??
      data?.teams ??
      [];

    return teams.map((entry: any) => {
      const team = entry?.team ?? entry;
      return {
        id: team?.id?.toString() ?? '',
        name: team?.displayName ?? team?.name ?? 'Team',
        abbreviation: team?.abbreviation,
        logo: team?.logos?.[0]?.href ?? team?.logos?.[0]?.url,
      };
    }).filter((team: HockeyTeam) => team.id);
  }

  private mapTeamDetail(data: any): HockeyTeamDetail | null {
    const team =
      data?.team ??
      data?.teams?.[0]?.team ??
      data?.sports?.[0]?.leagues?.[0]?.teams?.[0]?.team ??
      null;

    if (!team) {
      return null;
    }

    const record =
      team?.record?.items?.[0]?.summary ??
      team?.recordSummary ??
      data?.recordSummary ??
      data?.team?.recordSummary;

    const venue = team?.venue?.fullName ?? team?.venue?.name;

    return {
      id: team?.id?.toString() ?? '',
      name: team?.displayName ?? team?.name ?? 'Team',
      abbreviation: team?.abbreviation,
      location: team?.location,
      record,
      venue,
      color: team?.color,
      alternateColor: team?.alternateColor,
      logo: team?.logos?.[0]?.href ?? team?.logos?.[0]?.url,
    };
  }

  private toScore(value: any): number | undefined {
    if (value === null || value === undefined || value === '') {
      return undefined;
    }
    const parsed = Number(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
}
