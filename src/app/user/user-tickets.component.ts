import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { Component, Input, OnChanges, OnDestroy } from '@angular/core';
import { collection, limit, onSnapshot, orderBy, query, type Unsubscribe } from 'firebase/firestore';
import type { BetTicket } from '../shared/betslip.service';
import { firebaseDb } from '../shared/firebase.config';

@Component({
  selector: 'app-user-tickets',
  standalone: true,
  imports: [CommonModule, DatePipe, DecimalPipe],
  template: `
    <p *ngIf="loading" class="status">Načítavam tikety…</p>
    <p *ngIf="!loading && error" class="status error">{{ error }}</p>

    <div *ngIf="!loading && tickets.length; else noTickets">
      <div *ngFor="let ticket of tickets" class="ticket-card">
        <div><strong>Stávka:</strong> {{ ticket.stake }} €</div>
        <div><strong>Výhra:</strong> {{ ticket.potentialWin | number: '1.2-2' }} €</div>
        <div><strong>Kurzy:</strong> {{ ticket.totalOdds | number: '1.2-2' }}</div>
        <div><strong>Dátum:</strong> {{ ticket.placedAt | date: 'short' }}</div>
        <div class="selections">
          <span *ngFor="let sel of ticket.selections">
            {{ sel.homeTeam }} - {{ sel.awayTeam }} ({{ sel.market }})
          </span>
        </div>
      </div>
    </div>

    <ng-template #noTickets>
      <p *ngIf="!loading">Žiadne tikety.</p>
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
      .ticket-card {
        border: 1px solid #314a72;
        background: #14253f;
        border-radius: 8px;
        margin-bottom: 1rem;
        padding: 1rem;
      }
      .selections {
        margin-top: 0.5rem;
        font-size: 0.95em;
        color: #9fb5d8;
        display: flex;
        flex-wrap: wrap;
        gap: 0.5em;
      }
    `,
  ],
})
export class UserTicketsComponent implements OnChanges, OnDestroy {
  @Input() userId!: string;

  tickets: BetTicket[] = [];
  loading = true;
  error = '';

  private unsubscribe: Unsubscribe | null = null;

  ngOnChanges(): void {
    this.subscribeTickets();
  }

  ngOnDestroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private subscribeTickets(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;

    const userId = (this.userId ?? '').trim();
    if (!userId) {
      this.tickets = [];
      this.loading = false;
      return;
    }

    const db = firebaseDb;
    if (!db) {
      this.error = 'Firestore nie je nakonfigurovaný.';
      this.tickets = [];
      this.loading = false;
      return;
    }

    this.loading = true;
    this.error = '';

    const q = query(collection(db, 'users', userId, 'tickets'), orderBy('placedAt', 'desc'), limit(80));
    this.unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        this.tickets = snapshot.docs
          .map((d) => d.data() as BetTicket)
          .filter(Boolean)
          .map((ticket) => ({ ...ticket, id: ticket.id || '' }))
          .filter((ticket) => Boolean(ticket.id));
        this.loading = false;
      },
      (err) => {
        this.error = err?.message ?? 'Nepodarilo sa načítať tikety.';
        this.tickets = [];
        this.loading = false;
      }
    );
  }
}
