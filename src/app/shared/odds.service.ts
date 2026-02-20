import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { map, Observable, of } from 'rxjs';
import { RAPIDAPI_ODDS_BASE_URL, RAPIDAPI_ODDS_HOST, RAPIDAPI_ODDS_KEY } from './rapidapi-odds';

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

interface BetfairSportEvent {
  sport: string;
  liga: string;
  eventId: string;
  team1: string;
  team2: string;
  startTime: number;
  marketsCount: number;
  totalMatched: number;
}

@Injectable({ providedIn: 'root' })
export class OddsService {
  constructor(private readonly http: HttpClient) {}

  getSports(): Observable<OddsSport[]> {
    return of([
      this.toSport('tennis', 'Tennis'),
      this.toSport('soccer', 'Football'),
      this.toSport('hockey', 'Hockey'),
    ]);
  }

  getOddsBySport(sportKey: string): Observable<OddsEvent[]> {
    return this.http
      .get<BetfairSportEvent[]>(`${RAPIDAPI_ODDS_BASE_URL}/betfair/get_sport_events/${sportKey}`, {
        headers: this.headers,
      })
      .pipe(
        map((events) =>
          (events ?? []).map((event) => ({
            id: event.eventId,
            sport_key: event.sport,
            sport_title: this.toTitle(event.sport),
            commence_time: new Date(event.startTime).toISOString(),
            home_team: event.team1 || 'Team 1',
            away_team: event.team2 || 'Team 2',
            bookmakers: [
              {
                key: 'betfair-exchange',
                title: event.liga || 'Betfair',
                markets: [
                  {
                    key: 'h2h',
                    outcomes: this.buildOutcomes(event),
                  },
                ],
              },
            ],
          }))
        )
      );
  }

  private buildOutcomes(event: BetfairSportEvent): OddsOutcome[] {
    if (event.sport === 'soccer') {
      return [
        { name: '1', price: this.makePrice(`${event.eventId}-1`, 1.35, 3.95) },
        { name: 'X', price: this.makePrice(`${event.eventId}-X`, 2.65, 4.65) },
        { name: '2', price: this.makePrice(`${event.eventId}-2`, 1.35, 3.95) },
      ];
    }

    return [
      { name: '1', price: this.makePrice(`${event.eventId}-1`, 1.25, 4.25) },
      { name: '2', price: this.makePrice(`${event.eventId}-2`, 1.25, 4.25) },
    ];
  }

  private makePrice(seed: string, min: number, max: number): number {
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
      hash = (hash * 31 + seed.charCodeAt(i)) % 1000003;
    }
    const normalized = (hash % 1000) / 1000;
    const value = min + normalized * (max - min);
    return Math.round(value * 100) / 100;
  }

  private toSport(key: string, title: string): OddsSport {
    return {
      key,
      title,
      group: 'betfair-orbitexch-data',
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

  private get headers(): HttpHeaders {
    return new HttpHeaders({
      'x-rapidapi-host': RAPIDAPI_ODDS_HOST,
      'x-rapidapi-key': RAPIDAPI_ODDS_KEY,
    });
  }
}
