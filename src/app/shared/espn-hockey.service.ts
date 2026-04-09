import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, forkJoin, map, Observable, of, switchMap, throwError, timeout } from 'rxjs';

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
  odds: HockeyOddsOutcome[];
}

export interface HockeyOddsOutcome {
  name: string;
  price: number;
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

export interface HockeyRosterPlayer {
  id?: string;
  name: string;
  position?: string;
  jersey?: string;
}

export interface HockeyTeamStat {
  name: string;
  home?: string;
  away?: string;
}

export interface HockeyPlayerStatLine {
  athleteId?: string;
  name: string;
  position?: string;
  jersey?: string;
  values: Record<string, string>;
}

export interface HockeyPlayerStatCategory {
  name: string;
  columns: string[];
  athletes: HockeyPlayerStatLine[];
}

export interface HockeyPlayerStatsTeam {
  teamId?: string;
  teamName: string;
  categories: HockeyPlayerStatCategory[];
}

export interface HockeyOfficial {
  name: string;
  role?: string;
}

export interface HockeyMatchSummary {
  eventId: string;
  date?: string;
  status?: string;
  detail?: string;
  venue?: string;
  homeTeam?: string;
  awayTeam?: string;
  homeScore?: number;
  awayScore?: number;
  teamStats: HockeyTeamStat[];
  playerStats: HockeyPlayerStatsTeam[];
  officials: HockeyOfficial[];
  source?: 'summary' | 'scoreboard';
  raw: unknown;
}

export interface HockeyMatchExtras {
  homeTeamDetail: HockeyTeamDetail | null;
  awayTeamDetail: HockeyTeamDetail | null;
  homeRoster: HockeyRosterPlayer[];
  awayRoster: HockeyRosterPlayer[];
  h2h: HockeyGame[];
}

const ESPN_HOCKEY_BASE_URL = 'https://site.api.espn.com/apis/site/v2/sports/hockey';
const DEFAULT_HOCKEY_TEAM_RATING = 74;
const HOCKEY_HOME_ADVANTAGE = 4;
const HOCKEY_BOOK_MARGIN = 1.06;

const HOCKEY_LEAGUE_BASE_RATINGS: Record<string, number> = {
  nhl: 84,
  'mens-college-hockey': 69,
  'womens-college-hockey': 67,
  'hockey-world-cup': 86,
  'olympics-mens-ice-hockey': 84,
  'olympics-womens-ice-hockey': 80,
};

const HOCKEY_TEAM_RATINGS: Record<string, number> = {
  'colorado avalanche': 96,
  'dallas stars': 95,
  'carolina hurricanes': 93,
  'buffalo sabres': 91,
  'minnesota wild': 90,
  'tampa bay lightning': 89,
  'montreal canadiens': 88,
  'pittsburgh penguins': 87,
  'detroit red wings': 86,
  'new york islanders': 85,
  'boston bruins': 84,
  'anaheim ducks': 84,
  'columbus blue jackets': 83,
  'ottawa senators': 82,
  'vegas golden knights': 82,
  'utah mammoth': 81,
  'utah hockey club': 81,
  'edmonton oilers': 80,
  'florida panthers': 80,
  'toronto maple leafs': 79,
  'new jersey devils': 79,
  'washington capitals': 78,
  'new york rangers': 78,
  'winnipeg jets': 78,
  'vancouver canucks': 77,
  'los angeles kings': 77,
  'philadelphia flyers': 76,
  'seattle kraken': 75,
  'st louis blues': 75,
  'nashville predators': 74,
  'calgary flames': 73,
  'san jose sharks': 66,
  'chicago blackhawks': 69,
};

@Injectable({ providedIn: 'root' })
export class EspnHockeyService {
  constructor(private readonly http: HttpClient) {}

  private isLocalDev(): boolean {
    if (typeof location === 'undefined') {
      return false;
    }

    const host = location.hostname;
    return host === 'localhost' || host === '127.0.0.1' || location.port === '4200';
  }

