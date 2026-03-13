import { Injectable } from '@angular/core';

export interface UserAnalysis {
  id: string;
  createdAt: string;
  analysisDate: string;
  matchLabel: string;
  kickoff?: string;
  title: string;
  summary: string;
  pick?: string;
  confidence?: number;
}

@Injectable({ providedIn: 'root' })
export class AnalysisService {
  private readonly storageKey = 'tipmaster-analyses';

  getAll(): UserAnalysis[] {
    if (typeof localStorage === 'undefined') {
      return [];
    }
    try {
      const raw = localStorage.getItem(this.storageKey);
      const parsed = raw ? (JSON.parse(raw) as UserAnalysis[]) : [];
      return Array.isArray(parsed) ? parsed : [];
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
    const current = this.getAll();
    const next = current.filter((item) => item.id !== id);
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
    localStorage.setItem(this.storageKey, JSON.stringify(items));
  }
}
