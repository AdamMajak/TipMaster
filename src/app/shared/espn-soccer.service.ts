import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, forkJoin, map, Observable, throwError, timeout } from 'rxjs';

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
  raw: unknown;
}

const ESPN_SOCCER_BASE_URL = 'https://site.api.espn.com/apis/site/v2/sports/soccer';

@Injectable({ providedIn: 'root' })
export class EspnSoccerService {
  constructor(private readonly http: HttpClient) {}

  getScoreboard(league: string): Observable<SoccerGame[]> {
    const dates = this.buildScoreboardDates();
    const requests = dates.map((date) =>
      this.http.get<any>(`${ESPN_SOCCER_BASE_URL}/${league}/scoreboard?dates=${date}`)
    );

    return forkJoin(requests).pipe(
      map((responses) => responses.flatMap((data) => this.mapScoreboard(data))),
      map((games) => this.deduplicateGames(games)),
      map((games) => this.sortGames(games))
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

  getMatchSummary(league: string, eventId: string): Observable<SoccerMatchSummary | null> {
    // NOTE: ESPN "summary" endpoint often fails CORS. We route it through the local dev proxy (/espn -> site.api.espn.com).
    // This keeps scoreboard/news/teams direct, but match details reliable during development.
    const base = `/espn/apis/site/v2/sports/soccer/${encodeURIComponent(league)}`;
    return this.http
      .get<any>(`${base}/summary?event=${encodeURIComponent(eventId)}`)
      .pipe(
        timeout(12000),
        map((data) => this.mapMatchSummary(eventId, data)),
        catchError((err) => {
          const status = typeof err?.status === 'number' ? err.status : undefined;
          const url = err?.url ?? `${base}/summary?event=${eventId}`;
          const message =
            err?.error?.message ??
            err?.message ??
            'Request failed.';

          const details = `${status === undefined ? 'status=?' : `status=${status}`} url=${url}`;
          return throwError(() => new Error(`ESPN match summary failed (${details}): ${message}`));
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

      return {
        id: event?.id ?? competition?.id ?? `${home?.team?.id ?? 'home'}-${away?.team?.id ?? 'away'}`,
        date: event?.date ?? competition?.date ?? new Date().toISOString(),
        status: displayStatus,
        detail: status,
        state: statusType?.state,
        completed: Boolean(statusType?.completed),
        homeTeam: home?.team?.displayName ?? home?.team?.shortDisplayName ?? 'Home',
        awayTeam: away?.team?.displayName ?? away?.team?.shortDisplayName ?? 'Away',
        homeScore: this.toScore(home?.score),
        awayScore: this.toScore(away?.score),
        venue,
      };
    });
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

    for (let offset = -5; offset <= 1; offset += 1) {
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

  private toScore(value: any): number | undefined {
    if (value === null || value === undefined || value === '') {
      return undefined;
    }
    const parsed = Number(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
}