  private summaryUrl(league: string, eventId: string): string {
    const safeLeague = encodeURIComponent(league?.trim() || 'nhl');
    const safeEvent = encodeURIComponent(eventId);

    if (this.isLocalDev()) {
      // Local dev proxy: /espn -> https://site.api.espn.com
      return `/espn/apis/site/v2/sports/hockey/${safeLeague}/summary?event=${safeEvent}`;
    }

    // Direct URL (may be blocked by CORS on some environments; we handle fallback below).
    return `${ESPN_HOCKEY_BASE_URL}/${safeLeague}/summary?event=${safeEvent}`;
  }

  getScoreboard(league: string): Observable<HockeyGame[]> {
    const dates = this.buildScoreboardDates();
    const requests = dates.map((date) =>
      this.http.get<any>(`${this.leagueBaseUrl(league)}/scoreboard?dates=${date}`)
    );

    return forkJoin(requests).pipe(
      map((responses) => responses.flatMap((data) => this.mapScoreboard(data, league))),
      map((games) => this.deduplicateGames(games)),
      map((games) => this.sortGames(games))
    );
  }

  getNews(league: string): Observable<HockeyNewsItem[]> {
    return this.http.get<any>(`${this.leagueBaseUrl(league)}/news`).pipe(
      map((data) => this.mapNews(data))
    );
  }

  getTeams(league: string): Observable<HockeyTeam[]> {
    return this.http.get<any>(`${this.leagueBaseUrl(league)}/teams`).pipe(
      map((data) => this.mapTeams(data))
    );
  }

  getTeam(league: string, teamId: string): Observable<HockeyTeamDetail | null> {
    return this.http.get<any>(`${this.leagueBaseUrl(league)}/teams/${teamId}`).pipe(
      map((data) => this.mapTeamDetail(data))
    );
  }

  getTeamRoster(league: string, teamId: string): Observable<HockeyRosterPlayer[]> {
    return this.http.get<any>(`${this.leagueBaseUrl(league)}/teams/${encodeURIComponent(teamId)}/roster`).pipe(
      timeout(12000),
      map((data) => this.mapRoster(data)),
      catchError(() => of([]))
    );
  }

  getTeamSchedule(league: string, teamId: string): Observable<HockeyGame[]> {
    return this.http.get<any>(`${this.leagueBaseUrl(league)}/teams/${encodeURIComponent(teamId)}/schedule`).pipe(
      timeout(12000),
      map((data) => this.mapScheduleAsGames(data, league)),
      catchError(() => of([]))
    );
  }

  getMatchExtras(league: string, homeTeamName: string, awayTeamName: string): Observable<HockeyMatchExtras> {
    const empty: HockeyMatchExtras = {
      homeTeamDetail: null,
      awayTeamDetail: null,
      homeRoster: [],
      awayRoster: [],
      h2h: [],
    };

    const safeHome = (homeTeamName ?? '').trim();
    const safeAway = (awayTeamName ?? '').trim();
    if (!safeHome || !safeAway) {
      return of(empty);
    }

    return this.getTeams(league).pipe(
      switchMap((teams) => {
        const homeTeam = this.findTeamByName(teams, safeHome);
        const awayTeam = this.findTeamByName(teams, safeAway);
        if (!homeTeam?.id || !awayTeam?.id) {
          return of(empty);
        }

        return forkJoin({
          homeDetail: this.getTeam(league, homeTeam.id).pipe(catchError(() => of(null))),
          awayDetail: this.getTeam(league, awayTeam.id).pipe(catchError(() => of(null))),
          homeRoster: this.getTeamRoster(league, homeTeam.id),
          awayRoster: this.getTeamRoster(league, awayTeam.id),
          homeSchedule: this.getTeamSchedule(league, homeTeam.id),
          awaySchedule: this.getTeamSchedule(league, awayTeam.id),
        }).pipe(
          map(({ homeDetail, awayDetail, homeRoster, awayRoster, homeSchedule, awaySchedule }) => {
            const h2h = this.buildH2H(homeSchedule, awaySchedule, safeHome, safeAway).slice(0, 10);
            return {
              homeTeamDetail: homeDetail,
              awayTeamDetail: awayDetail,
              homeRoster: this.limitRoster(homeRoster),
              awayRoster: this.limitRoster(awayRoster),
              h2h,
            } satisfies HockeyMatchExtras;
          })
        );
      }),
      catchError(() => of(empty))
    );
  }

