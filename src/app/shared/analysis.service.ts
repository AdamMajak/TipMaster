import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';

export interface AnalysisRating {
  authorId: string;
  authorName: string;
  createdAt: string;
  stars: number;
  comment?: string;
}

export interface UserAnalysis {
  id: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  analysisDate: string;
  matchLabel: string;
  relatedMatches?: string[];
  kickoff?: string;
  title: string;
  summary: string;
  pick?: string;
  confidence?: number;
  ratings: AnalysisRating[];
}

@Injectable({ providedIn: 'root' })
export class AnalysisService {
  private readonly authService = inject(AuthService);
  private readonly storageKey = 'tipmaster-analyses';
  private readonly legacyStorageKeyPrefix = 'tipmaster-analyses';

  getAll(): UserAnalysis[] {
    if (typeof localStorage === 'undefined') {
      return [];
    }

    this.migrateLegacyAnalyses();

    try {
      const raw = localStorage.getItem(this.storageKey);
      const parsed = raw ? (JSON.parse(raw) as UserAnalysis[]) : [];
      return Array.isArray(parsed) ? parsed.map((item) => this.normalizeAnalysis(item)) : [];
    } catch {
      return [];
    }
  }

  add(analysis: UserAnalysis): UserAnalysis[] {
    const current = this.getAll();
    const next = [analysis, ...current];
    this.save(next);
    return next;
  }

  remove(id: string): UserAnalysis[] {
    const userId = this.authService.currentUser()?.id;
    if (!userId) {
      return this.getAll();
    }
    const current = this.getAll();
    const next = current.filter((item) => !(item.id === id && item.authorId === userId));
    this.save(next);
    return next;
  }

  addRating(analysisId: string, stars: number, comment?: string): UserAnalysis[] {
    const user = this.authService.currentUser();
    if (!user) {
      return this.getAll();
    }

    const normalizedStars = this.clampStars(stars);
    const normalizedComment = comment?.trim() || undefined;
    if (normalizedStars === null && !normalizedComment) {
      return this.getAll();
    }

    const current = this.getAll();
    const next = current.map((analysis) => {
      if (analysis.id !== analysisId || analysis.authorId === user.id) {
        return analysis;
      }

      const rating: AnalysisRating = {
        authorId: user.id,
        authorName: user.name,
        createdAt: new Date().toISOString(),
        stars: normalizedStars ?? 0,
        comment: normalizedComment,
      };

      const ratings = analysis.ratings.filter((item) => item.authorId !== user.id);
      return { ...analysis, ratings: [rating, ...ratings] };
    });

    this.save(next);
    return next;
  }

  replaceAll(items: UserAnalysis[]): void {
    this.save(items);
  }

  private save(items: UserAnalysis[]): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    localStorage.setItem(
      this.storageKey,
      JSON.stringify(items.map((item) => this.normalizeAnalysis(item)))
    );
  }

  private normalizeAnalysis(item: UserAnalysis): UserAnalysis {
    return {
      ...item,
      authorId: item.authorId ?? 'unknown',
      authorName: item.authorName ?? 'Unknown user',
      relatedMatches: Array.isArray(item.relatedMatches)
        ? item.relatedMatches.filter((match): match is string => typeof match === 'string' && Boolean(match.trim()))
        : undefined,
      ratings: Array.isArray(item.ratings) ? item.ratings.map((rating) => this.normalizeRating(rating)) : [],
    };
  }

  private normalizeRating(rating: AnalysisRating): AnalysisRating {
    return {
      authorId: rating.authorId ?? 'unknown',
      authorName: rating.authorName ?? 'Unknown user',
      createdAt: rating.createdAt ?? new Date().toISOString(),
      stars: this.clampStars(rating.stars) ?? 0,
      comment: rating.comment?.trim() || undefined,
    };
  }

  private migrateLegacyAnalyses(): void {
    const user = this.authService.currentUser();
    if (!user || typeof localStorage === 'undefined') {
      return;
    }

    const legacyKey = `${this.legacyStorageKeyPrefix}:${user.id}`;
    const legacyRaw = localStorage.getItem(legacyKey);
    if (!legacyRaw) {
      return;
    }

    try {
      const parsed = JSON.parse(legacyRaw) as Array<Omit<UserAnalysis, 'authorId' | 'authorName' | 'ratings'>>;
      if (!Array.isArray(parsed) || !parsed.length) {
        localStorage.removeItem(legacyKey);
        return;
      }

      const existing = this.readShared();
      const existingIds = new Set(existing.map((item) => item.id));
      const migrated = parsed
        .filter((item) => item?.id && !existingIds.has(item.id))
        .map((item) =>
          this.normalizeAnalysis({
            ...item,
            authorId: user.id,
            authorName: user.name,
            ratings: [],
          })
        );

      if (migrated.length) {
        this.save([...migrated, ...existing]);
      }

      localStorage.removeItem(legacyKey);
    } catch {
      localStorage.removeItem(legacyKey);
    }
  }

  private readShared(): UserAnalysis[] {
    try {
      const raw = localStorage.getItem(this.storageKey);
      const parsed = raw ? (JSON.parse(raw) as UserAnalysis[]) : [];
      return Array.isArray(parsed) ? parsed.map((item) => this.normalizeAnalysis(item)) : [];
    } catch {
      return [];
    }
  }

  private clampStars(stars: number | null | undefined): number | null {
    if (stars === null || stars === undefined || Number.isNaN(Number(stars))) {
      return null;
    }

    return Math.max(0, Math.min(5, Math.round(Number(stars))));
  }
}
