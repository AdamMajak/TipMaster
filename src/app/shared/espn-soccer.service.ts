import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, forkJoin, map, Observable, of, switchMap, throwError, timeout } from 'rxjs';
import { OddsEvent, OddsService } from './odds.service';
import { SPORT_KEYS } from './rapidapi-odds';

export interface SoccerGame {
  id: string;
  date: string;
  status: string;
  detail: string;
  state?: string;
  completed?: boolean;
  homeTeam: string;
  awayTeam: string;
  homeScore?: number;
  awayScore?: number;
  venue?: string;
  odds: SoccerOddsOutcome[];
}

export interface SoccerOddsOutcome {
  name: string;
  price: number;
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

export interface SoccerRosterPlayer {
  id?: string;
  name: string;
  position?: string;
  jersey?: string;
}

export interface SoccerLineupPlayer {
  id?: string;
  name: string;
  position?: string;
  jersey?: string;
  starter?: boolean;
}

export interface SoccerLineupTeam {
  teamId?: string;
  teamName: string;
  formation?: string;
  starters: SoccerLineupPlayer[];
  substitutes: SoccerLineupPlayer[];
}

export interface SoccerTeamStat {
  name: string;
  home?: string;
  away?: string;
}

export interface SoccerPlayerStatLine {
  athleteId?: string;
  name: string;
  position?: string;
  jersey?: string;
  values: Record<string, string>;
}

export interface SoccerPlayerStatCategory {
  name: string;
  columns: string[];
  athletes: SoccerPlayerStatLine[];
}

export interface SoccerPlayerStatsTeam {
  teamId?: string;
  teamName: string;
  categories: SoccerPlayerStatCategory[];
}

export interface SoccerOfficial {
  name: string;
  role?: string;
}

export interface SoccerMatchSummary {
  eventId: string;
  date?: string;
  status?: string;
  detail?: string;
  venue?: string;
  homeTeam?: string;
  awayTeam?: string;
  homeScore?: number;
  awayScore?: number;
  lineups: SoccerLineupTeam[];
  teamStats: SoccerTeamStat[];
  playerStats: SoccerPlayerStatsTeam[];
  officials: SoccerOfficial[];
  source?: 'summary' | 'scoreboard';
  raw: unknown;
}

export interface SoccerMatchExtras {
  homeTeamDetail: SoccerTeamDetail | null;
  awayTeamDetail: SoccerTeamDetail | null;
  homeRoster: SoccerRosterPlayer[];
  awayRoster: SoccerRosterPlayer[];
  h2h: SoccerGame[];
}

const ESPN_SOCCER_BASE_URL = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
@Injectable({ providedIn: 'root' })
export class EspnSoccerService {
  constructor(
    private readonly http: HttpClient,
    private readonly oddsService: OddsService
  ) {}

  private isLocalDev(): boolean {
    if (typeof location === 'undefined') {
      return false;
    }

    const host = location.hostname;
    return host === 'localhost' || host === '127.0.0.1' || location.port === '4200';
  }

  private summaryUrl(league: string, eventId: string): string {
    const safeLeague = encodeURIComponent(league?.trim() || 'eng.1');
    const safeEvent = encodeURIComponent(eventId);

    if (this.isLocalDev()) {
      return `/espn/apis/site/v2/sports/soccer/${safeLeague}/summary?event=${safeEvent}`;
    }

    return `${ESPN_SOCCER_BASE_URL}/${safeLeague}/summary?event=${safeEvent}`;
  }

