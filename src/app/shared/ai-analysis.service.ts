import { Injectable } from '@angular/core';
import { catchError, forkJoin, map, Observable, of, switchMap } from 'rxjs';
import { EspnHockeyService, HockeyGame, HockeyTeam } from './espn-hockey.service';
import { ESPN_SOCCER_LEAGUES } from './espn-soccer-leagues';
import { EspnSoccerService, SoccerGame, SoccerTeam } from './espn-soccer.service';

export interface AiMatchInput {
  id?: string;
  sportKey: string;
  sportTitle: string;
  homeTeam: string;
  awayTeam: string;
  competition: string;
  kickoff: string;
}

export interface AiAnalysisDraft {
  title: string;
  summary: string;
  pick?: string;
  confidence: number;
}

interface TeamStats {
  formScore: number;
  attack: number;
  defense: number;
  goalsAvg: number;
  gamesUsed?: number;
  source?: 'last5' | 'local';
}

@Injectable({ providedIn: 'root' })
export class AiAnalysisService {
  constructor(
    private readonly soccerService: EspnSoccerService,
    private readonly hockeyService: EspnHockeyService
  ) {}

  buildDraftWithGroq(match: AiMatchInput): Observable<AiAnalysisDraft> {
    return this.loadRealTeamStats(match).pipe(
      map((stats) => this.buildDraft(match, stats ?? undefined)),
      catchError(() => of(this.buildDraft(match)))
    );
  }

  buildDraft(match: AiMatchInput, realStats?: { home: TeamStats; away: TeamStats }): AiAnalysisDraft {
    const homeStats = realStats?.home ?? this.generateTeamStats(`${match.homeTeam}|${match.competition}`);
    const awayStats = realStats?.away ?? this.generateTeamStats(`${match.awayTeam}|${match.competition}`);
    const homeScore = this.calculateTeamScore(homeStats, true);
    const awayScore = this.calculateTeamScore(awayStats, false);
    const diff = homeScore - awayScore;
    const canDraw = match.sportKey === 'soccer';
    const { tip, confidencePercent } = this.getTip(diff, canDraw);
    const confidence = Math.max(1, Math.min(5, Math.round(confidencePercent / 20)));
    const favorite = tip === '1' ? match.homeTeam : tip === '2' ? match.awayTeam : 'remiza';
    const kickoff = this.formatKickoff(match.kickoff);
    const risk = this.riskLabel(confidencePercent);
    const matchupText =
      tip === 'X'
        ? 'Model vidi velmi tesny zapas bez jasnej prevahy jednej strany.'
        : `${favorite} ma lepsi mix formy, utoku, defenzivy a domaceho/hostujuceho kontextu.`;
    const sourceNote = realStats
      ? `Forma je z poslednych dostupnych zapasov (${homeStats.gamesUsed ?? 0}/${awayStats.gamesUsed ?? 0}).`
      : 'Pouzity je fallback model, preto pred podanim skontroluj zostavy a kurz.';

    return {
      title: `${match.homeTeam} vs ${match.awayTeam}: tip ${tip}`,
      summary: [
        `${match.competition} - ${kickoff}`,
        `Tip: ${tip} | Confidence: ${confidence}/5 | Riziko: ${risk}`,
        `Model: ${homeScore.toFixed(2)} vs ${awayScore.toFixed(2)}.`,
        `Dovod: ${matchupText}`,
        `Profil: ${match.homeTeam} forma ${homeStats.formScore}/5, ${match.awayTeam} forma ${awayStats.formScore}/5.`,
        `Stake: konzervativne 1-3 % bankrollu. ${sourceNote}`,
      ].join('\n'),
      pick: tip,
      confidence,
    };
  }

  private riskLabel(confidencePercent: number): string {
    if (confidencePercent >= 80) {
      return 'nizsie az stredne';
    }
    if (confidencePercent >= 65) {
      return 'stredne';
    }
    return 'vyssie';
  }

  private formatKickoff(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value || 'neznamy';
    }

