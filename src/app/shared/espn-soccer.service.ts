import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';

export interface SoccerGame {
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

export interface SoccerNewsItem {
  id: string;
  headline: string;
  description?: string;
  published?: string;
  image?: string;
  link?: string;
  source?: string;
}

export interface SoccerTeam {
  id: string;
  name: string;
  abbreviation?: string;
  logo?: string;
}

export interface SoccerTeamDetail {
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

const ESPN_SOCCER_BASE_URL = 'https://site.api.espn.com/apis/site/v2/sports/soccer';

@Injectable({ providedIn: 'root' })
export class EspnSoccerService {
  constructor(private readonly http: HttpClient) {}

  getScoreboard(league: string): Observable<SoccerGame[]> {
    return this.http.get<any>(`${ESPN_SOCCER_BASE_URL}/${league}/scoreboard`).pipe(
      map((data) => this.mapScoreboard(data))
    );
  }

  getNews(league: string): Observable<SoccerNewsItem[]> {
    return this.http.get<any>(`${ESPN_SOCCER_BASE_URL}/${league}/news`).pipe(
      map((data) => this.mapNews(data))
    );
  }

  getTeams(league: string): Observable<SoccerTeam[]> {
    return this.http.get<any>(`${ESPN_SOCCER_BASE_URL}/${league}/teams`).pipe(
      map((data) => this.mapTeams(data))
    );
  }

  getTeam(league: string, teamId: string): Observable<SoccerTeamDetail | null> {
    return this.http.get<any>(`${ESPN_SOCCER_BASE_URL}/${league}/teams/${teamId}`).pipe(
      map((data) => this.mapTeamDetail(data))
    );
  }

  private mapScoreboard(data: any): SoccerGame[] {
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

  private mapNews(data: any): SoccerNewsItem[] {
    const articles = data?.articles ?? [];
    return articles.map((article: any) => ({
      id: article?.id?.toString() ?? article?.headline ?? `${article?.published ?? ''}`,
      headline: article?.headline ?? 'Soccer Update',
      description: article?.description ?? article?.summary ?? '',
      published: article?.published ?? article?.lastModified,
      image: article?.images?.[0]?.url,
      link: article?.links?.web?.href,
      source: article?.source ?? article?.type,
    }));
  }

  private mapTeams(data: any): SoccerTeam[] {
    const teams =
      data?.sports?.[0]?.leagues?.[0]?.teams ??
      data?.leagues?.[0]?.teams ??
      data?.teams ??
      [];

    return teams
      .map((entry: any) => {
        const team = entry?.team ?? entry;
        return {
          id: team?.id?.toString() ?? '',
          name: team?.displayName ?? team?.name ?? 'Team',
          abbreviation: team?.abbreviation,
          logo: team?.logos?.[0]?.href ?? team?.logos?.[0]?.url,
        };
      })
      .filter((team: SoccerTeam) => team.id);
  }

  private mapTeamDetail(data: any): SoccerTeamDetail | null {
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
