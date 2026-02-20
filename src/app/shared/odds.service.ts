import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { forkJoin, map, Observable } from 'rxjs';
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

interface CompetitionResponse {
  competitions: Array<{
    sport: string;
  }>;
}

interface AdvantageParticipant {
  key: string;
  name: string;
  sport: string;
}

interface AdvantageEvent {
  key: string;
  startTime: string;
  homeParticipantKey?: string | null;
  participants?: AdvantageParticipant[];
}

interface Advantage {
  market?: {
    type: string;
    event?: AdvantageEvent;
  };
  outcomes?: Array<{
    payout: number;
    source: string;
    participantKey?: string | null;
    participant?: {
      name: string;
    } | null;
  }>;
}

interface AdvantageResponse {
  advantages: Advantage[];
}

@Injectable({ providedIn: 'root' })
export class OddsService {
  constructor(private readonly http: HttpClient) {}

  getSports(): Observable<OddsSport[]> {
    return this.http
      .get<CompetitionResponse>(`${RAPIDAPI_ODDS_BASE_URL}/v0/competitions/`, {
        headers: this.headers,
      })
      .pipe(
        map((response) => {
          const bySport = new Map<string, OddsSport>();

          for (const competition of response.competitions ?? []) {
            if (!bySport.has(competition.sport)) {
              bySport.set(competition.sport, {
                key: competition.sport,
                title: competition.sport.replace(/_/g, ' '),
                group: 'sportsbook-api',
                active: true,
                has_outrights: true,
              });
            }
          }

          return [...bySport.values()];
        })
      );
  }

  getOddsBySport(sportKey: string): Observable<OddsEvent[]> {
    const arbitrageParams = new HttpParams().set('type', 'ARBITRAGE');
    const middleParams = new HttpParams().set('type', 'MIDDLE');

    return forkJoin([
      this.http.get<AdvantageResponse>(`${RAPIDAPI_ODDS_BASE_URL}/v0/advantages/`, {
        headers: this.headers,
        params: arbitrageParams,
      }),
      this.http.get<AdvantageResponse>(`${RAPIDAPI_ODDS_BASE_URL}/v0/advantages/`, {
        headers: this.headers,
        params: middleParams,
      }),
    ])
      .pipe(
        map(([arbitrageResponse, middleResponse]) => {
          const allAdvantages = [
            ...(arbitrageResponse.advantages ?? []),
            ...(middleResponse.advantages ?? []),
          ];
          const grouped = new Map<string, OddsEvent>();

          for (const advantage of allAdvantages) {
            const event = advantage.market?.event;
            if (!event?.key) {
              continue;
            }

            const eventSportKey = event.participants?.[0]?.sport ?? 'UNKNOWN';
            if (eventSportKey !== sportKey) {
              continue;
            }

            const outcomes = (advantage.outcomes ?? []).map((outcome) => ({
              name:
                outcome.participant?.name ??
                this.findParticipantName(event, outcome.participantKey) ??
                'Unknown',
              price: outcome.payout,
            }));

            if (outcomes.length === 0) {
              continue;
            }

            const homeTeam =
              this.findParticipantName(event, event.homeParticipantKey) ??
              event.participants?.[0]?.name ??
              'Home';
            const awayTeam =
              event.participants?.find((participant) => participant.key !== event.homeParticipantKey)
                ?.name ??
              event.participants?.[1]?.name ??
              'Away';

            const bookmakerSource = advantage.outcomes?.[0]?.source ?? 'UNKNOWN';
            const bookmakerKey = bookmakerSource.toLowerCase();
            const bookmakerTitle = bookmakerSource.replace(/_/g, ' ');
            const marketKey = advantage.market?.type?.toLowerCase() ?? 'h2h';

            const bookmaker: OddsBookmaker = {
              key: bookmakerKey,
              title: bookmakerTitle,
              markets: [{ key: marketKey, outcomes: outcomes.slice(0, 3) }],
            };

            const existing = grouped.get(event.key);
            if (!existing) {
              grouped.set(event.key, {
                id: event.key,
                sport_key: eventSportKey,
                sport_title: eventSportKey.replace(/_/g, ' '),
                commence_time: event.startTime,
                home_team: homeTeam,
                away_team: awayTeam,
                bookmakers: [bookmaker],
              });
              continue;
            }

            if (!existing.bookmakers.some((b) => b.key === bookmaker.key)) {
              existing.bookmakers.push(bookmaker);
            }
          }

          return [...grouped.values()].sort((a, b) => a.commence_time.localeCompare(b.commence_time));
        })
      );
  }

  private get headers(): HttpHeaders {
    return new HttpHeaders({
      'x-rapidapi-host': RAPIDAPI_ODDS_HOST,
      'x-rapidapi-key': RAPIDAPI_ODDS_KEY,
    });
  }

  private findParticipantName(
    event: AdvantageEvent | undefined,
    participantKey: string | null | undefined
  ): string | undefined {
    if (!participantKey) {
      return undefined;
    }
    return event?.participants?.find((participant) => participant.key === participantKey)?.name;
  }
}