  getScoreboard(league: string): Observable<SoccerGame[]> {
    const dates = this.buildScoreboardDates();
    const requests = dates.map((date) =>
      this.http.get<any>(`${ESPN_SOCCER_BASE_URL}/${league}/scoreboard?dates=${date}`)
    );
    const oddsRequest = this.oddsService.getOddsBySport(SPORT_KEYS.soccer);

    return forkJoin({
      scoreboards: forkJoin(requests),
      oddsEvents: oddsRequest.pipe(catchError(() => of([]))),
    }).pipe(
      map(({ scoreboards, oddsEvents }) => {
        const games = scoreboards.flatMap((data) => this.mapScoreboard(data));
        const deduped = this.deduplicateGames(games);
        const withRealOdds = this.attachRealOdds(deduped, oddsEvents);
        return this.sortGames(withRealOdds);
      })
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

  getTeamRoster(league: string, teamId: string): Observable<SoccerRosterPlayer[]> {
    return this.http.get<any>(`${ESPN_SOCCER_BASE_URL}/${encodeURIComponent(league)}/teams/${encodeURIComponent(teamId)}/roster`).pipe(
      timeout(12000),
      map((data) => this.mapRoster(data)),
      catchError(() => of([]))
    );
  }

  getTeamSchedule(league: string, teamId: string): Observable<SoccerGame[]> {
    return this.http.get<any>(`${ESPN_SOCCER_BASE_URL}/${encodeURIComponent(league)}/teams/${encodeURIComponent(teamId)}/schedule`).pipe(
      timeout(12000),
      map((data) => this.mapScheduleAsGames(data)),
      catchError(() => of([]))
    );
  }

  getMatchExtras(league: string, homeTeamName: string, awayTeamName: string): Observable<SoccerMatchExtras> {
    const empty: SoccerMatchExtras = {
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
            } satisfies SoccerMatchExtras;
          })
        );
      }),
      catchError(() => of(empty))
    );
  }

  getMatchSummary(league: string, eventId: string): Observable<SoccerMatchSummary | null> {
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

        if (status === 0 || status === 401 || status === 403) {
          return this.getBasicSummaryFromScoreboard(league, eventId);
        }

        return throwError(() => new Error(`ESPN match summary failed (${details}): ${message}`));
      })
    );
  }

  private getBasicSummaryFromScoreboard(league: string, eventId: string): Observable<SoccerMatchSummary | null> {
    return this.getScoreboard(league).pipe(
      map((games) => games.find((g) => g.id === eventId) ?? null),
      switchMap((game) => {
        if (!game) {
          return of(null);
        }

        const summary: SoccerMatchSummary = {
          eventId,
          date: game.date,
          status: game.status,
          detail: game.detail,
          venue: game.venue,
          homeTeam: game.homeTeam,
          awayTeam: game.awayTeam,
          homeScore: game.homeScore,
          awayScore: game.awayScore,
          lineups: [],
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

  private mapScoreboard(data: any): SoccerGame[] {
    const events = data?.events ?? [];
    return events.map((event: any) => {
      const competition = event?.competitions?.[0];
      const competitors = competition?.competitors ?? [];
      const home = competitors.find((c: any) => c.homeAway === 'home') ?? competitors[0] ?? {};
      const away = competitors.find((c: any) => c.homeAway === 'away') ?? competitors[1] ?? {};
      const statusType = competition?.status?.type ?? event?.status?.type ?? {};
      const status = statusType?.shortDetail ?? statusType?.detail ?? statusType?.description ?? 'Scheduled';
      const displayStatus = this.formatStatusLabel(statusType, status);
      const venue = competition?.venue?.fullName ?? competition?.venue?.name;

      const homeTeam = home?.team?.displayName ?? home?.team?.shortDisplayName ?? 'Home';
      const awayTeam = away?.team?.displayName ?? away?.team?.shortDisplayName ?? 'Away';

      return {
        id: event?.id ?? competition?.id ?? `${home?.team?.id ?? 'home'}-${away?.team?.id ?? 'away'}`,
        date: event?.date ?? competition?.date ?? new Date().toISOString(),
        status: displayStatus,
        detail: status,
        state: statusType?.state,
        completed: Boolean(statusType?.completed),
        homeTeam,
        awayTeam,
        homeScore: this.toScore(home?.score),
        awayScore: this.toScore(away?.score),
        venue,
        odds: [],
      };
    });
  }

  private attachRealOdds(games: SoccerGame[], oddsEvents: OddsEvent[]): SoccerGame[] {
    if (!games.length || !oddsEvents.length) {
      return games;
    }

    return games.map((game) => {
      const match = this.findOddsEventForGame(game, oddsEvents);
      if (!match) {
        return game;
      }

      const mappedOdds = this.mapEventOddsToThreeWay(game, match);
      if (!mappedOdds.length) {
        return game;
      }

      return { ...game, odds: mappedOdds };
    });
  }

  private findOddsEventForGame(game: SoccerGame, oddsEvents: OddsEvent[]): OddsEvent | null {
    const gameKickoff = new Date(game.date).getTime();
    const maxKickoffDeltaMs = 18 * 60 * 60 * 1000;

    let best: OddsEvent | null = null;
    let bestScore = -1;
    let bestKickoffDelta = Number.POSITIVE_INFINITY;

    for (const event of oddsEvents) {
      const eventKickoff = new Date(event.commence_time).getTime();
      const kickoffDelta = Math.abs(gameKickoff - eventKickoff);
      if (Number.isFinite(gameKickoff) && Number.isFinite(eventKickoff) && kickoffDelta > maxKickoffDeltaMs) {
        continue;
      }

      const scoreDirect = this.teamMatchScore(game.homeTeam, event.home_team) + this.teamMatchScore(game.awayTeam, event.away_team);
      const scoreSwapped = this.teamMatchScore(game.homeTeam, event.away_team) + this.teamMatchScore(game.awayTeam, event.home_team);
      const score = Math.max(scoreDirect, scoreSwapped);

      if (score > bestScore || (score === bestScore && kickoffDelta < bestKickoffDelta)) {
        bestScore = score;
        best = event;
        bestKickoffDelta = kickoffDelta;
      }
    }

    return bestScore >= 2 ? best : null;
  }

  private mapEventOddsToThreeWay(game: SoccerGame, event: OddsEvent): SoccerOddsOutcome[] {
    const h2h = event.bookmakers?.find((bookmaker) => bookmaker?.markets?.some((market) => market?.key === 'h2h'))
      ?.markets?.find((market) => market?.key === 'h2h');
    const outcomes = h2h?.outcomes ?? [];
    if (!outcomes.length) {
      return [];
    }

    const drawAliases = new Set(['draw', 'tie', 'x', 'remiza', 'remis']);
    const eventHome = this.normalizeTeamName(event.home_team);
    const eventAway = this.normalizeTeamName(event.away_team);

    const used = new Set<number>();
    let homePrice: number | undefined;
    let awayPrice: number | undefined;
    let drawPrice: number | undefined;

    outcomes.forEach((outcome, index) => {
      const name = this.normalizeTeamName(outcome?.name ?? '');
      if (!name || typeof outcome?.price !== 'number') {
        return;
      }

      if (drawAliases.has(name)) {
        drawPrice = outcome.price;
        used.add(index);
      }
    });

    outcomes.forEach((outcome, index) => {
      if (used.has(index)) {
        return;
      }

      const name = outcome?.name ?? '';
      if (typeof outcome?.price !== 'number') {
        return;
      }

      const homeScore = this.teamMatchScore(eventHome, name);
      const awayScore = this.teamMatchScore(eventAway, name);
      if (homeScore >= awayScore && homeScore >= 2 && homePrice === undefined) {
        homePrice = outcome.price;
        used.add(index);
        return;
      }

      if (awayScore > homeScore && awayScore >= 2 && awayPrice === undefined) {
        awayPrice = outcome.price;
        used.add(index);
      }
    });

    outcomes.forEach((outcome, index) => {
      if (used.has(index)) {
        return;
      }

      if (typeof outcome?.price !== 'number') {
        return;
      }

      if (homePrice === undefined) {
        homePrice = outcome.price;
        used.add(index);
        return;
      }

      if (awayPrice === undefined) {
        awayPrice = outcome.price;
        used.add(index);
        return;
      }

      if (drawPrice === undefined) {
        drawPrice = outcome.price;
      }
    });

    const mapped: SoccerOddsOutcome[] = [];
    if (homePrice !== undefined) {
      mapped.push({ name: '1', price: homePrice });
    }
    if (drawPrice !== undefined) {
      mapped.push({ name: 'X', price: drawPrice });
    }
    if (awayPrice !== undefined) {
      mapped.push({ name: '2', price: awayPrice });
    }

    return mapped;
  }

  private teamMatchScore(a: string, b: string): number {
    const na = this.normalizeTeamName(a);
    const nb = this.normalizeTeamName(b);

    if (!na || !nb) {
      return 0;
    }

    if (na === nb) {
      return 4;
    }

    if (na.includes(nb) || nb.includes(na)) {
      return 3;
    }

    const aTokens = na.split(' ').filter((token) => token.length > 1);
    const bTokens = nb.split(' ').filter((token) => token.length > 1);
    const overlap = aTokens.filter((token) => bTokens.includes(token)).length;

    if (overlap >= 2) {
      return 2;
    }

    if (overlap === 1) {
      const shortA = aTokens.length <= 2 && aTokens.some((token) => token.length <= 4);
      const shortB = bTokens.length <= 2 && bTokens.some((token) => token.length <= 4);
      return shortA || shortB ? 2 : 1;
    }

    return 0;
  }

  private normalizeTeamName(teamName: string): string {
    return teamName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\b(fc|cf|sc|ac|afc|cfc|bk|fk|sv|ss|as)\b/g, ' ')
      .replace(/[^a-z0-9/ ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private formatStatusLabel(statusType: any, fallback: string): string {
    const state = statusType?.state?.toLowerCase();
    const shortDetail = `${statusType?.shortDetail ?? ''}`.trim();
    const name = `${statusType?.name ?? ''}`.trim().toLowerCase();

    if (state === 'post') {
      return shortDetail || 'FT';
    }

    if (state === 'in') {
      return shortDetail || 'Live';
    }

    if (state === 'pre') {
      return shortDetail || 'Scheduled';
    }

    if (name.includes('full_time')) {
      return 'FT';
    }

    if (name.includes('half_time')) {
      return 'HT';
    }

    return fallback;
  }

  private buildScoreboardDates(): string[] {
    const today = new Date();
    const dates: Date[] = [];

    // Keep a small window around today, but include upcoming fixtures too.
    // (Used by Home + Analyses pages.)
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

  private deduplicateGames(games: SoccerGame[]): SoccerGame[] {
    const unique = new Map<string, SoccerGame>();

    for (const game of games) {
      unique.set(game.id, game);
    }

    return Array.from(unique.values());
  }

  private sortGames(games: SoccerGame[]): SoccerGame[] {
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

    if (normalized.includes('in') || normalized.includes('live') || normalized.includes('progress') || normalized.includes('half')) {
      return 0;
    }

    if (normalized.includes('pre') || normalized.includes('scheduled')) {
      return 1;
    }

    if (normalized.includes('post') || normalized.includes('final') || normalized.includes('after')) {
      return 2;
    }

    return 1;
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

  private mapMatchSummary(eventId: string, data: any): SoccerMatchSummary | null {
    if (!data || typeof data !== 'object') {
      return null;
    }

    const headerCompetition = data?.header?.competitions?.[0];
    const headerCompetitors = headerCompetition?.competitors ?? [];
    const home = headerCompetitors.find((c: any) => c?.homeAway === 'home') ?? headerCompetitors[0] ?? {};
    const away = headerCompetitors.find((c: any) => c?.homeAway === 'away') ?? headerCompetitors[1] ?? {};

    const statusType = headerCompetition?.status?.type ?? data?.header?.competitions?.[0]?.status?.type ?? {};
    const detail =
      statusType?.shortDetail ?? statusType?.detail ?? statusType?.description ?? data?.header?.competitions?.[0]?.status?.type?.description;
    const status = this.formatStatusLabel(statusType, detail ?? 'Match');

    const venue =
      headerCompetition?.venue?.fullName ??
      headerCompetition?.venue?.name ??
      data?.gameInfo?.venue?.fullName ??
      data?.gameInfo?.venue?.name;

    const date = data?.header?.competitions?.[0]?.date ?? data?.header?.competitions?.[0]?.startDate ?? data?.header?.date;

    const lineups = this.extractLineups(data, home, away);
    const teamStats = this.extractTeamStats(data, home, away);
    const playerStats = this.extractPlayerStats(data);
    const officials = this.extractOfficials(data);

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
      lineups,
      teamStats,
      playerStats,
      officials,
      raw: data,
    };
  }

  private extractLineups(data: any, homeHeader: any, awayHeader: any): SoccerLineupTeam[] {
    const lineups = data?.lineups ?? data?.gamepackageJSON?.lineups ?? data?.match?.lineups;
    if (!lineups || typeof lineups !== 'object') {
      return [];
    }

    const home = lineups?.homeTeam ?? lineups?.home ?? lineups?.[0] ?? null;
    const away = lineups?.awayTeam ?? lineups?.away ?? lineups?.[1] ?? null;

    const homeTeam = this.mapLineupTeam(home, homeHeader?.team);
    const awayTeam = this.mapLineupTeam(away, awayHeader?.team);

    return [homeTeam, awayTeam].filter(Boolean) as SoccerLineupTeam[];
  }

  private mapLineupTeam(lineupTeam: any, headerTeam: any): SoccerLineupTeam | null {
    if (!lineupTeam || typeof lineupTeam !== 'object') {
      return null;
    }

    const team =
      lineupTeam?.team ??
      headerTeam ??
      lineupTeam?.club ??
      lineupTeam?.competitor ??
      {};

    const teamId = team?.id?.toString?.() ?? team?.teamId?.toString?.();
    const teamName = team?.displayName ?? team?.name ?? lineupTeam?.name ?? 'Team';
    const formation = lineupTeam?.formation ?? lineupTeam?.formationUsed ?? lineupTeam?.formationName;

    const players =
      lineupTeam?.players ??
      lineupTeam?.lineup ??
      lineupTeam?.athletes ??
      lineupTeam?.roster ??
      [];

    const list = Array.isArray(players) ? players : [];
    const mapped = list.map((p: any) => this.mapLineupPlayer(p)).filter(Boolean) as SoccerLineupPlayer[];

    const starters = mapped.filter((p) => p.starter !== false);
    const substitutes = mapped.filter((p) => p.starter === false);

    // Some payloads don't mark starter/bench; fallback to "starter" groupings if present.
    if (!substitutes.length) {
      const bench =
        (Array.isArray(lineupTeam?.substitutes) ? lineupTeam?.substitutes : []) as any[];
      const benchMapped = bench.map((p) => this.mapLineupPlayer(p, false)).filter(Boolean) as SoccerLineupPlayer[];
      if (benchMapped.length) {
        return { teamId, teamName, formation, starters: mapped, substitutes: benchMapped };
      }
    }

    return { teamId, teamName, formation, starters, substitutes };
  }

  private mapLineupPlayer(player: any, forcedStarter?: boolean): SoccerLineupPlayer | null {
    if (!player || typeof player !== 'object') {
      return null;
    }

    const athlete = player?.athlete ?? player?.player ?? player?.athletes?.[0] ?? player;
    const id = athlete?.id?.toString?.();
    const name =
      athlete?.displayName ??
      athlete?.shortName ??
      athlete?.fullName ??
      player?.displayName ??
      player?.name;

    if (!name) {
      return null;
    }

    const position =
      player?.position?.abbreviation ??
      player?.position?.displayName ??
      athlete?.position?.abbreviation ??
      athlete?.position?.name;

    const jersey =
      player?.jersey?.toString?.() ??
      player?.jersey ??
      athlete?.jersey?.toString?.() ??
      athlete?.jersey;

    const starter =
      forcedStarter ??
      (typeof player?.starter === 'boolean' ? player.starter : undefined) ??
      (typeof player?.isStarter === 'boolean' ? player.isStarter : undefined);

    return { id, name, position, jersey, starter };
  }

  private extractTeamStats(data: any, homeHeader: any, awayHeader: any): SoccerTeamStat[] {
    const teams = data?.boxscore?.teams;
    if (!Array.isArray(teams) || teams.length < 2) {
      return [];
    }

    const homeId = homeHeader?.team?.id?.toString?.();
    const awayId = awayHeader?.team?.id?.toString?.();

    const resolveTeamBucket = (bucket: any) => (bucket?.team?.id?.toString?.() ? bucket : null);
    const homeBucket =
      teams.find((t: any) => resolveTeamBucket(t)?.team?.id?.toString?.() === homeId) ?? teams[0];
    const awayBucket =
      teams.find((t: any) => resolveTeamBucket(t)?.team?.id?.toString?.() === awayId) ?? teams[1];

    const homeStats = Array.isArray(homeBucket?.statistics) ? homeBucket.statistics : [];
    const awayStats = Array.isArray(awayBucket?.statistics) ? awayBucket.statistics : [];

    const byName = new Map<string, SoccerTeamStat>();

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

  private extractPlayerStats(data: any): SoccerPlayerStatsTeam[] {
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
        const categories: SoccerPlayerStatCategory[] = statistics
          .map((category: any) => this.mapPlayerStatCategory(category))
          .filter(Boolean) as SoccerPlayerStatCategory[];

        return {
          teamId,
          teamName,
          categories,
        } satisfies SoccerPlayerStatsTeam;
      })
      .filter((t: SoccerPlayerStatsTeam) => t.categories.length);
  }

  private mapPlayerStatCategory(category: any): SoccerPlayerStatCategory | null {
    if (!category || typeof category !== 'object') {
      return null;
    }

    const name = category?.name ?? category?.label ?? category?.displayName ?? 'Stats';
    const columns: string[] =
      (Array.isArray(category?.labels) ? category.labels : null) ??
      (Array.isArray(category?.keys) ? category.keys : null) ??
      [];

    const athletes = Array.isArray(category?.athletes) ? category.athletes : [];
    const mappedAthletes: SoccerPlayerStatLine[] = athletes
      .map((row: any) => this.mapPlayerStatLine(row, columns))
      .filter(Boolean) as SoccerPlayerStatLine[];

    if (!mappedAthletes.length) {
      return null;
    }

    const finalColumns = columns.length ? columns.map((c) => String(c)) : this.inferColumns(mappedAthletes);
    return { name: String(name), columns: finalColumns, athletes: mappedAthletes };
  }

  private mapPlayerStatLine(row: any, columns: string[]): SoccerPlayerStatLine | null {
    if (!row || typeof row !== 'object') {
      return null;
    }

    const athlete = row?.athlete ?? row?.player ?? row;
    const name = athlete?.displayName ?? athlete?.shortName ?? athlete?.fullName ?? row?.displayName ?? row?.name;
    if (!name) {
      return null;
    }

    const athleteId = athlete?.id?.toString?.();
    const position =
      row?.position?.abbreviation ?? row?.position?.displayName ?? athlete?.position?.abbreviation ?? athlete?.position?.name;
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
      // Fallback: no labels provided; keep numeric keys.
      statsArray.forEach((val: any, idx: number) => {
        if (val === undefined || val === null) return;
        values[`#${idx + 1}`] = String(val);
      });
    }

    return {
      athleteId,
      name: String(name),
      position: position ? String(position) : undefined,
      jersey: jersey ? String(jersey) : undefined,
      values,
    };
  }

  private inferColumns(rows: SoccerPlayerStatLine[]): string[] {
    const set = new Set<string>();
    for (const row of rows) {
      Object.keys(row.values).forEach((k) => set.add(k));
    }
    return Array.from(set);
  }

  private extractOfficials(data: any): SoccerOfficial[] {
    const officials = data?.gameInfo?.officials ?? data?.officials ?? [];
    if (!Array.isArray(officials)) {
      return [];
    }

    return officials
      .map((o: any) => {
        const name = o?.fullName ?? o?.displayName ?? o?.name;
        if (!name) return null;
        const role = o?.position?.name ?? o?.role ?? o?.type;
        return { name: String(name), role: role ? String(role) : undefined } satisfies SoccerOfficial;
      })
      .filter(Boolean) as SoccerOfficial[];
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

  private mapRoster(data: any): SoccerRosterPlayer[] {
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
        } satisfies SoccerRosterPlayer;
      })
      .filter(Boolean) as SoccerRosterPlayer[];
  }

  private mapScheduleAsGames(data: any): SoccerGame[] {
    const events =
      (Array.isArray(data?.events) ? data.events : null) ??
      (Array.isArray(data?.items) ? data.items : null) ??
      (Array.isArray(data?.schedule) ? data.schedule : null) ??
      [];

    if (!Array.isArray(events) || !events.length) {
      const nested =
        data?.events?.[0]?.events ??
        data?.schedule?.[0]?.events ??
        data?.leagues?.[0]?.events ??
        [];

      if (Array.isArray(nested) && nested.length) {
        return this.mapScoreboard({ events: nested });
      }

      return [];
    }

    return this.mapScoreboard({ events });
  }

  private findTeamByName(teams: SoccerTeam[], name: string): SoccerTeam | null {
    const needle = this.normalizeTeamName(name);
    if (!needle) return null;

    const exact = teams.find((t) => this.normalizeTeamName(t.name) === needle);
    if (exact) return exact;

    const contains = teams.find((t) => {
      const normalized = this.normalizeTeamName(t.name);
      return normalized.includes(needle) || needle.includes(normalized);
    });
    return contains ?? null;
  }

  private isPlayedGame(game: SoccerGame): boolean {
    if (game.homeScore !== undefined || game.awayScore !== undefined) {
      return true;
    }

    if (game.completed || game.state?.toLowerCase() === 'post') {
      return true;
    }

    const normalized = `${game.status} ${game.detail}`.toLowerCase();
    return normalized.includes('final') || normalized.includes('post') || normalized.includes('after');
  }

  private buildH2H(homeSchedule: SoccerGame[], awaySchedule: SoccerGame[], homeTeam: string, awayTeam: string): SoccerGame[] {
    const homeNeedle = this.normalizeTeamName(homeTeam);
    const awayNeedle = this.normalizeTeamName(awayTeam);

    const all = [...homeSchedule, ...awaySchedule];
    const unique = this.deduplicateGames(all);

    const meetings = unique.filter((g) => {
      const home = this.normalizeTeamName(g.homeTeam);
      const away = this.normalizeTeamName(g.awayTeam);
      return (home === homeNeedle && away === awayNeedle) || (home === awayNeedle && away === homeNeedle);
    });

    return meetings
      .filter((g) => this.isPlayedGame(g))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  private limitRoster(players: SoccerRosterPlayer[]): SoccerRosterPlayer[] {
    return Array.isArray(players) ? players.slice(0, 40) : [];
  }

  private toScore(value: any): number | undefined {
    if (value === null || value === undefined || value === '') {
      return undefined;
    }
    const parsed = Number(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
}
