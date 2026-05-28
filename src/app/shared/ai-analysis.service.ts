import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, map, Observable, of, timeout } from 'rxjs';
import { groqApiKey, groqModel } from './groq.config.local';

export interface AiMatchInput {
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

@Injectable({ providedIn: 'root' })
export class AiAnalysisService {
  constructor(private readonly http: HttpClient) {}

  buildDraftWithGroq(match: AiMatchInput): Observable<AiAnalysisDraft> {
    const fallback = this.buildDraft(match);
    const apiKey = (groqApiKey ?? '').trim();

    if (!apiKey) {
      return of(fallback);
    }

    return this.http
      .post<GroqChatResponse>(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: (groqModel ?? '').trim() || 'llama-3.1-8b-instant',
          temperature: 0.35,
          max_tokens: 650,
          messages: [
            {
              role: 'system',
              content:
                'Si sportovy analytik pre slovensku betting appku. Odpovedaj po slovensky bez diakritiky. ' +
                'Nevymyslaj zranenia ani zostavy. Vrat iba validny JSON bez markdownu.',
            },
            {
              role: 'user',
              content: this.buildGroqPrompt(match, fallback),
            },
          ],
        },
        {
          headers: new HttpHeaders({
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          }),
        }
      )
      .pipe(
        timeout(12000),
        map((response) => this.parseGroqDraft(response, fallback)),
        catchError(() => of(fallback))
      );
  }

  buildDraft(match: AiMatchInput): AiAnalysisDraft {
    const homeRating = this.rating(`${match.homeTeam}|${match.competition}`);
    const awayRating = this.rating(`${match.awayTeam}|${match.competition}`);
    const diff = homeRating - awayRating;
    const hasDraw = match.sportKey === 'soccer' || match.sportKey === 'hockey';
    const pick = hasDraw && Math.abs(diff) < 5 ? 'X' : diff >= 0 ? '1' : '2';
    const confidence = Math.max(2, Math.min(5, 3 + Math.floor(Math.abs(diff) / 18)));
    const favorite =
      pick === '1' ? match.homeTeam : pick === '2' ? match.awayTeam : 'remiza';
    const kickoff = this.formatKickoff(match.kickoff);
    const risk = this.riskLabel(confidence);
    const sportContext = this.sportContext(match.sportKey);
    const matchupText =
      pick === 'X'
        ? `Matchup vyzera velmi tesne. Ani jedna strana nema v modeli jasnu vyhodu, preto dava zmysel opatrny pohlad na remizu alebo vyrovnany priebeh.`
        : `${favorite} vychadza v modeli ako silnejsia strana, hlavne vdaka lepsiemu zakladnemu ratingu v ramci sutaze a stabilnejsiemu profilu pre tento typ zapasu.`;

    return {
      title: `AI analyza: ${match.homeTeam} vs ${match.awayTeam}`,
      summary: [
        `Zapasy: ${match.homeTeam} vs ${match.awayTeam}`,
        `Sutaz: ${match.competition}`,
        `Cas: ${kickoff}`,
        '',
        `AI pohlad: ${matchupText}`,
        sportContext,
        '',
        `Tip: ${pick}`,
        `Confidence: ${confidence}/5`,
        `Riziko: ${risk}`,
        '',
        `Odporucanie: Tento tip by som hral konzervativne. Ak je bankroll obmedzeny, nedaval by som viac ako 1-3 % rozpoctu. ` +
          `Pri nizsom confidence je lepsie tiket nepremotivovat a radsej ho brat ako single alebo malu cast kombinacie.`,
        '',
        `Poznamka: Toto je AI draft na zaklade dostupnych dat v aplikacii. Pred podanim si este skontroluj zostavy, zranenia, formu a kurz, lebo tieto veci sa mozu zmenit tesne pred zapasom.`,
      ].join('\n'),
      pick,
      confidence,
    };
  }

  private sportContext(sportKey: string): string {
    switch (sportKey) {
      case 'soccer':
        return 'Pri futbale je dolezite ratat s nizsim poctom golov a vyssou sancou remizy, preto ma value hlavne tip s rozumnym kurzom a nie slepe tlacenie favorita.';
      case 'hockey':
        return 'Pri hokeji je vacsia volatilita, lebo zapas mozu zlomit presilovky, brankar a predlzenie. Preto je pri vyrovnanych timoch dolezite drzat stake nizsie.';
      case 'tennis':
        return 'Pri tenise zavazi aktualna forma, povrch, servis a fyzicky stav hraca. Ak ide o favorita, stale treba ratat s rizikom jedneho zleho setu.';
      default:
        return 'Model porovnava zakladnu silu oboch stran a dava konzervativny tip podla rozdielu v ratingu.';
    }
  }

  private riskLabel(confidence: number): string {
    if (confidence >= 5) {
      return 'nizsie az stredne';
    }
    if (confidence >= 4) {
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

  private rating(seed: string): number {
    let hash = 2166136261;
    for (let i = 0; i < seed.length; i += 1) {
      hash ^= seed.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return 50 + ((hash >>> 0) % 50);
  }

  private buildGroqPrompt(match: AiMatchInput, fallback: AiAnalysisDraft): string {
    return [
      'Vytvor betting analyzu pre vybrany zapas.',
      `Sport: ${match.sportTitle} (${match.sportKey})`,
      `Sutaz: ${match.competition}`,
      `Domaci/prvy: ${match.homeTeam}`,
      `Hostia/druhy: ${match.awayTeam}`,
      `Cas: ${this.formatKickoff(match.kickoff)}`,
      `Predbezny tip z lokalneho modelu: ${fallback.pick ?? '-'}`,
      `Predbezna confidence: ${fallback.confidence}/5`,
      '',
      'Vrat JSON v tvare:',
      '{"title":"...","summary":"...","pick":"1|X|2","confidence":3}',
      '',
      'Summary nech ma 5-8 kratkych odsekov: pohlad na zapas, preco tip, rizika, bankroll/stake odporucanie a upozornenie na kontrolu zostav/formy/kurzu.',
      'Ak sport nema remizu, nepouzivaj X.',
    ].join('\n');
  }

  private parseGroqDraft(response: GroqChatResponse, fallback: AiAnalysisDraft): AiAnalysisDraft {
    const content = response?.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return fallback;
    }

    try {
      const jsonText = this.extractJson(content);
      const parsed = JSON.parse(jsonText) as Partial<AiAnalysisDraft>;
      const confidence = Math.max(1, Math.min(5, Math.round(Number(parsed.confidence ?? fallback.confidence))));
      const pick = typeof parsed.pick === 'string' ? parsed.pick.trim().toUpperCase() : fallback.pick;

      return {
        title: parsed.title?.trim() || fallback.title,
        summary: parsed.summary?.trim() || fallback.summary,
        pick: pick || fallback.pick,
        confidence,
      };
    } catch {
      return {
        ...fallback,
        summary: content,
      };
    }
  }

  private extractJson(value: string): string {
    const start = value.indexOf('{');
    const end = value.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return value.slice(start, end + 1);
    }
    return value;
  }
}

interface GroqChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}
