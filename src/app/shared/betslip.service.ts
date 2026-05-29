import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { firebaseDb } from './firebase.config';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  type Unsubscribe,
  writeBatch,
} from 'firebase/firestore';

export interface BetSelection {
  eventId: string;
  sourceEventId?: string;
  league?: string;
  sport: string;
  homeTeam: string;
  awayTeam: string;
  kickoff: string;
  market: string;
  odds: number;
  resultStatus?: 'pending' | 'won' | 'lost' | 'void';
  resultScore?: string;
  resultNote?: string;
}

export interface BetTicket {
  id: string;
  placedAt: string;
  stake: number;
  totalOdds: number;
  potentialWin: number;
  selections: BetSelection[];
  status?: 'pending' | 'won' | 'lost' | 'void';
  settledAt?: string;
  returnedAmount?: number;
}

@Injectable({ providedIn: 'root' })
export class BetSlipService {
  private readonly authService = inject(AuthService);
  private readonly entriesStorageKey = 'tipmaster-betslip';
  private readonly ticketsStoragePrefix = 'tipmaster-bets';
  private readonly budgetStoragePrefix = 'tipmaster-budget';
  private readonly entriesSignal = signal<BetSelection[]>([]);
  private readonly ticketsSignal = signal<BetTicket[]>([]);
  private readonly budgetSignal = signal<number>(100);
  private readonly remoteErrorSignal = signal<string | null>(null);
  private ticketsUnsubscribe: Unsubscribe | null = null;
  private budgetUnsubscribe: Unsubscribe | null = null;

  readonly entries = this.entriesSignal.asReadonly();
  readonly tickets = this.ticketsSignal.asReadonly();
  readonly budget = this.budgetSignal.asReadonly();
  readonly count = computed(() => this.entriesSignal().length);
  readonly totalOdds = computed(() =>
    this.entriesSignal().reduce((acc, entry) => acc * entry.odds, 1)
  );
  readonly remoteError = this.remoteErrorSignal.asReadonly();