  getMatchSummary(league: string, eventId: string): Observable<HockeyMatchSummary | null> {
    const summaryUrl = this.summaryUrl(league, eventId);

    return this.http.get<any>(summaryUrl).pipe(
      timeout(12000),
      map((data) => {
        const summary = this.mapMatchSummary(eventId, data);
        if (summary) {
          summary.source = 'summary';
        }
        return summary;
      }),
      catchError((err) => {
        const status = typeof err?.status === 'number' ? err.status : undefined;
        const url = err?.url ?? summaryUrl;
        const message = err?.error?.message ?? err?.message ?? 'Request failed.';
        const details = `${status === undefined ? 'status=?' : `status=${status}`} url=${url}`;

        // Common CORS error in browsers comes as status=0. On Hosting/Spark we can't proxy, so fallback to scoreboard.
        if (status === 0 || status === 401 || status === 403) {
          return this.getBasicSummaryFromScoreboard(league, eventId);
        }

        return throwError(() => new Error(`ESPN hockey summary failed (${details}): ${message}`));
      })
    );
  }

  private getBasicSummaryFromScoreboard(league: string, eventId: string): Observable<HockeyMatchSummary | null> {
    return this.getScoreboard(league).pipe(
      map((games) => games.find((g) => g.id === eventId) ?? null),
      switchMap((game) => {
        if (!game) {
          return of(null);
        }

        const summary: HockeyMatchSummary = {
          eventId,
          date: game.date,
          status: game.status,
          detail: game.detail,
          venue: game.venue,
          homeTeam: game.homeTeam,
          awayTeam: game.awayTeam,
          homeScore: game.homeScore,
          awayScore: game.awayScore,
          teamStats: [],
          playerStats: [],
          officials: [],
          source: 'scoreboard',
          raw: game,
        };

        return of(summary);
      })
    );
  }

