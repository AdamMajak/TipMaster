import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, forkJoin, map, Observable, of, shareReplay, startWith, switchMap, throwError, timeout } from 'rxjs';
import { oddsApiKey } from './rapidapi.config.local';

export interface OddsSport {
  key: string;
  title: string;
  group: string;
  active: boolean;
  has_outrights: boolean;
}

export interface OddsOutcome {
  name: string;
  price: number;
}

export interface OddsMarket {
  key: string;
  outcomes: OddsOutcome[];
}

export interface OddsBookmaker {
  key: string;
  title: string;
  markets: OddsMarket[];
}

export interface OddsEvent {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: OddsBookmaker[];
}

@Injectable({ providedIn: 'root' })
export class OddsService {
  constructor(private readonly http: HttpClient) {}

  private sports$?: Observable<OddsSport[]>;

  private get apiKey(): string {
    return (oddsApiKey ?? '').trim();
  }

  private getOddsApiSports(forceRefresh = false): Observable<OddsSport[]> {
    if (forceRefresh) {
      this.sports$ = undefined;
    }

    if (!this.sports$) {
      const apiKey = this.apiKey;
      if (!apiKey) {
        this.sports$ = of([]);
      } else {
        this.sports$ = this.http
          .get<OddsSport[]>(`https://api.the-odds-api.com/v4/sports`, {
            params: { apiKey },
          })
          .pipe(
            timeout(8000),
            catchError(() => of([])),
            shareReplay({ bufferSize: 1, refCount: true })
          );
      }
    }

    return this.sports$;
  }

  getSports(): Observable<OddsSport[]> {
    const fallback = of([
      this.toSport('tennis', 'Tennis'),
      this.toSport('soccer', 'Football'),
      this.toSport('hockey', 'Hockey'),
      this.toSport('basketball', 'Basketball'),
      this.toSport('baseball', 'Baseball'),
      this.toSport('mma', 'MMA'),
    ]);

    if (!this.apiKey) {
      return fallback;
    }

    return this.getOddsApiSports().pipe(
      map((sports) => (sports.length ? sports : [])),
      map(() => [
        this.toSport('tennis', 'Tennis'),
        this.toSport('soccer', 'Football'),
        this.toSport('hockey', 'Hockey'),
        this.toSport('basketball', 'Basketball'),
        this.toSport('baseball', 'Baseball'),
        this.toSport('mma', 'MMA'),
      ]),
      catchError(() => fallback)
    );
  }

  getOddsBySport(sportKey: string): Observable<OddsEvent[]> {
    const apiKey = this.apiKey;
    if (!apiKey) {
      return throwError(
        () =>
          new Error(
            'Missing Odds API key. Set `oddsApiKey` in `src/app/shared/rapidapi.config.local.ts` to load real odds.'
          )
      );
    }

    return this.pickLeagueKeys(sportKey).pipe(
      switchMap((leagueKeys) => {
        if (!leagueKeys.length) {
          return of([] as OddsEvent[]);
        }

        const requests = leagueKeys.map((leagueKey) =>
          this.http
            .get<OddsEvent[]>(`https://api.the-odds-api.com/v4/sports/${encodeURIComponent(leagueKey)}/odds`, {
              params: {
                apiKey,
                regions: 'eu',
                markets: 'h2h',
                oddsFormat: 'decimal',
                dateFormat: 'iso',
              },
            })
            .pipe(
              timeout(8000),
              catchError(() => of([] as OddsEvent[])),
              map((events) => this.normalizeEvents(sportKey, leagueKey, events))
            )
        );

        return forkJoin(requests).pipe(map((parts) => parts.flat()));
      }),
      catchError(() => of([] as OddsEvent[])),
      startWith([] as OddsEvent[])
    );
  }

  private normalizeEvents(sportKey: string, leagueKey: string, events: OddsEvent[]): OddsEvent[] {
    const title = this.toTitle(sportKey);
    return (events ?? []).map((event) => ({
      ...event,
      id: `${leagueKey}:${event.id}`,
      sport_key: sportKey,
      sport_title: title,
    }));
  }

  private toSport(key: string, title: string): OddsSport {
    return {
      key,
      title,
      group: 'odds-api',
      active: true,
      has_outrights: false,
    };
  }

  private toTitle(value: string): string {
    if (!value) {
      return 'Sport';
    }
    return value.charAt(0).toUpperCase() + value.slice(1).replace(/[-_]/g, ' ');
  }

  private pickLeagueKeys(sportKey: string): Observable<string[]> {
    const max = this.maxLeaguesForSport(sportKey);

    return this.getOddsApiSports().pipe(
      map((sports) =>
        sports.filter((s) => s.active && !s.has_outrights && this.matchesGroup(sportKey, s.group))
      ),
      map((sports) => this.prioritizeLeagues(sportKey, sports).slice(0, max).map((s) => s.key)),
      catchError(() => of([]))
    );
  }

  private maxLeaguesForSport(sportKey: string): number {
    switch (sportKey) {
      case 'soccer':
      case 'football':
        return 6;
      case 'hockey':
        return 3;
      case 'tennis':
        return 3;
      case 'basketball':
      case 'baseball':
      case 'mma':
        return 2;
      default:
        return 2;
    }
  }

  private matchesGroup(sportKey: string, group: string): boolean {
    const normalized = (group ?? '').toLowerCase();
    switch (sportKey) {
      case 'soccer':
      case 'football':
        return normalized.includes('soccer');
      case 'hockey':
        return normalized.includes('ice hockey') || normalized.includes('hockey');
      case 'tennis':
        return normalized.includes('tennis');
      case 'basketball':
        return normalized.includes('basketball');
      case 'baseball':
        return normalized.includes('baseball');
      case 'mma':
        return normalized.includes('mma') || normalized.includes('martial') || normalized.includes('boxing');
      default:
        return false;
    }
  }

  private prioritizeLeagues(sportKey: string, sports: OddsSport[]): OddsSport[] {
    const priorities = this.priorityTitlesForSport(sportKey);
    if (!priorities.length) {
      return sports;
    }

    const byScore = [...sports].sort((a, b) => {
      const aScore = this.priorityScore(a.title, priorities);
      const bScore = this.priorityScore(b.title, priorities);
      if (aScore !== bScore) return bScore - aScore;
      return a.title.localeCompare(b.title);
    });

    return byScore;
  }

  private priorityTitlesForSport(sportKey: string): string[] {
    switch (sportKey) {
      case 'soccer':
      case 'football':
        return ['Premier League', 'La Liga', 'Serie A', 'Bundesliga', 'Ligue 1', 'Champions', 'Europa'];
      case 'hockey':
        return ['NHL', 'KHL', 'SHL', 'Liiga', 'AHL'];
      case 'tennis':
        return ['ATP', 'WTA'];
      case 'basketball':
        return ['NBA', 'Euroleague'];
      case 'baseball':
        return ['MLB'];
      case 'mma':
        return ['UFC'];
      default:
        return [];
    }
  }

  private priorityScore(title: string, priorities: string[]): number {
    const t = (title ?? '').toLowerCase();
    let score = 0;
    priorities.forEach((p, idx) => {
      if (!p) return;
      if (t.includes(p.toLowerCase())) {
        score += 100 - idx;
      }
    });
    return score;
  }
}
