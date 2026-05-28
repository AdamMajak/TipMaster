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
    <p *ngIf="loading" class="status">Nacitavam tikety...</p>
    <p *ngIf="!loading && error" class="status error">{{ error }}</p>

    <div *ngIf="!loading && tickets.length; else noTickets">
      <div *ngFor="let ticket of tickets" class="ticket-card">
        <div class="ticket-head">
          <div>
            <strong>{{ ticket.placedAt | date: 'short' }}</strong>
            <span>{{ ticket.selections.length }} tipy</span>
          </div>
          <span class="ticket-status" [class.won]="ticket.status === 'won'" [class.lost]="ticket.status === 'lost'">
            {{ statusLabel(ticket.status) }}
          </span>
        </div>
        <div class="ticket-metrics">
          <span>Stavka <b>{{ ticket.stake }} EUR</b></span>
          <span>Kurz <b>{{ ticket.totalOdds | number: '1.2-2' }}</b></span>
          <span>Vyhra <b>{{ ticket.potentialWin | number: '1.2-2' }} EUR</b></span>
        </div>
        <div class="selections">
          <div *ngFor="let sel of ticket.selections" class="selection-row">
            <div>
              <strong>{{ sel.homeTeam }} - {{ sel.awayTeam }}</strong>
              <span>Tip {{ sel.market }} | Kurz {{ sel.odds }}</span>
            </div>
            <span>{{ statusLabel(sel.resultStatus) }} {{ sel.resultScore || '' }}</span>
          </div>
        </div>
      </div>
    </div>

    <ng-template #noTickets>
      <p *ngIf="!loading">Ziadne tikety.</p>
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
        display: grid;
        gap: 10px;
      }
      .ticket-head,
      .selection-row {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        align-items: flex-start;
      }
      .ticket-head span,
      .selection-row span {
        color: #9fb5d8;
        font-size: 0.82rem;
      }
      .ticket-status {
        border: 1px solid #3f5f8b;
        background: #1c2e4c;
        border-radius: 999px;
        padding: 4px 9px;
        color: #dce9ff;
        font-size: 0.76rem;
        font-weight: 700;
      }
      .ticket-status.won {
        border-color: rgba(78, 191, 121, 0.38);
        background: rgba(78, 191, 121, 0.16);
        color: #d8ffe7;
      }
      .ticket-status.lost {
        border-color: rgba(255, 120, 120, 0.32);
        background: rgba(255, 120, 120, 0.16);
        color: #ffd7d7;
      }
      .ticket-metrics {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
      }
      .ticket-metrics span {
        border: 1px solid #263f64;
        background: #101f36;
        border-radius: 7px;
        padding: 8px;
        color: #9fb5d8;
        font-size: 0.76rem;
      }
      .ticket-metrics b {
        display: block;
        color: #fff1d9;
        margin-top: 2px;
      }
      .selections {
        display: grid;
        gap: 8px;
      }
      .selection-row {
        border-top: 1px solid #263f64;
        padding-top: 8px;
      }
      .selection-row strong {
        color: #f1f6ff;
      }
      @media (max-width: 640px) {
        .ticket-head,
        .selection-row {
          display: grid;
        }
        .ticket-metrics {
          grid-template-columns: 1fr;
        }
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

  statusLabel(status: string | undefined): string {
    switch (status) {
      case 'won':
        return 'Vyhrany';
      case 'lost':
        return 'Prehrany';
      case 'void':
        return 'Storno';
      default:
        return 'Caka';
    }
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
      this.error = 'Firestore nie je nakonfigurovany.';
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
        this.error = err?.message ?? 'Nepodarilo sa nacitat tikety.';
        this.tickets = [];
        this.loading = false;
      }
    );
  }
}
