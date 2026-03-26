import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';

export type EspnTennisLeague = 'atp' | 'wta';

export interface TennisGame {
  id: string;
  date: string;
  status: string;
  detail: string;
  state?: string;
  completed?: boolean;
  playerA: string;
  playerB: string;
  scoreA?: string;
  scoreB?: string;
  tournament?: string;
  round?: string;
  venue?: string;
  odds: TennisOddsOutcome[];
}

export interface TennisOddsOutcome {
  name: string;
  price: number;
}

export interface TennisNewsItem {
  id: string;
  headline: string;
  description?: string;
  published?: string;
  image?: string;
  link?: string;
  source?: string;
}

const ESPN_TENNIS_BASE_URL = 'https://site.api.espn.com/apis/site/v2/sports/tennis';
const DEFAULT_TENNIS_PLAYER_RATING = 74;
const TENNIS_BOOK_MARGIN = 1.05;

const ATP_PLAYER_RATINGS: Record<string, number> = {
  'jannik sinner': 99,
  'carlos alcaraz': 98,
  'novak djokovic': 95,
  'daniil medvedev': 92,
  'alexander zverev': 91,
  'andrey rublev': 87,
  'stefanos tsitsipas': 86,
  'hubert hurkacz': 86,
  'casper ruud': 85,
  'taylor fritz': 85,
  'grigor dimitrov': 83,
  'tommy paul': 82,
  'holger rune': 82,
  'alex de minaur': 84,
};

const WTA_PLAYER_RATINGS: Record<string, number> = {
  'aryna sabalenka': 98,
  'iga swiatek': 97,
  'coco gauff': 92,
  'elena rybakina': 92,
  'jessica pegula': 88,
  'qinwen zheng': 87,
  'ons jabeur': 84,
  'marketa vondrousova': 83,
  'jasmine paolini': 86,
  'danielle collins': 84,
  'emma navarro': 83,
  'mirra andreeva': 84,
  'madison keys': 85,
  'naomi osaka': 82,
};

@Injectable({ providedIn: 'root' })
export class EspnTennisService {
  constructor(private readonly http: HttpClient) {}

  getScoreboard(league: EspnTennisLeague): Observable<TennisGame[]> {
    const dates = this.buildScoreboardRange();
    return this.http
      .get<any>(`${ESPN_TENNIS_BASE_URL}/${league}/scoreboard?dates=${dates}`)
      .pipe(map((data) => this.mapScoreboard(data, league)));
  }

  getNews(league: EspnTennisLeague): Observable<TennisNewsItem[]> {
    return this.http
      .get<any>(`${ESPN_TENNIS_BASE_URL}/${league}/news`)
      .pipe(map((data) => this.mapNews(data)));
  }

  private mapScoreboard(data: any, league: EspnTennisLeague): TennisGame[] {
    const events = data?.events ?? [];

    return events
      .map((event: any) => {
        const competition = event?.competitions?.[0];
        const competitors = competition?.competitors ?? [];
        const a = competitors[0] ?? {};
        const b = competitors[1] ?? {};
        const statusType = competition?.status?.type ?? event?.status?.type ?? {};
        const status = statusType?.shortDetail ?? statusType?.detail ?? statusType?.description ?? 'Scheduled';
        const displayStatus = this.formatStatusLabel(statusType, status);

        const tournament =
          competition?.tournament?.name ??
          event?.season?.name ??
          event?.league?.name ??
          event?.name;
        const round = competition?.type?.abbreviation ?? competition?.type?.text ?? competition?.type?.description;
        const venue = competition?.venue?.fullName ?? competition?.venue?.name;

        const playerA = this.formatCompetitorName(a);
        const playerB = this.formatCompetitorName(b);
        const scoreA = this.formatCompetitorScore(a);
        const scoreB = this.formatCompetitorScore(b);

        const id = event?.id ?? competition?.id ?? `${playerA}-${playerB}-${event?.date ?? ''}`;
        const date = event?.date ?? competition?.date ?? new Date().toISOString();

        return {
          id: String(id),
          date,
          status: displayStatus,
          detail: status,
          state: statusType?.state,
          completed: Boolean(statusType?.completed),
          playerA,
          playerB,
          scoreA,
          scoreB,
          tournament,
          round,
          venue,
          odds: this.buildMatchOdds(playerA, playerB, league),
        } satisfies TennisGame;
      })
      .filter((game: TennisGame) => Boolean(game.id));
  }