  private mapScoreboard(data: any, league: string): HockeyGame[] {
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
      const homeTeam = home?.team?.displayName ?? home?.team?.shortDisplayName ?? 'Home';
      const awayTeam = away?.team?.displayName ?? away?.team?.shortDisplayName ?? 'Away';

      return {
        id: event?.id ?? competition?.id ?? `${home?.team?.id ?? 'home'}-${away?.team?.id ?? 'away'}`,
        date: event?.date ?? competition?.date ?? new Date().toISOString(),
        status: displayStatus,
        detail: status,
        homeTeam,
        awayTeam,
        homeScore: this.toScore(home?.score),
        awayScore: this.toScore(away?.score),
        venue,
        odds: this.buildGameOdds(homeTeam, awayTeam, league),
      };
    });
  }

  private buildGameOdds(homeTeam: string, awayTeam: string, league: string): HockeyOddsOutcome[] {
    const leagueBase = HOCKEY_LEAGUE_BASE_RATINGS[league] ?? DEFAULT_HOCKEY_TEAM_RATING;
    const homeRating = this.resolveTeamRating(homeTeam, leagueBase) + HOCKEY_HOME_ADVANTAGE;
    const awayRating = this.resolveTeamRating(awayTeam, leagueBase);
    const ratingDiff = homeRating - awayRating;
    const drawProbability = this.clamp(
      0.29 - Math.abs(ratingDiff) * 0.002,
      0.24,
      0.29
    );
    const remainder = 1 - drawProbability;
    const homeShare = 1 / (1 + Math.exp(-ratingDiff / 14));
    const rawHomeProbability = remainder * homeShare;
    const rawAwayProbability = remainder - rawHomeProbability;
    const homeProbability = this.clamp(
      rawHomeProbability,
      0.2,
      0.58
    );
    const awayProbability = this.clamp(
      rawAwayProbability,
      0.2,
      0.58
    );

    return [
      { name: '1', price: this.toDecimalOdds(homeProbability) },
      { name: 'X', price: this.toDecimalOdds(drawProbability) },
      { name: '2', price: this.toDecimalOdds(awayProbability) },
    ];
  }

  private resolveTeamRating(teamName: string, leagueBase: number): number {
    const normalized = this.normalizeName(teamName);
    return HOCKEY_TEAM_RATINGS[normalized] ?? leagueBase;
  }

  private normalizeName(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private toDecimalOdds(probability: number): number {
    const safeProbability = this.clamp(probability, 0.2, 0.58);
    const rawOdds = 1 / (safeProbability * HOCKEY_BOOK_MARGIN);
    return Math.round(this.clamp(rawOdds, 1.62, 3.5) * 100) / 100;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private buildScoreboardDates(): string[] {
    const today = new Date();
    const dates: Date[] = [];

    // Include upcoming fixtures as well as recent games.
    for (let offset = -1; offset <= 5; offset += 1) {
      const date = new Date(today);
      date.setDate(today.getDate() + offset);
      dates.push(date);
    }

    return dates.map((date) => this.toEspnDate(date));
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

  private mapMatchSummary(eventId: string, data: any): HockeyMatchSummary | null {
    if (!data || typeof data !== 'object') {
      return null;
    }

    const headerCompetition = data?.header?.competitions?.[0];
    const headerCompetitors = headerCompetition?.competitors ?? [];
    const home = headerCompetitors.find((c: any) => c?.homeAway === 'home') ?? headerCompetitors[0] ?? {};
    const away = headerCompetitors.find((c: any) => c?.homeAway === 'away') ?? headerCompetitors[1] ?? {};

    const statusType = headerCompetition?.status?.type ?? data?.header?.competitions?.[0]?.status?.type ?? {};
    const detail = statusType?.shortDetail ?? statusType?.detail ?? statusType?.description;
    const status = statusType?.name ?? detail ?? 'Game';

    const venue =
      headerCompetition?.venue?.fullName ??
      headerCompetition?.venue?.name ??
      data?.gameInfo?.venue?.fullName ??
      data?.gameInfo?.venue?.name;

    const date = headerCompetition?.date ?? headerCompetition?.startDate ?? data?.header?.date;

    return {
      eventId,
      date,
      status,
      detail,
      venue,
      homeTeam: home?.team?.displayName ?? home?.team?.name,
      awayTeam: away?.team?.displayName ?? away?.team?.name,
      homeScore: this.toScore(home?.score),
      awayScore: this.toScore(away?.score),
      teamStats: this.extractTeamStats(data, home, away),
      playerStats: this.extractPlayerStats(data),
      officials: this.extractOfficials(data),
      raw: data,
    };
  }

  private extractTeamStats(data: any, homeHeader: any, awayHeader: any): HockeyTeamStat[] {
    const teams = data?.boxscore?.teams;
    if (!Array.isArray(teams) || teams.length < 2) {
      return [];
    }

    const homeId = homeHeader?.team?.id?.toString?.();
    const awayId = awayHeader?.team?.id?.toString?.();

    const homeBucket = teams.find((t: any) => t?.team?.id?.toString?.() === homeId) ?? teams[0];
    const awayBucket = teams.find((t: any) => t?.team?.id?.toString?.() === awayId) ?? teams[1];

    const homeStats = Array.isArray(homeBucket?.statistics) ? homeBucket.statistics : [];
    const awayStats = Array.isArray(awayBucket?.statistics) ? awayBucket.statistics : [];

    const byName = new Map<string, HockeyTeamStat>();

    for (const stat of homeStats) {
      const name = stat?.name ?? stat?.label ?? stat?.abbreviation ?? stat?.displayName;
      const value = stat?.displayValue ?? stat?.value ?? stat?.display ?? stat?.summary;
      if (!name) continue;
      byName.set(String(name), { name: String(name), home: value !== undefined ? String(value) : undefined });
    }

    for (const stat of awayStats) {
      const name = stat?.name ?? stat?.label ?? stat?.abbreviation ?? stat?.displayName;
      const value = stat?.displayValue ?? stat?.value ?? stat?.display ?? stat?.summary;
      if (!name) continue;
      const existing = byName.get(String(name));
      if (existing) {
        existing.away = value !== undefined ? String(value) : undefined;
      } else {
        byName.set(String(name), { name: String(name), away: value !== undefined ? String(value) : undefined });
      }
    }

    return Array.from(byName.values());
  }

  private extractPlayerStats(data: any): HockeyPlayerStatsTeam[] {
    const box = data?.boxscore ?? data?.gamepackageJSON?.boxscore ?? null;
    const players = box?.players;
    if (!Array.isArray(players) || !players.length) {
      return [];
    }

    return players
      .map((teamBucket: any) => {
        const team = teamBucket?.team ?? teamBucket?.competitor?.team ?? {};
        const teamId = team?.id?.toString?.();
        const teamName = team?.displayName ?? team?.name ?? 'Team';

        const statistics = Array.isArray(teamBucket?.statistics) ? teamBucket.statistics : [];
        const categories: HockeyPlayerStatCategory[] = statistics
          .map((category: any) => this.mapPlayerStatCategory(category))
          .filter(Boolean) as HockeyPlayerStatCategory[];

        return {
          teamId,
          teamName,
          categories,
        } satisfies HockeyPlayerStatsTeam;
      })
      .filter((t: HockeyPlayerStatsTeam) => t.categories.length);
  }

  private mapPlayerStatCategory(category: any): HockeyPlayerStatCategory | null {
    if (!category || typeof category !== 'object') {
      return null;
    }

    const name = category?.name ?? category?.label ?? category?.displayName ?? 'Stats';
    const columns: string[] =
      (Array.isArray(category?.labels) ? category.labels : null) ??
      (Array.isArray(category?.keys) ? category.keys : null) ??
      [];

    const athletes = Array.isArray(category?.athletes) ? category.athletes : [];
    const mappedAthletes: HockeyPlayerStatLine[] = athletes
      .map((row: any) => this.mapPlayerStatLine(row, columns))
      .filter(Boolean) as HockeyPlayerStatLine[];

    if (!mappedAthletes.length) {
      return null;
    }

    const finalColumns = columns.length ? columns.map((c) => String(c)) : this.inferColumns(mappedAthletes);
    return { name: String(name), columns: finalColumns, athletes: mappedAthletes };
  }

  private mapPlayerStatLine(row: any, columns: string[]): HockeyPlayerStatLine | null {
    if (!row || typeof row !== 'object') {
      return null;
    }

    const athlete = row?.athlete ?? row?.player ?? row;
    const name = athlete?.displayName ?? athlete?.shortName ?? athlete?.fullName ?? row?.displayName ?? row?.name;
    if (!name) {
      return null;
    }

    const athleteId = athlete?.id?.toString?.();
    const position = row?.position?.abbreviation ?? row?.position?.displayName ?? athlete?.position?.abbreviation ?? athlete?.position?.name;
    const jersey = row?.jersey?.toString?.() ?? athlete?.jersey?.toString?.();

    const statsArray = Array.isArray(row?.stats) ? row.stats : Array.isArray(row?.statistics) ? row.statistics : [];
    const values: Record<string, string> = {};

    if (columns.length && statsArray.length) {
      columns.forEach((col, idx) => {
        const val = statsArray[idx];
        if (val === undefined || val === null) return;
        values[String(col)] = String(val);
      });
    } else if (Array.isArray(statsArray) && statsArray.length) {
      statsArray.forEach((val: any, idx: number) => {
        if (val === undefined || val === null) return;
        values[`#${idx + 1}`] = String(val);
      });
    }

    return { athleteId, name: String(name), position: position ? String(position) : undefined, jersey: jersey ? String(jersey) : undefined, values };
  }

  private inferColumns(rows: HockeyPlayerStatLine[]): string[] {
    const set = new Set<string>();
    for (const row of rows) {
      Object.keys(row.values).forEach((k) => set.add(k));
    }
    return Array.from(set);
  }

  private extractOfficials(data: any): HockeyOfficial[] {
    const officials = data?.gameInfo?.officials ?? data?.officials ?? [];
    if (!Array.isArray(officials)) {
      return [];
    }

    return officials
      .map((o: any) => {
        const name = o?.fullName ?? o?.displayName ?? o?.name;
        if (!name) return null;
        const role = o?.position?.name ?? o?.role ?? o?.type;
        return { name: String(name), role: role ? String(role) : undefined } satisfies HockeyOfficial;
      })
      .filter(Boolean) as HockeyOfficial[];
  }

  private toScore(value: any): number | undefined {
    if (value === null || value === undefined || value === '') {
      return undefined;
    }
    const parsed = Number(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  private leagueBaseUrl(league: string): string {
    const safeLeague = league?.trim() || 'nhl';
    return `${ESPN_HOCKEY_BASE_URL}/${encodeURIComponent(safeLeague)}`;
  }

  private mapRoster(data: any): HockeyRosterPlayer[] {
    const athletes = Array.isArray(data?.athletes)
      ? data.athletes
      : Array.isArray(data?.athletes?.[0]?.items)
        ? data.athletes[0].items
        : Array.isArray(data?.items)
          ? data.items
          : [];

    return athletes
      .map((row: any) => {
        const athlete = row?.athlete ?? row;
        const name = athlete?.displayName ?? athlete?.fullName ?? athlete?.shortName ?? row?.name;
        if (!name) return null;

        const jersey = athlete?.jersey?.toString?.() ?? row?.jersey?.toString?.();
        const position =
          athlete?.position?.abbreviation ??
          athlete?.position?.name ??
          row?.position?.abbreviation ??
          row?.position?.name;

        const id = athlete?.id?.toString?.();
        return {
          id,
          name: String(name),
          jersey: jersey ? String(jersey) : undefined,
          position: position ? String(position) : undefined,
        } satisfies HockeyRosterPlayer;
      })
      .filter(Boolean) as HockeyRosterPlayer[];
  }

  private mapScheduleAsGames(data: any, league: string): HockeyGame[] {
    const events =
      (Array.isArray(data?.events) ? data.events : null) ??
      (Array.isArray(data?.items) ? data.items : null) ??
      (Array.isArray(data?.schedule) ? data.schedule : null) ??
      [];

    if (!Array.isArray(events) || !events.length) {
      // Some schedule responses nest the events deeper.
      const nested =
        data?.events?.[0]?.events ??
        data?.schedule?.[0]?.events ??
        data?.leagues?.[0]?.events ??
        [];
      if (Array.isArray(nested) && nested.length) {
        return this.mapScoreboard({ events: nested }, league);
      }

      return [];
    }

    return this.mapScoreboard({ events }, league);
  }

  private findTeamByName(teams: HockeyTeam[], name: string): HockeyTeam | null {
    const needle = this.normalizeName(name);
    if (!needle) return null;

    const exact = teams.find((t) => this.normalizeName(t.name) === needle);
    if (exact) return exact;

    const contains = teams.find((t) => this.normalizeName(t.name).includes(needle) || needle.includes(this.normalizeName(t.name)));
    return contains ?? null;
  }

  private isPlayedGame(game: HockeyGame): boolean {
    if (game.homeScore !== undefined || game.awayScore !== undefined) {
      return true;
    }

    const normalized = `${game.status} ${game.detail}`.toLowerCase();
    return normalized.includes('final') || normalized.includes('post');
  }

  private buildH2H(homeSchedule: HockeyGame[], awaySchedule: HockeyGame[], homeTeam: string, awayTeam: string): HockeyGame[] {
    const homeNeedle = this.normalizeName(homeTeam);
    const awayNeedle = this.normalizeName(awayTeam);

    const all = [...homeSchedule, ...awaySchedule];
    const unique = this.deduplicateGames(all);

    const meetings = unique.filter((g) => {
      const home = this.normalizeName(g.homeTeam);
      const away = this.normalizeName(g.awayTeam);
      return (home === homeNeedle && away === awayNeedle) || (home === awayNeedle && away === homeNeedle);
    });

    return meetings
      .filter((g) => this.isPlayedGame(g))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  private limitRoster(players: HockeyRosterPlayer[]): HockeyRosterPlayer[] {
    // Keep the UI responsive; rosters can be large.
    return Array.isArray(players) ? players.slice(0, 40) : [];
  }
}
