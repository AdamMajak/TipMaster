import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { catchError, map, Observable, of, shareReplay, throwError, timeout } from 'rxjs';
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

interface SportsGameOddsOdd {
  betTypeID?: string;
  sideID?: string;
  odds?: string | number;
  fairOdds?: string | number;
  byBookmaker?: Record<string, { odds?: string | number; available?: boolean }>;
}

interface SportsGameOddsEvent {
  eventID?: string;
  startsAt?: string;
  commenceTime?: string;
  startTime?: string;
  teams?: {
    home?: { names?: { long?: string; short?: string } };
    away?: { names?: { long?: string; short?: string } };
  };
  odds?: Record<string, SportsGameOddsOdd>;
}

interface SportsGameOddsResponse<T> {
  success?: boolean;
  data?: T[];
}

@Injectable({ providedIn: 'root' })
export class OddsService {
  constructor(private readonly http: HttpClient) {}

  private readonly apiBase = 'https://api.sportsgameodds.com/v2';
  private readonly oddsByKeyCache = new Map<string, { expiresAt: number; stream: Observable<OddsEvent[]> }>();
  private readonly oddsCacheTtlMs = 5 * 60 * 1000;
  private readonly oddsMaxStaleMs = 60 * 60 * 1000;
  private readonly oddsStoragePrefix = 'tipmaster.odds.v2.';

  private get apiKey(): string {
    return (oddsApiKey ?? '').trim();
  }

  getSports(): Observable<OddsSport[]> {
    return of([
      this.toSport('tennis', 'Tennis'),
      this.toSport('soccer', 'Football'),
      this.toSport('hockey', 'Hockey'),
      this.toSport('basketball', 'Basketball'),
      this.toSport('baseball', 'Baseball'),
      this.toSport('mma', 'MMA'),
    ]);
  }

  getOddsBySport(sportKey: string): Observable<OddsEvent[]> {
    const normalized = this.normalizeSportKey(sportKey);
    return this.getOddsWithCache(normalized, () => this.fetchEvents(normalized, []));
  }

  getOddsByLeagueKeys(sportKey: string, leagueKeys: string[]): Observable<OddsEvent[]> {
    const normalized = this.normalizeSportKey(sportKey);
    const normalizedLeagueKeys = (leagueKeys ?? [])
      .map((item) => `${item ?? ''}`.trim())
      .filter(Boolean);

    if (!normalizedLeagueKeys.length) {
      return this.getOddsBySport(normalized);
    }

    return this.getOddsWithCache(
      `${normalized}:${normalizedLeagueKeys.sort().join(',')}`,
      () => this.fetchEvents(normalized, normalizedLeagueKeys)
    );
  }

  private getOddsWithCache(cacheKey: string, loader: () => Observable<OddsEvent[]>): Observable<OddsEvent[]> {
    const now = Date.now();
    const cached = this.oddsByKeyCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.stream;
    }

    const persisted = this.readPersistedOdds(cacheKey);
    if (persisted && now - persisted.fetchedAt <= this.oddsCacheTtlMs) {
      const stream = of(persisted.events).pipe(shareReplay({ bufferSize: 1, refCount: true }));
      this.oddsByKeyCache.set(cacheKey, {
        expiresAt: persisted.fetchedAt + this.oddsCacheTtlMs,
        stream,
      });
      return stream;
    }

    const stream = loader().pipe(
      map((events) => {
        if (events.length) {
          return events;
        }
        if (persisted && now - persisted.fetchedAt <= this.oddsMaxStaleMs) {
          return persisted.events;
        }
        return [] as OddsEvent[];
      }),
      map((events) => this.deduplicateEvents(events)),
      map((events) => events.slice(0, 500)),
      map((events) => {
        if (events.length) {
          this.persistOdds(cacheKey, events);
        }
        return events;
      }),
      catchError(() => {
        if (persisted && now - persisted.fetchedAt <= this.oddsMaxStaleMs) {
          return of(persisted.events);
        }
        return of([] as OddsEvent[]);
      }),
      shareReplay({ bufferSize: 1, refCount: true })
    );