  private buildMatchOdds(playerA: string, playerB: string, league: EspnTennisLeague): TennisOddsOutcome[] {
    const ratings = league === 'wta' ? WTA_PLAYER_RATINGS : ATP_PLAYER_RATINGS;
    const ratingA = this.resolvePlayerRating(playerA, ratings);
    const ratingB = this.resolvePlayerRating(playerB, ratings);
    const probabilityA = 1 / (1 + Math.exp(-(ratingA - ratingB) / 7));
    const probabilityB = 1 - probabilityA;

    return [
      { name: '2', price: this.toDecimalOdds(probabilityA) },
      { name: '1', price: this.toDecimalOdds(probabilityB) },
    ];
  }

  private resolvePlayerRating(playerName: string, ratings: Record<string, number>): number {
    const normalized = this.normalizeName(playerName);
    return ratings[normalized] ?? DEFAULT_TENNIS_PLAYER_RATING;
  }

  private normalizeName(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9/ ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private toDecimalOdds(probability: number): number {
    const safeProbability = this.clamp(probability, 0.12, 0.88);
    return Math.round((1 / (safeProbability * TENNIS_BOOK_MARGIN)) * 100) / 100;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private formatStatusLabel(statusType: any, fallback: string): string {
    const state = statusType?.state?.toLowerCase();
    const shortDetail = `${statusType?.shortDetail ?? ''}`.trim();

    if (state === 'post') {
      return shortDetail || 'FT';
    }

    if (state === 'in') {
      return shortDetail || 'Live';
    }

    if (state === 'pre') {
      return shortDetail || 'Scheduled';
    }

    return fallback;
  }

  private formatCompetitorName(competitor: any): string {
    const athleteName =
      competitor?.athlete?.displayName ??
      competitor?.athlete?.shortName ??
      competitor?.athlete?.fullName;
    if (athleteName) return athleteName;

    const teamName =
      competitor?.team?.displayName ??
      competitor?.team?.shortDisplayName ??
      competitor?.team?.name;
    if (teamName) return teamName;

    // Some tennis doubles feeds include "athletes" array.
    const athletes = competitor?.athletes;
    if (Array.isArray(athletes) && athletes.length) {
      const names = athletes
        .map((a: any) => a?.displayName ?? a?.shortName ?? a?.fullName)
        .filter(Boolean);
      if (names.length) return names.join(' / ');
    }

    return competitor?.name ?? 'TBD';
  }

  private formatCompetitorScore(competitor: any): string | undefined {
    const score = competitor?.score;
    if (score === null || score === undefined || score === '') {
      return undefined;
    }
    return String(score);
  }

  private mapNews(data: any): TennisNewsItem[] {
    const articles = data?.articles ?? [];
    return articles.map((article: any) => ({
      id: article?.id?.toString() ?? article?.headline ?? `${article?.published ?? ''}`,
      headline: article?.headline ?? 'Tennis Update',
      description: article?.description ?? article?.summary ?? '',
      published: article?.published ?? article?.lastModified,
      image: article?.images?.[0]?.url,
      link: article?.links?.web?.href,
      source: article?.source ?? article?.type,
    }));
  }

  private buildScoreboardRange(): string {
    // ESPN supports ranges in the form YYYYMMDD-YYYYMMDD (see docs).
    const start = new Date();
    start.setDate(start.getDate() - 2);

    const end = new Date();
    end.setDate(end.getDate() + 6);

    return `${this.toEspnDate(start)}-${this.toEspnDate(end)}`;
  }

  private toEspnDate(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}${month}${day}`;
  }
}

