import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { BetSelection, BetTicket } from './betslip.service';
import { EspnHockeyService } from './espn-hockey.service';
import { EspnSoccerService } from './espn-soccer.service';
import { EspnTennisLeague, EspnTennisService } from './espn-tennis.service';

type SelectionResult = NonNullable<BetSelection['resultStatus']>;

interface SettledGame {
  homeScore?: number;
  awayScore?: number;
  completed: boolean;
  note: string;
}

@Injectable({ providedIn: 'root' })
export class TicketSettlementService {
  private readonly soccerService = inject(EspnSoccerService);
  private readonly hockeyService = inject(EspnHockeyService);
  private readonly tennisService = inject(EspnTennisService);

  async evaluate(ticket: BetTicket): Promise<BetTicket> {
    const settledSelections = await Promise.all(
      ticket.selections.map((selection) => this.evaluateSelection(selection))
    );

    const status = this.resolveTicketStatus(settledSelections);
    return {
      ...ticket,
      selections: settledSelections,
      status,
      settledAt: status === 'pending' ? ticket.settledAt : new Date().toISOString(),
      returnedAmount: status === 'won' ? ticket.potentialWin : 0,
    };
  }

  private async evaluateSelection(selection: BetSelection): Promise<BetSelection> {
    try {
      const game = await this.findGame(selection);
      if (!game || !game.completed) {
        return { ...selection, resultStatus: 'pending', resultNote: 'Zapas este nie je ukonceny.' };
      }

      const resultStatus = this.resolveSelectionResult(selection.market, game);
      return {
        ...selection,
        resultStatus,
        resultScore: this.formatScore(game),
        resultNote: game.note,
      };
    } catch {
      return {
        ...selection,
        resultStatus: 'pending',
        resultNote: 'Vysledok sa nepodarilo nacitat.',
      };
    }
  }

  private async findGame(selection: BetSelection): Promise<SettledGame | null> {
    const source = this.resolveSource(selection);
    if (!source) {
      return null;
    }

    if (source.sport === 'football') {
      const games = await firstValueFrom(this.soccerService.getScoreboard(source.league, 14, 3));
      const game = games.find((item) => item.id === source.eventId);
      if (!game) return null;
      return {
        homeScore: game.homeScore,
        awayScore: game.awayScore,
        completed: Boolean(game.completed || game.state?.toLowerCase() === 'post' || this.isFinal(game.status, game.detail)),
        note: `${game.status} ${game.detail}`.trim(),
      };
    }

    if (source.sport === 'hockey') {
      const games = await firstValueFrom(this.hockeyService.getScoreboard(source.league, 14, 3));
      const game = games.find((item) => item.id === source.eventId);
      if (!game) return null;
      return {
        homeScore: game.homeScore,
        awayScore: game.awayScore,
        completed: this.isFinal(game.status, game.detail),
        note: `${game.status} ${game.detail}`.trim(),
      };
    }

    if (source.sport === 'tennis') {
      const league = source.league === 'wta' ? 'wta' : 'atp';
      const games = await firstValueFrom(this.tennisService.getScoreboard(league as EspnTennisLeague));
      const game = games.find((item) => item.id === source.eventId);
      if (!game) return null;
      return {
        homeScore: this.toNumberScore(game.scoreA),
        awayScore: this.toNumberScore(game.scoreB),
        completed: Boolean(game.completed || game.state?.toLowerCase() === 'post' || this.isFinal(game.status, game.detail)),
        note: `${game.status} ${game.detail}`.trim(),
      };
    }

    return null;
  }

  private resolveSelectionResult(market: string, game: SettledGame): SelectionResult {
    if (game.homeScore === undefined || game.awayScore === undefined) {
      return 'void';
    }

    const normalizedMarket = `${market}`.trim().toUpperCase();
    const outcome =
      game.homeScore > game.awayScore ? '1' : game.homeScore < game.awayScore ? '2' : 'X';

    return normalizedMarket === outcome ? 'won' : 'lost';
  }

  private resolveTicketStatus(selections: BetSelection[]): BetTicket['status'] {
    if (selections.some((selection) => selection.resultStatus === 'pending')) {
      return 'pending';
    }
    if (selections.some((selection) => selection.resultStatus === 'lost')) {
      return 'lost';
    }
    if (selections.every((selection) => selection.resultStatus === 'void')) {
      return 'void';
    }
    return 'won';
  }

  private resolveSource(selection: BetSelection): { sport: string; league: string; eventId: string } | null {
    const eventId = selection.sourceEventId?.trim();
    const league = selection.league?.trim();
    if (eventId && league) {
      const sport = selection.eventId.split('-')[0] || selection.sport.toLowerCase();
      return { sport, league, eventId };
    }

    const match = selection.eventId.match(/^(football|hockey|tennis)-(.+)-([^-]+)$/);
    if (!match) {
      return null;
    }

    return { sport: match[1], league: match[2], eventId: match[3] };
  }

  private isFinal(status: string, detail: string): boolean {
    const normalized = `${status} ${detail}`.toLowerCase();
    return normalized.includes('final') || normalized.includes('post') || normalized.includes('ft');
  }

  private toNumberScore(value: string | undefined): number | undefined {
    if (!value) {
      return undefined;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private formatScore(game: SettledGame): string | undefined {
    if (game.homeScore === undefined || game.awayScore === undefined) {
      return undefined;
    }
    return `${game.homeScore}:${game.awayScore}`;
  }
}
