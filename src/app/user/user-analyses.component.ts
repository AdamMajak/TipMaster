import { CommonModule, DatePipe } from '@angular/common';
import { Component, Input, OnChanges, OnDestroy } from '@angular/core';
import { collection, limit, onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore';
import type { UserAnalysis } from '../shared/analysis.service';
import { firebaseDb } from '../shared/firebase.config';

@Component({
  selector: 'app-user-analyses',
  standalone: true,
  imports: [CommonModule, DatePipe],
  template: `
    <p *ngIf="loading" class="status">Načítavam analýzy…</p>
    <p *ngIf="!loading && error" class="status error">{{ error }}</p>

    <div *ngIf="!loading && analyses.length; else noAnalyses">
      <div *ngFor="let analysis of analyses" class="analysis-card">
        <div class="analysis-header">
          <span class="title">{{ analysis.title }}</span>
          <span class="date">{{ analysis.createdAt | date: 'short' }}</span>
        </div>
        <div class="meta">{{ analysis.matchLabel }}</div>
        <div class="description">{{ analysis.summary }}</div>
        <div class="meta-row">
          <span>Pick: <b>{{ analysis.pick || '-' }}</b></span>
          <span>Confidence: <b>{{ analysis.confidence || '-' }}/5</b></span>
          <span>Dátum: <b>{{ analysis.analysisDate }}</b></span>
        </div>
      </div>
    </div>

    <ng-template #noAnalyses>
      <p *ngIf="!loading">Žiadne analýzy.</p>
    </ng-template>
  `,
  styles: [
    `
      :host {
        display: block;
        color: var(--text-main);
      }
      .status {
        margin: 0 0 12px;
        color: #9fb5d8;
      }
      .status.error {
        color: #ffd7d7;
      }
      .analysis-card {
        border: 1px solid #314a72;
        background: #14253f;
        border-radius: 14px;
        margin-bottom: 1rem;
        padding: 1rem 1.1rem;
      }
      .analysis-header {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 0.75rem;
        margin-bottom: 0.35rem;
      }
      .title {
        font-weight: 700;
        font-size: 1.05rem;
        color: #f1f6ff;
      }
      .date {
        font-size: 0.9rem;
        color: #9fb5d8;
      }
      .meta {
        color: #9fb5d8;
        margin-bottom: 0.35rem;
      }
      .description {
        color: #e9f0ff;
      }
      .meta-row {
        display: flex;
        gap: 1rem;
        flex-wrap: wrap;
        margin-top: 0.75rem;
        color: #9fb5d8;
      }
      .meta-row b {
        color: #ffd89e;
      }
    `,
  ],
})
export class UserAnalysesComponent implements OnChanges, OnDestroy {
  @Input() userId!: string;

  analyses: UserAnalysis[] = [];
  loading = true;
  error = '';

  private unsubscribe: Unsubscribe | null = null;

  ngOnChanges(): void {
    this.subscribeAnalyses();
  }

  ngOnDestroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private subscribeAnalyses(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;

    const userId = (this.userId ?? '').trim();
    if (!userId) {
      this.analyses = [];
      this.loading = false;
      return;
    }

    const db = firebaseDb;
    if (!db) {
      this.error = 'Firestore nie je nakonfigurovaný.';
      this.analyses = [];
      this.loading = false;
      return;
    }

    this.loading = true;
    this.error = '';

    const q = query(collection(db, 'analyses'), where('authorId', '==', userId), limit(80));
    this.unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        this.analyses = snapshot.docs
          .map((d) => ({ ...(d.data() as any), id: d.id } as UserAnalysis))
          .filter(Boolean)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        this.loading = false;
      },
      (err) => {
        this.error = err?.message ?? 'Nepodarilo sa načítať analýzy.';
        this.analyses = [];
        this.loading = false;
      }
    );
  }
}