  constructor() {
    this.entriesSignal.set(this.loadEntries());

    effect(() => {
      const user = this.authService.currentUser();
      this.ticketsUnsubscribe?.();
      this.ticketsUnsubscribe = null;
      this.budgetUnsubscribe?.();
      this.budgetUnsubscribe = null;

      const userId = user?.id;
      this.ticketsSignal.set(this.loadTickets(userId));
      this.budgetSignal.set(this.loadBudget(userId));

      const db = firebaseDb;
      if (!db || !userId) {
        return;
      }

      this.budgetUnsubscribe = onSnapshot(
        doc(db, 'users', userId),
        (snapshot) => {
          const remoteBudget = snapshot.data()?.['bettingBudget'];
          if (typeof remoteBudget === 'number' && Number.isFinite(remoteBudget) && remoteBudget >= 0) {
            this.budgetSignal.set(remoteBudget);
            this.saveBudget(remoteBudget, userId);
          } else {
            this.persistBudget(this.budgetSignal(), userId);
          }
        },
        () => {
          this.budgetSignal.set(this.loadBudget(userId));
        }
      );

      const q = query(
        collection(db, 'users', userId, 'tickets'),
        orderBy('placedAt', 'desc'),
        limit(80)
      );

      this.ticketsUnsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const tickets = snapshot.docs
            .map((d) => d.data() as BetTicket)
            .filter(Boolean)
            .map((t) => ({ ...t, id: t.id || '' }))
            .filter((t) => Boolean(t.id));
          this.ticketsSignal.set(tickets);
          this.saveTickets(tickets, userId);
          this.remoteErrorSignal.set(null);
        },
        (err: any) => {
          const message = err?.message ? String(err.message) : 'Unknown error';
          const code = err?.code ? String(err.code) : '';
          this.remoteErrorSignal.set(
            `Nepodarilo sa načítať tikety z Firestore. ${code ? `(${code}) ` : ''}${message}`
          );
          this.ticketsSignal.set(this.loadTickets(userId));
        }
      );
    });
  }

  toggleSelection(selection: BetSelection): void {
    if (!this.isSelectionBettable(selection)) {
      this.remoteErrorSignal.set('Tento zapas uz zacal alebo je v minulosti, preto sa neda pridat na tiket.');
      return;
    }

    const current = this.entriesSignal();
    const exists = current.find(
      (item) => item.eventId === selection.eventId && item.market === selection.market
    );

    if (exists) {
      this.entriesSignal.set(
        current.filter(
          (item) => !(item.eventId === selection.eventId && item.market === selection.market)
        )
      );
      this.saveEntries(this.entriesSignal());
      return;
    }

    const withoutSameEvent = current.filter((item) => item.eventId !== selection.eventId);
    this.entriesSignal.set([...withoutSameEvent, selection]);
    this.saveEntries(this.entriesSignal());
    this.remoteErrorSignal.set(null);
  }

  removeSelection(eventId: string, market: string): void {
    this.entriesSignal.set(
      this.entriesSignal().filter((item) => !(item.eventId === eventId && item.market === market))
    );
    this.saveEntries(this.entriesSignal());
  }

  clear(): void {
    this.entriesSignal.set([]);
    this.saveEntries([]);
  }

  isSelected(eventId: string, market: string): boolean {
    return this.entriesSignal().some((item) => item.eventId === eventId && item.market === market);
  }

  placeBet(stake: number): BetTicket | null {
    const user = this.authService.currentUser();
    const userId = user?.id;
    if (!userId) {
      return null;
    }

    const selections = this.entriesSignal();
    if (!selections.length) {
      return null;
    }

    const safeStake = Math.round(Number(stake) * 100) / 100;
    if (!Number.isFinite(safeStake) || safeStake <= 0 || safeStake > this.budgetSignal()) {
      return null;
    }

    const totalOdds = this.totalOdds();
    const userSlug = this.slugify(user?.name ?? user?.email ?? 'user');
    const ticket: BetTicket = {
      id: `ticket-${Date.now()}-${userSlug}`,
      placedAt: new Date().toISOString(),
      stake: safeStake,
      totalOdds,
      potentialWin: totalOdds * safeStake,
      selections: selections.map((selection) => ({ ...selection, resultStatus: 'pending' })),
      status: 'pending',
      returnedAmount: 0,
    };

    const next = [ticket, ...this.ticketsSignal()];
    this.ticketsSignal.set(next);
    this.saveTickets(next, userId);
    this.setBudget(this.budgetSignal() - safeStake, userId);

    const db = firebaseDb;
    if (!db) {
      this.remoteErrorSignal.set('Firestore nie je nakonfigurovaný. Tikety sa ukladajú len lokálne.');
    } else {
      void setDoc(doc(db, 'users', userId, 'tickets', ticket.id), ticket, { merge: true })
        .then(() => this.remoteErrorSignal.set(null))
        .catch((err: any) => {
          const message = err?.message ? String(err.message) : 'Unknown error';
          const code = err?.code ? String(err.code) : '';
          this.remoteErrorSignal.set(
            `Nepodarilo sa uložiť tiket do Firestore. ${code ? `(${code}) ` : ''}${message}`
          );
        });
    }

    this.clear();
    return ticket;
  }

  addToBudget(amount: number): void {
    const userId = this.authService.currentUser()?.id;
    const safeAmount = Math.round(Number(amount) * 100) / 100;
    if (!userId || !Number.isFinite(safeAmount) || safeAmount <= 0) {
      return;
    }

    this.setBudget(this.budgetSignal() + safeAmount, userId);
  }

  settleTicket(ticket: BetTicket): void {
    const userId = this.authService.currentUser()?.id;
    if (!userId || !ticket.id) {
      return;
    }

    const current = this.ticketsSignal();
    const previous = current.find((item) => item.id === ticket.id);
    const nextTicket = this.normalizeTicket(ticket);
    const next = current.map((item) => (item.id === nextTicket.id ? nextTicket : item));
    this.ticketsSignal.set(next);
    this.saveTickets(next, userId);

    if ((previous?.status ?? 'pending') === 'pending' && nextTicket.status === 'won') {
      this.setBudget(this.budgetSignal() + (nextTicket.returnedAmount ?? nextTicket.potentialWin), userId);
    }

    const db = firebaseDb;
    if (db) {
      void setDoc(doc(db, 'users', userId, 'tickets', nextTicket.id), nextTicket, { merge: true })
        .then(() => this.remoteErrorSignal.set(null))
        .catch((err: any) => {
          const message = err?.message ? String(err.message) : 'Unknown error';
          const code = err?.code ? String(err.code) : '';
          this.remoteErrorSignal.set(
            `Nepodarilo sa uložiť vyhodnotený tiket do Firestore. ${code ? `(${code}) ` : ''}${message}`
          );
        });
    }
  }

  clearTickets(): void {
    const userId = this.authService.currentUser()?.id;
    this.ticketsSignal.set([]);
    this.saveTickets([], userId);

    const db = firebaseDb;
    if (!db || !userId) {
      return;
    }

    void (async () => {
      try {
        const snap = await getDocs(collection(db, 'users', userId, 'tickets'));
        const batch = writeBatch(db);
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
        this.remoteErrorSignal.set(null);
      } catch (err: any) {
        const message = err?.message ? String(err.message) : 'Unknown error';
        const code = err?.code ? String(err.code) : '';
        this.remoteErrorSignal.set(
          `Nepodarilo sa vymazať tikety z Firestore. ${code ? `(${code}) ` : ''}${message}`
        );
      }
    })();
  }

  private loadEntries(): BetSelection[] {
    if (typeof localStorage === 'undefined') {
      return [];
    }
    try {
      const raw = localStorage.getItem(this.entriesStorageKey);
      const parsed = raw ? (JSON.parse(raw) as BetSelection[]) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private saveEntries(items: BetSelection[]): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    localStorage.setItem(this.entriesStorageKey, JSON.stringify(items));
  }

  private loadTickets(userId?: string): BetTicket[] {
    if (!userId) {
      return [];
    }
    if (typeof localStorage === 'undefined') {
      return [];
    }
    try {
      const raw = localStorage.getItem(this.ticketsKey(userId));
      const parsed = raw ? (JSON.parse(raw) as BetTicket[]) : [];
      return Array.isArray(parsed) ? parsed.map((ticket) => this.normalizeTicket(ticket)) : [];
    } catch {
      return [];
    }
  }

  private saveTickets(items: BetTicket[], userId?: string): void {
    if (!userId || typeof localStorage === 'undefined') {
      return;
    }
    localStorage.setItem(this.ticketsKey(userId), JSON.stringify(items.map((ticket) => this.normalizeTicket(ticket))));
  }

  private loadBudget(userId?: string): number {
    if (!userId || typeof localStorage === 'undefined') {
      return 100;
    }
    const parsed = Number(localStorage.getItem(this.budgetKey(userId)));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 100;
  }

  private setBudget(value: number, userId?: string): void {
    const safeValue = Math.max(0, Math.round(value * 100) / 100);
    this.budgetSignal.set(safeValue);
    if (!userId) {
      return;
    }
    this.saveBudget(safeValue, userId);
    this.persistBudget(safeValue, userId);
  }

  private saveBudget(value: number, userId: string): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    localStorage.setItem(this.budgetKey(userId), String(value));
  }

  private persistBudget(value: number, userId: string): void {
    const db = firebaseDb;
    if (!db) {
      return;
    }

    void setDoc(doc(db, 'users', userId), { bettingBudget: value }, { merge: true }).catch((err: any) => {
      const message = err?.message ? String(err.message) : 'Unknown error';
      const code = err?.code ? String(err.code) : '';
      this.remoteErrorSignal.set(
        `Nepodarilo sa ulozit rozpocet do Firestore. ${code ? `(${code}) ` : ''}${message}`
      );
    });
  }

  private budgetKey(userId: string): string {
    return `${this.budgetStoragePrefix}:${userId}`;
  }

  private normalizeTicket(ticket: BetTicket): BetTicket {
    const selections = Array.isArray(ticket.selections) ? ticket.selections : [];
    const status = ticket.status ?? this.deriveTicketStatus(selections);
    return {
      ...ticket,
      status,
      returnedAmount: ticket.returnedAmount ?? (status === 'won' ? ticket.potentialWin : 0),
      selections: selections.map((selection) => ({
        ...selection,
        resultStatus: selection.resultStatus ?? 'pending',
      })),
    };
  }

  private deriveTicketStatus(selections: BetSelection[]): BetTicket['status'] {
    if (!selections.length || selections.some((selection) => (selection.resultStatus ?? 'pending') === 'pending')) {
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
  private ticketsKey(userId: string): string {
    return `${this.ticketsStoragePrefix}:${userId}`;
  }

  private slugify(value: string): string {
    const normalized = (value ?? 'user')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/(^-|-$)/g, '')
      .trim();

    return normalized || 'user';
  }

  private isSelectionBettable(selection: BetSelection): boolean {
    const kickoff = new Date(selection.kickoff).getTime();
    if (!Number.isFinite(kickoff)) {
      return true;
    }

    return kickoff > Date.now();
  }
}
