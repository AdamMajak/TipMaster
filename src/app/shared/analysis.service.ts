import { Injectable, inject } from '@angular/core';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  query,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { AuthService } from './auth.service';
import { firebaseDb } from './firebase.config';

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

  async getByDate(analysisDate: string): Promise<UserAnalysis[]> {
    const dateKey = (analysisDate ?? '').trim();
    if (!dateKey) {
      return [];
    }

    const db = firebaseDb;
    if (!db) {
      return this.getAll().filter((item) => item.analysisDate === dateKey);
    }

    try {
      const q = query(collection(db, 'analyses'), where('analysisDate', '==', dateKey));
      const snapshot = await getDocs(q);
      const analyses = snapshot.docs
        .map((d) => this.normalizeAnalysis({ ...(d.data() as any), id: d.id }))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const withRatings = await Promise.all(analyses.map((item) => this.attachRatings(item)));

      const user = this.authService.currentUser();
      if (user) {
        const myQ = query(
          collection(db, 'users', user.id, 'analyses'),
          where('analysisDate', '==', dateKey),
          limit(200)
        );
        const mySnap = await getDocs(myQ);
        const mine = mySnap.docs.map((d) => this.normalizeAnalysis({ ...(d.data() as any), id: d.id }));
        const merged = this.mergeLists(withRatings, mine).sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        this.mergeIntoLocal(merged);
        return merged;
      }

      this.mergeIntoLocal(withRatings);
      return withRatings;
    } catch {
      return this.getAll().filter((item) => item.analysisDate === dateKey);
    }
  }

  async add(analysis: UserAnalysis): Promise<UserAnalysis[]> {
    const current = this.getAll();
    const next = [analysis, ...current];
    this.save(next);

    const db = firebaseDb;
    if (db) {
      try {
        const { ratings, ...payload } = this.normalizeAnalysis(analysis);
        await setDoc(doc(db, 'analyses', payload.id), payload, { merge: true });

        const user = this.authService.currentUser();
        if (user) {
          await setDoc(doc(db, 'users', user.id, 'analyses', payload.id), payload, { merge: true });
        }
      } catch {
        // Ignore remote failures; local cache stays available.
      }
    }
    return next;
  }

  async remove(id: string): Promise<UserAnalysis[]> {
    const user = this.authService.currentUser();
    if (!user) {
      return this.getAll();
    }

    const current = this.getAll();
    const next = current.filter(
      (item) => !(item.id === id && (item.authorId === user.id || user.role === 'admin'))
    );
    this.save(next);

    const db = firebaseDb;
    if (db) {
      try {
        await deleteDoc(doc(db, 'analyses', id));
        await deleteDoc(doc(db, 'users', user.id, 'analyses', id));
      } catch {
        // Keep local delete even if remote fails.
      }
    }
    return next;
  }

  async removeByAuthor(authorId: string): Promise<UserAnalysis[]> {
    const user = this.authService.currentUser();
    if (!user || user.role !== 'admin') {
      return this.getAll();
    }

    const current = this.getAll();
    const next = current.filter((item) => item.authorId !== authorId);
    this.save(next);

    const db = firebaseDb;
    if (db) {
      try {
        const q = query(collection(db, 'analyses'), where('authorId', '==', authorId));
        const snapshot = await getDocs(q);
        const batch = writeBatch(db);
        snapshot.docs.forEach((d) => batch.delete(d.ref));

        const myQ = query(collection(db, 'users', authorId, 'analyses'));
        const mySnap = await getDocs(myQ);
        mySnap.docs.forEach((d) => batch.delete(d.ref));

        await batch.commit();
      } catch {
        // Keep local delete even if remote fails.
      }
    }
    return next;
  }

  async addRating(analysisId: string, stars: number, comment?: string): Promise<UserAnalysis[]> {
    const user = this.authService.currentUser();
    if (!user) {
      return this.getAll();
    }

    const normalizedStars = this.clampStars(stars);
    const normalizedComment = comment?.trim() || undefined;
    if (normalizedStars === null && !normalizedComment) {
      return this.getAll();
    }

    const rating: AnalysisRating = {
      authorId: user.id,
      authorName: user.name,
      createdAt: new Date().toISOString(),
      stars: normalizedStars ?? 0,
      comment: normalizedComment,
    };

    const current = this.getAll();
    const next = current.map((analysis) => {
      if (analysis.id !== analysisId || analysis.authorId === user.id) {
        return analysis;
      }

      const ratings = analysis.ratings.filter((item) => item.authorId !== user.id);
      return { ...analysis, ratings: [rating, ...ratings] };
    });

    this.save(next);

    const db = firebaseDb;
    if (db) {
      try {
        await setDoc(doc(db, 'analyses', analysisId, 'ratings', user.id), rating, { merge: true });
      } catch {
        // Ignore remote failures.
      }
    }
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

  private async attachRatings(analysis: UserAnalysis): Promise<UserAnalysis> {
    const db = firebaseDb;
    if (!db) {
      return analysis;
    }

    try {
      const ratingsSnap = await getDocs(collection(db, 'analyses', analysis.id, 'ratings'));
      const ratings = ratingsSnap.docs
        .map((d) => this.normalizeRating(d.data() as any))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return { ...analysis, ratings };
    } catch {
      return analysis;
    }
  }

  private mergeIntoLocal(items: UserAnalysis[]): void {
    const existing = this.getAll();
    const byId = new Map(existing.map((item) => [item.id, item]));
    items.forEach((item) => byId.set(item.id, item));
    this.save(Array.from(byId.values()));
  }

  private mergeLists(a: UserAnalysis[], b: UserAnalysis[]): UserAnalysis[] {
    const byId = new Map<string, UserAnalysis>();
    (a ?? []).forEach((item) => byId.set(item.id, item));
    (b ?? []).forEach((item) => byId.set(item.id, item));
    return Array.from(byId.values());
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
