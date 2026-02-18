import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
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

@Injectable({ providedIn: 'root' })
export class OddsService {
  constructor(private readonly http: HttpClient) {}

  getSports(): Observable<OddsSport[]> {
    return this.http.get<OddsSport[]>(`${RAPIDAPI_ODDS_BASE_URL}/v4/sports`, {
      headers: this.headers,
    });
  }

  getOddsBySport(sportKey: string): Observable<OddsEvent[]> {
    const params = new HttpParams()
      .set('regions', 'eu')
      .set('markets', 'h2h')
      .set('oddsFormat', 'decimal')
      .set('dateFormat', 'iso');

    return this.http.get<OddsEvent[]>(`${RAPIDAPI_ODDS_BASE_URL}/v4/sports/${sportKey}/odds`, {
      headers: this.headers,
      params,
    });
  }

  private get headers(): HttpHeaders {
    return new HttpHeaders({
      'x-rapidapi-host': RAPIDAPI_ODDS_HOST,
      'x-rapidapi-key': RAPIDAPI_ODDS_KEY,
    });
  }
}