    return new Intl.DateTimeFormat('sk-SK', {
      timeZone: 'Europe/Bratislava',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  private hashString(value: string): number {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
      hash = (hash * 31 + value.charCodeAt(i)) % 100;
    }
    return hash;
  }

  private generateTeamStats(team: string): TeamStats {
    const base = this.hashString(team);

    return {
      formScore: base % 6,
      attack: base % 6,
      defense: (base + 3) % 6,
      goalsAvg: (base + 7) % 6,
      source: 'local',
    };
  }

  private loadRealTeamStats(match: AiMatchInput): Observable<{ home: TeamStats; away: TeamStats } | null> {
    if (match.sportKey === 'soccer') {
      return this.loadSoccerStats(match);
    }

    if (match.sportKey === 'hockey') {
      return this.loadHockeyStats(match);
    }

    return of(null);
  }

  private loadSoccerStats(match: AiMatchInput): Observable<{ home: TeamStats; away: TeamStats } | null> {
    const league = this.resolveSoccerLeague(match);

    return this.soccerService.getTeams(league).pipe(
      switchMap((teams) => {
        const homeTeam = this.findTeamByName(teams, match.homeTeam);
        const awayTeam = this.findTeamByName(teams, match.awayTeam);

        if (!homeTeam?.id || !awayTeam?.id) {
          return of(null);
        }

        return forkJoin({
          homeGames: this.soccerService.getTeamSchedule(league, homeTeam.id),
          awayGames: this.soccerService.getTeamSchedule(league, awayTeam.id),
        }).pipe(
          map(({ homeGames, awayGames }) => ({
            home: this.statsFromGames(homeGames, match.homeTeam, true),
            away: this.statsFromGames(awayGames, match.awayTeam, true),
          }))
        );
      }),
      catchError(() => of(null))
    );
  }

  private loadHockeyStats(match: AiMatchInput): Observable<{ home: TeamStats; away: TeamStats } | null> {
    const league = 'nhl';

    return this.hockeyService.getTeams(league).pipe(
      switchMap((teams) => {
        const homeTeam = this.findTeamByName(teams, match.homeTeam);
        const awayTeam = this.findTeamByName(teams, match.awayTeam);

        if (!homeTeam?.id || !awayTeam?.id) {
          return of(null);
        }

        return forkJoin({
          homeGames: this.hockeyService.getTeamSchedule(league, homeTeam.id),
          awayGames: this.hockeyService.getTeamSchedule(league, awayTeam.id),
        }).pipe(
          map(({ homeGames, awayGames }) => ({
            home: this.statsFromGames(homeGames, match.homeTeam, true),
            away: this.statsFromGames(awayGames, match.awayTeam, true),
          }))
        );
      }),
      catchError(() => of(null))
    );
  }

  private statsFromGames(games: Array<SoccerGame | HockeyGame>, teamName: string, allowDraw: boolean): TeamStats {
    const team = this.normalizeName(teamName);
    const played = games
      .filter((game) => this.isPlayedGame(game))
      .filter((game) => {
        const home = this.normalizeName(game.homeTeam);
        const away = this.normalizeName(game.awayTeam);
        return home === team || away === team || home.includes(team) || away.includes(team) || team.includes(home) || team.includes(away);
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);

    if (!played.length) {
      return this.generateTeamStats(teamName);
    }

    let points = 0;
    let goalsFor = 0;
    let goalsAgainst = 0;

    for (const game of played) {
      const isHome = this.isSameTeam(game.homeTeam, teamName);
      const ownScore = isHome ? game.homeScore : game.awayScore;
      const opponentScore = isHome ? game.awayScore : game.homeScore;

      if (ownScore === undefined || opponentScore === undefined) {
        continue;
      }

      goalsFor += ownScore;
      goalsAgainst += opponentScore;

      if (ownScore > opponentScore) {
        points += 3;
      } else if (allowDraw && ownScore === opponentScore) {
        points += 1;
      }
    }

    const gamesUsed = played.length;
    const formScore = this.clamp(Math.round((points / (gamesUsed * 3)) * 5), 0, 5);
    const goalsForAvg = goalsFor / gamesUsed;
    const goalsAgainstAvg = goalsAgainst / gamesUsed;

    return {
      formScore,
      attack: this.clamp(Math.round(goalsForAvg), 0, 5),
      defense: this.clamp(Math.round(5 - goalsAgainstAvg), 0, 5),
      goalsAvg: this.clamp(Math.round(goalsForAvg + goalsAgainstAvg / 2), 0, 5),
      gamesUsed,
      source: 'last5',
    };
  }

  private calculateTeamScore(stats: TeamStats, isHome: boolean): number {
    const homeBonus = isHome ? 1.2 : 1;

    return (
      stats.formScore * 0.35 +
      stats.attack * 0.25 +
      stats.defense * 0.2 +
      stats.goalsAvg * 0.2
    ) * homeBonus;
  }

  private getTip(diff: number, canDraw: boolean): { tip: string; confidencePercent: number } {
    const abs = Math.abs(diff);

    if (canDraw && abs < 0.5) {
      return { tip: 'X', confidencePercent: 55 };
    }

    if (diff > 0) {
      if (abs > 2) {
        return { tip: '1', confidencePercent: 85 };
      }
      if (abs > 1) {
        return { tip: '1', confidencePercent: 70 };
      }
      return { tip: '1', confidencePercent: 60 };
    }

    if (abs > 2) {
      return { tip: '2', confidencePercent: 85 };
    }
    if (abs > 1) {
      return { tip: '2', confidencePercent: 70 };
    }
    return { tip: '2', confidencePercent: 60 };
  }

  private resolveSoccerLeague(match: AiMatchInput): string {
    const fromId = match.id?.match(/^soccer-espn-([a-z0-9._-]+)-/i)?.[1];
    if (fromId) {
      return fromId;
    }

    const competition = this.normalizeName(match.competition);
    const matched = ESPN_SOCCER_LEAGUES.find((league) => {
      const label = this.normalizeName(league.label);
      return label === competition || label.includes(competition) || competition.includes(label);
    });

    return matched?.id ?? 'eng.1';
  }

  private findTeamByName<T extends SoccerTeam | HockeyTeam>(teams: T[], name: string): T | null {
    const needle = this.normalizeName(name);
    if (!needle) {
      return null;
    }

    return (
      teams.find((team) => this.normalizeName(team.name) === needle) ??
      teams.find((team) => {
        const normalized = this.normalizeName(team.name);
        return normalized.includes(needle) || needle.includes(normalized);
      }) ??
      null
    );
  }

  private isPlayedGame(game: SoccerGame | HockeyGame): boolean {
    if (game.homeScore !== undefined && game.awayScore !== undefined) {
      return true;
    }

    const normalized = `${game.status} ${game.detail}`.toLowerCase();
    return normalized.includes('final') || normalized.includes('post') || normalized.includes('ft');
  }

  private isSameTeam(left: string, right: string): boolean {
    const a = this.normalizeName(left);
    const b = this.normalizeName(right);
    return a === b || a.includes(b) || b.includes(a);
  }

  private normalizeName(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\b(fc|cf|sc|ac|afc|cfc|bk|fk|sv|ss|as)\b/g, ' ')
      .replace(/[^a-z0-9/ ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }
}
