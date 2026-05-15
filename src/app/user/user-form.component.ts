import { CommonModule, DecimalPipe } from '@angular/common';
import { Component, Input, OnChanges, OnDestroy } from '@angular/core';
import { collection, limit, onSnapshot, query, type Unsubscribe } from 'firebase/firestore';
import type { UserAnalysis } from '../shared/analysis.service';
import type { BetTicket } from '../shared/betslip.service';
import { firebaseDb } from '../shared/firebase.config';

type UserFormSummary = {
  ticketsCount: number;
  totalStake: number;
  totalPotentialWin: number;
  analysesCount: number;
  avgConfidence: number | null;
};

@Component({
  selector: 'app-user-form',
  standalone: true,
  imports: [CommonModule, DecimalPipe],
  template: `
    <p *ngIf="loading" class="status">Načítavam štatistiky…</p>
    <p *ngIf="!loading && error" class="status error">{{ error }}</p>

    <div *ngIf="!loading && summary" class="form-summary">
      <div><strong>Tikety:</strong> {{ summary.ticketsCount }}</div>
      <div><strong>Stávky:</strong> {{ summary.totalStake | number: '1.0-0' }} €</div>
      <div><strong>Potenciál:</strong> {{ summary.totalPotentialWin | number: '1.2-2' }} €</div>
      <div><strong>Analýzy:</strong> {{ summary.analysesCount }}</div>
      <div>
        <strong>Avg confidence:</strong>
        {{ summary.avgConfidence === null ? '-' : (summary.avgConfidence | number: '1.1-1') + '/5' }}
      </div>
    </div>
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
      .form-summary {
        border: 1px solid #314a72;
        background: #14253f;
        border-radius: 14px;
        padding: 1rem;
        display: grid;
        gap: 0.75rem;
      }
      .form-summary strong {
        color: #e9f0ff;
      }
    `,
  ],
})
export class UserFormComponent implements OnChanges, OnDestroy {
  @Input() userId!: string;

  loading = true;
  error = '';
  summary: UserFormSummary | null = null;

  private unsubscribeTickets: Unsubscribe | null = null;
  private unsubscribeAnalyses: Unsubscribe | null = null;

  private lastTickets: BetTicket[] = [];
  private lastAnalyses: UserAnalysis[] = [];

  ngOnChanges(): void {
    this.subscribeData();
  }

  ngOnDestroy(): void {
    this.unsubscribeTickets?.();
    this.unsubscribeTickets = null;
    this.unsubscribeAnalyses?.();
    this.unsubscribeAnalyses = null;
  }

  private subscribeData(): void {
    this.unsubscribeTickets?.();
    this.unsubscribeTickets = null;
    this.unsubscribeAnalyses?.();
    this.unsubscribeAnalyses = null;

    const userId = (this.userId ?? '').trim();
    if (!userId) {
      this.loading = false;
      this.error = '';
      this.summary = null;
      return;
    }

    const db = firebaseDb;
    if (!db) {
      this.error = 'Firestore nie je nakonfigurovaný.';
      this.loading = false;
      this.summary = null;
      return;
    }

    this.loading = true;
    this.error = '';
    this.summary = null;
    this.lastTickets = [];
    this.lastAnalyses = [];

    this.unsubscribeTickets = onSnapshot(
      query(collection(db, 'users', userId, 'tickets'), limit(200)),
      (snapshot) => {
        this.lastTickets = snapshot.docs.map((d) => d.data() as BetTicket).filter(Boolean);
        this.recompute();
      },
      (err) => {
        this.error = err?.message ?? 'Nepodarilo sa načítať tikety.';
        this.loading = false;
      }
    );

    this.unsubscribeAnalyses = onSnapshot(
      query(collection(db, 'users', userId, 'analyses'), limit(200)),
      (snapshot) => {
        this.lastAnalyses = snapshot.docs
          .map((d) => ({ ...(d.data() as any), id: d.id } as UserAnalysis))
          .filter(Boolean);
        this.recompute();
      },
      (err) => {
        this.error = err?.message ?? 'Nepodarilo sa načítať analýzy.';
        this.loading = false;
      }
    );
  }

  private recompute(): void {
    const tickets = this.lastTickets;
    const analyses = this.lastAnalyses;

    const totalStake = tickets.reduce((acc, t) => acc + (Number(t.stake) || 0), 0);
    const totalPotentialWin = tickets.reduce((acc, t) => acc + (Number(t.potentialWin) || 0), 0);
    const confidenceValues = analyses
      .map((a) => (a.confidence === undefined || a.confidence === null ? null : Number(a.confidence)))
      .filter((v): v is number => v !== null && !Number.isNaN(v));
    const avgConfidence = confidenceValues.length
      ? confidenceValues.reduce((acc, v) => acc + v, 0) / confidenceValues.length
      : null;

    this.summary = {
      ticketsCount: tickets.length,
      totalStake,
      totalPotentialWin,
      analysesCount: analyses.length,
      avgConfidence,
    };
    this.loading = false;
  }
}

