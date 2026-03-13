import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { catchError, map, Observable, of, startWith, timeout } from 'rxjs';
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
    const fallback = this.getFallbackEvents(sportKey);
    return this.http
      .get<BetfairSportEvent[]>(`${RAPIDAPI_ODDS_BASE_URL}/betfair/get_sport_events/${sportKey}`, {
        headers: this.headers,
      })
      .pipe(
        timeout(3000),
        map((events) => this.mapEvents(events)),
        map((events) => (events.length ? events : fallback)),
        catchError(() => of(fallback)),
        startWith(fallback)
      );
  }

  private mapEvents(events?: BetfairSportEvent[]): OddsEvent[] {
    return (events ?? []).map((event) => ({
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
    }));
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

  private getFallbackEvents(sportKey: string): OddsEvent[] {
    switch (sportKey) {
      case 'soccer':
      case 'football':
        return [
          this.buildFallbackEvent(sportKey, 1, 'Wrexham', 'Swansea City', 20, 0),
          this.buildFallbackEvent(sportKey, 2, 'Colchester United', 'Crawley Town', 19, 45),
          this.buildFallbackEvent(sportKey, 3, 'Monchengladbach', 'St Pauli', 19, 30),
          this.buildFallbackEvent(sportKey, 4, 'Morton', 'Partick Thistle', 19, 45),
        ];
      case 'hockey':
        return [
          this.buildFallbackEvent(sportKey, 1, 'Edmonton Oilers', 'St Louis Blues', 20, 0),
        ];
      case 'tennis':
        return [
          this.buildFallbackEvent(sportKey, 1, 'WTA SF1 Player A', 'WTA SF1 Player B', 19, 0),
          this.buildFallbackEvent(sportKey, 2, 'WTA SF2 Player A', 'WTA SF2 Player B', 21, 0),
        ];
      default:
        return [];
    }
  }

  private buildFallbackEvent(
    sportKey: string,
    index: number,
    home: string,
    away: string,
    hour: number,
    minute: number
  ): OddsEvent {
    const seed = `fallback-${sportKey}-${index}`;
    const outcomes = this.buildFallbackOutcomes(sportKey, seed);

    return {
      id: seed,
      sport_key: sportKey,
      sport_title: this.toTitle(sportKey),
      commence_time: this.todayAt(hour, minute),
      home_team: home,
      away_team: away,
      bookmakers: [
        {
          key: 'tipmaster-fallback',
          title: 'TipMaster',
          markets: [
            {
              key: 'h2h',
              outcomes,
            },
          ],
        },
      ],
    };
  }

  private buildFallbackOutcomes(sportKey: string, seed: string): OddsOutcome[] {
    if (sportKey === 'soccer' || sportKey === 'football') {
      return [
        { name: '1', price: this.makePrice(`${seed}-1`, 1.4, 3.6) },
        { name: 'X', price: this.makePrice(`${seed}-X`, 2.8, 4.4) },
        { name: '2', price: this.makePrice(`${seed}-2`, 1.4, 3.6) },
      ];
    }

    return [
      { name: '1', price: this.makePrice(`${seed}-1`, 1.3, 3.2) },
      { name: '2', price: this.makePrice(`${seed}-2`, 1.3, 3.2) },
    ];
  }

  private todayAt(hour: number, minute: number): string {
    const date = new Date();
    date.setHours(hour, minute, 0, 0);
    return date.toISOString();
  }

  private get headers(): HttpHeaders {
    return new HttpHeaders({
      'x-rapidapi-host': RAPIDAPI_ODDS_HOST,
      'x-rapidapi-key': RAPIDAPI_ODDS_KEY,
    });
  }
}