    this.oddsByKeyCache.set(cacheKey, { expiresAt: now + this.oddsCacheTtlMs, stream });
    return stream;
  }

  private fetchEvents(sportKey: string, leagueKeys: string[]): Observable<OddsEvent[]> {
    const apiKey = this.apiKey;
    if (!apiKey) {
      return throwError(
        () =>
          new Error(
            'Missing SportsGameOdds API key. Set `oddsApiKey` in `src/app/shared/rapidapi.config.local.ts`.'
          )
      );
    }

    const params: Record<string, string> = {
      oddsAvailable: 'true',
      finalized: 'false',
    };

    if (leagueKeys.length) {
      params['leagueID'] = leagueKeys.join(',');
    }

    return this.http
      .get<SportsGameOddsResponse<SportsGameOddsEvent>>(`${this.apiBase}/events`, {
        headers: new HttpHeaders({ 'x-api-key': apiKey }),
        params,
      })
      .pipe(
        timeout(9000),
        map((res) => this.mapSportsGameOddsEvents(sportKey, res?.data ?? [])),
        catchError(() => of([] as OddsEvent[]))
      );
  }

  private mapSportsGameOddsEvents(sportKey: string, events: SportsGameOddsEvent[]): OddsEvent[] {
    return (events ?? [])
      .map((event) => this.mapSportsGameOddsEvent(sportKey, event))
      .filter(Boolean) as OddsEvent[];
  }

  private mapSportsGameOddsEvent(sportKey: string, event: SportsGameOddsEvent): OddsEvent | null {
    const homeTeam = event?.teams?.home?.names?.long ?? event?.teams?.home?.names?.short ?? '';
    const awayTeam = event?.teams?.away?.names?.long ?? event?.teams?.away?.names?.short ?? '';
    if (!homeTeam || !awayTeam) {
      return null;
    }

    const outcomes = this.mapMoneylineOutcomes(event?.odds ?? {}, homeTeam, awayTeam);
    if (!outcomes.length) {
      return null;
    }

    const commenceTime = event.startsAt ?? event.commenceTime ?? event.startTime ?? new Date().toISOString();
    const id = event.eventID ?? `${sportKey}:${awayTeam}-${homeTeam}:${commenceTime}`;

    return {
      id,
      sport_key: sportKey,
      sport_title: this.toTitle(sportKey),
      commence_time: commenceTime,
      home_team: homeTeam,
      away_team: awayTeam,
      bookmakers: [
        {
          key: 'sportsgameodds',
          title: 'SportsGameOdds',
          markets: [{ key: 'h2h', outcomes }],
        },
      ],
    };
  }

  private mapMoneylineOutcomes(
    oddsMap: Record<string, SportsGameOddsOdd>,
    homeTeam: string,
    awayTeam: string
  ): OddsOutcome[] {
    const odds = Object.values(oddsMap ?? {});
    if (!odds.length) {
      return [];
    }

    let home: number | undefined;
    let away: number | undefined;
    let draw: number | undefined;

    odds.forEach((entry) => {
      if ((entry?.betTypeID ?? '').toLowerCase() !== 'ml') {
        return;
      }

      const side = (entry?.sideID ?? '').toLowerCase();
      const price = this.extractDecimalPrice(entry);
      if (!price) {
        return;
      }

      if (side === 'home' && home === undefined) {
        home = price;
        return;
      }
      if (side === 'away' && away === undefined) {
        away = price;
        return;
      }
      if ((side === 'draw' || side === 'tie') && draw === undefined) {
        draw = price;
      }
    });

    const outcomes: OddsOutcome[] = [];
    if (home !== undefined) {
      outcomes.push({ name: '1', price: home });
    }
    if (draw !== undefined) {
      outcomes.push({ name: 'X', price: draw });
    }
    if (away !== undefined) {
      outcomes.push({ name: '2', price: away });
    }

    // Fallback if provider returns only team names without sideID labels.
    if (outcomes.length < 2) {
      const fallback = odds
        .filter((entry) => (entry?.betTypeID ?? '').toLowerCase() === 'ml')
        .map((entry) => this.extractDecimalPrice(entry))
        .filter((price): price is number => typeof price === 'number')
        .slice(0, 3);

      if (fallback.length >= 2) {
        return [
          { name: '1', price: fallback[0] },
          ...(fallback.length === 3 ? [{ name: 'X', price: fallback[1] }] : []),
          { name: '2', price: fallback[fallback.length - 1] },
        ];
      }
    }

    return outcomes;
  }

  private extractDecimalPrice(entry: SportsGameOddsOdd): number | undefined {
    const fromBookmaker = Object.values(entry?.byBookmaker ?? {}).find((b) => b && b.available !== false && b.odds !== undefined);
    const raw = fromBookmaker?.odds ?? entry?.fairOdds ?? entry?.odds;
    return this.toDecimalOdds(raw);
  }

  private toDecimalOdds(value: unknown): number | undefined {
    const numeric = typeof value === 'number' ? value : Number(`${value ?? ''}`.trim());
    if (!Number.isFinite(numeric)) {
      return undefined;
    }

    // American odds (+145 / -110) -> decimal
    if (Math.abs(numeric) >= 100) {
      const decimal = numeric > 0 ? 1 + numeric / 100 : 1 + 100 / Math.abs(numeric);
      return Math.round(decimal * 100) / 100;
    }

    if (numeric <= 1) {
      return undefined;
    }

    return Math.round(numeric * 100) / 100;
  }

  private deduplicateEvents(events: OddsEvent[]): OddsEvent[] {
    const mapById = new Map<string, OddsEvent>();
    events.forEach((event) => mapById.set(event.id, event));
    return Array.from(mapById.values());
  }

  private normalizeSportKey(value: string): string {
    const normalized = (value ?? '').toLowerCase();
    return normalized === 'football' ? 'soccer' : normalized;
  }

  private toSport(key: string, title: string): OddsSport {
    return {
      key,
      title,
      group: 'sportsgameodds',
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

  private readPersistedOdds(cacheKey: string): { fetchedAt: number; events: OddsEvent[] } | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }

    const raw = localStorage.getItem(`${this.oddsStoragePrefix}${cacheKey}`);
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as { fetchedAt?: number; events?: OddsEvent[] };
      if (!parsed || typeof parsed.fetchedAt !== 'number' || !Array.isArray(parsed.events)) {
        return null;
      }
      return { fetchedAt: parsed.fetchedAt, events: parsed.events };
    } catch {
      return null;
    }
  }

  private persistOdds(cacheKey: string, events: OddsEvent[]): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      localStorage.setItem(
        `${this.oddsStoragePrefix}${cacheKey}`,
        JSON.stringify({ fetchedAt: Date.now(), events })
      );
    } catch {
      // ignore quota errors
    }
  }
}
