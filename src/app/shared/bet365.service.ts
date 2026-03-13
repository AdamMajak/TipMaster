import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { map, Observable, shareReplay, timeout } from 'rxjs';
import { RAPIDAPI_ODDS_KEY } from './rapidapi-odds';
import { RAPIDAPI_BET365_BASE_URL, RAPIDAPI_BET365_HOST } from './rapidapi-bet365';

export interface Bet365League {
  id: string;
  name: string;
  sport?: string;
}

@Injectable({ providedIn: 'root' })
export class Bet365Service {
  private leagues$?: Observable<Bet365League[]>;

  constructor(private readonly http: HttpClient) {}

  getLeagues(forceRefresh = false): Observable<Bet365League[]> {
    if (forceRefresh) {
      this.leagues$ = undefined;
    }

    if (!this.leagues$) {
      this.leagues$ = this.http
        .get<unknown>(`${RAPIDAPI_BET365_BASE_URL}/bet365/get_leagues`, { headers: this.headers })
        .pipe(
          timeout(4000),
          map((value) => this.parseLeagues(value)),
          shareReplay({ bufferSize: 1, refCount: true })
        );
    }

    return this.leagues$;
  }

  private parseLeagues(value: unknown): Bet365League[] {
    const fromMap = this.parseSportMap(value);
    if (fromMap.length) {
      return fromMap;
    }

    const list = this.pickArray(value);
    return list.map((item, index) => this.parseLeagueItem(item, index)).filter(Boolean) as Bet365League[];
  }

  private parseSportMap(value: unknown): Bet365League[] {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return [];
    }

    const record = value as Record<string, unknown>;
    const entries = Object.entries(record);
    if (!entries.length) {
      return [];
    }

    // Shape: { soccer: ["Premier League", ...], tennis: ["ATP ...", ...], ... }
    const looksLikeSportMap = entries.some(([, v]) => Array.isArray(v));
    if (!looksLikeSportMap) {
      return [];
    }

    const leagues: Bet365League[] = [];
    for (const [sportKey, v] of entries) {
      if (!Array.isArray(v)) continue;
      const sport = sportKey;
      v.forEach((item, index) => {
        if (typeof item !== 'string') return;
        const name = item.trim();
        if (!name) return;
        leagues.push({
          id: `${sport}:${index}`,
          name,
          sport,
        });
      });
    }

    return leagues;
  }

  private pickArray(value: unknown): unknown[] {
    if (Array.isArray(value)) {
      return value;
    }
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const candidates: unknown[] = [
        record,
        record['results'],
        record['data'],
        record['leagues'],
        record['response'],
        record['result'],
      ];

      const arrays: unknown[] = [];
      for (const candidate of candidates) {
        if (Array.isArray(candidate)) {
          arrays.push(...candidate);
          continue;
        }
        if (candidate && typeof candidate === 'object') {
          for (const nested of Object.values(candidate as Record<string, unknown>)) {
            if (Array.isArray(nested)) {
              arrays.push(...nested);
            }
          }
        }
      }

      if (arrays.length) {
        return arrays;
      }
    }
    return [];
  }

  private parseLeagueItem(item: unknown, index: number): Bet365League | null {
    if (typeof item === 'string') {
      const trimmed = item.trim();
      if (!trimmed) {
        return null;
      }
      return { id: `${index}`, name: trimmed };
    }

    if (!item || typeof item !== 'object') {
      return null;
    }

    const record = item as Record<string, unknown>;
    const id =
      this.toString(
        record['id'] ??
          record['league_id'] ??
          record['leagueId'] ??
          record['key'] ??
          record['value']
      ) ?? `${index}`;
    const name =
      this.toString(
        record['name'] ??
          record['league_name'] ??
          record['league'] ??
          record['title'] ??
          record['liga']
      ) ??
      `League ${index + 1}`;
    const sport = this.toString(
      record['sport'] ?? record['sport_name'] ?? record['sportName'] ?? record['sport_key']
    );

    return { id, name, sport };
  }

  private toString(value: unknown): string | undefined {
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
    return undefined;
  }

  private get headers(): HttpHeaders {
    return new HttpHeaders({
      'x-rapidapi-host': RAPIDAPI_BET365_HOST,
      'x-rapidapi-key': RAPIDAPI_ODDS_KEY,
      'content-type': 'application/json',
    });
  }
}
