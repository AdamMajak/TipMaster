import { Injectable, signal } from '@angular/core';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { ADMIN_EMAILS } from './admin.config';
import { firebaseDb } from './firebase.config';

export type UserRole = 'user' | 'admin';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  lastLoginAt?: string;
  role: UserRole;
  disabled: boolean;
}

type SyncableUser = Pick<UserProfile, 'id' | 'email' | 'name' | 'createdAt'>;

@Injectable({ providedIn: 'root' })
export class UserAdminService {
  private readonly storageKey = 'tipmaster-admin-users';
  private readonly usersSignal = signal<UserProfile[]>(this.loadUsers());
  private readonly versionSignal = signal(0);
  private readonly syncSourceSignal = signal<'local' | 'firestore'>('local');
  private readonly syncErrorSignal = signal<string | null>(null);
  private readonly adminListSourceSignal = signal<'local' | 'firestore'>('local');
  private readonly adminListErrorSignal = signal<string | null>(null);
  private usersUnsubscribe: Unsubscribe | null = null;

  readonly version = this.versionSignal.asReadonly();
  readonly syncSource = this.syncSourceSignal.asReadonly();
  readonly syncError = this.syncErrorSignal.asReadonly();
  readonly adminListSource = this.adminListSourceSignal.asReadonly();
  readonly adminListError = this.adminListErrorSignal.asReadonly();

  getAllUsers(): UserProfile[] {
    return this.usersSignal();
  }

  getUserById(id: string): UserProfile | null {
    return this.usersSignal().find((item) => item.id === id) ?? null;
  }

  watchAllUsers(enabled: boolean): void {
    if (!enabled) {
      this.usersUnsubscribe?.();
      this.usersUnsubscribe = null;
      this.adminListSourceSignal.set('local');
      this.adminListErrorSignal.set(null);
      this.refreshUsers();
      return;
    }

    const db = firebaseDb;
    if (!db) {
      this.adminListSourceSignal.set('local');
      this.adminListErrorSignal.set('Firestore is not configured.');
      this.refreshUsers();
      return;
    }

    this.usersUnsubscribe?.();
    const q = query(collection(db, 'users'), orderBy('lastLoginAt', 'desc'));
    this.usersUnsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const nextUsers = snapshot.docs.map((d) => this.normalizeUser({ ...(d.data() as any), id: d.id }));
        this.adminListSourceSignal.set('firestore');
        this.adminListErrorSignal.set(null);
        this.saveUsers(nextUsers);
      },
      (err) => {
        this.adminListSourceSignal.set('local');
        this.adminListErrorSignal.set(err?.message ?? 'Failed to sync users from Firestore.');
        this.refreshUsers();
      }
    );
  }

  watchUser(userId: string, onChange: (profile: UserProfile | null) => void): () => void {
    const db = firebaseDb;
    if (!db) {
      onChange(this.getUserById(userId));
      return () => undefined;
    }

    const unsub = onSnapshot(
      doc(db, 'users', userId),
      (snap) => {
        if (!snap.exists()) {
          onChange(null);
          return;
        }
        onChange(this.normalizeUser({ ...(snap.data() as any), id: snap.id }));
      },
      () => onChange(this.getUserById(userId))
    );
    return () => unsub();
  }

  async inviteAdmin(email: string): Promise<{ ok: true } | { ok: false; message: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      return { ok: false, message: 'Enter an email address.' };
    }

    if (!normalizedEmail.includes('@')) {
      return { ok: false, message: 'Email format is invalid.' };
    }

    const db = firebaseDb;
    if (!db) {
      const existing = this.findUserByEmail(normalizedEmail);
      const nextUser = this.normalizeUser({
        ...existing,
        id: existing?.id ?? this.pendingUserId(normalizedEmail),
        email: normalizedEmail,
        name: existing?.name ?? normalizedEmail.split('@')[0],
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        lastLoginAt: existing?.lastLoginAt,
        role: 'admin',
        disabled: existing?.disabled ?? false,
      });

      this.upsertUser(nextUser);
      return { ok: true };
    }

    try {
      await setDoc(doc(db, 'adminInvites', normalizedEmail), {
        email: normalizedEmail,
        role: 'admin',
        createdAt: new Date().toISOString(),
      });
      return { ok: true };
    } catch (err: any) {
      return { ok: false, message: err?.message ?? 'Failed to create admin invite.' };
    }
  }

  async syncUser(user: SyncableUser): Promise<UserProfile> {
    const normalizedEmail = user.email.trim().toLowerCase();

    const db = firebaseDb;
    if (!db) {
      const existing = this.getUserById(user.id) ?? this.findUserByEmail(normalizedEmail);
      const nextUser = this.normalizeUser({
        ...existing,
        ...user,
        lastLoginAt: new Date().toISOString(),
        role: this.resolveRole(normalizedEmail, existing?.role),
        disabled: existing?.disabled ?? false,
      });

      this.upsertUser(nextUser, existing?.id);
      this.syncErrorSignal.set(null);
      return nextUser;
    }

    try {
      const userRef = doc(db, 'users', user.id);
      const existingSnap = await getDoc(userRef);
      const existing = existingSnap.exists() ? this.normalizeUser({ ...(existingSnap.data() as any), id: user.id }) : null;

      let desiredRole = this.resolveRole(normalizedEmail, existing?.role);
      if (desiredRole !== 'admin') {
        const inviteSnap = await getDoc(doc(db, 'adminInvites', normalizedEmail));
        if (inviteSnap.exists()) {
          desiredRole = 'admin';
        }
      }

      const nextUser = this.normalizeUser({
        ...existing,
        ...user,
        lastLoginAt: new Date().toISOString(),
        role: desiredRole,
        disabled: existing?.disabled ?? false,
      });

      await setDoc(
        userRef,
        {
          email: nextUser.email,
          name: nextUser.name,
          createdAt: nextUser.createdAt,
          lastLoginAt: nextUser.lastLoginAt ?? null,
          role: nextUser.role,
          disabled: nextUser.disabled,
        },
        { merge: true }
      );

      this.upsertUser(nextUser, existing?.id);
      this.syncSourceSignal.set('firestore');
      this.syncErrorSignal.set(null);
      return nextUser;
    } catch (err: any) {
      this.syncSourceSignal.set('local');
      this.syncErrorSignal.set(err?.message ?? 'Failed to sync user profile.');

      const existing = this.getUserById(user.id) ?? this.findUserByEmail(normalizedEmail);
      const nextUser = this.normalizeUser({
        ...existing,
        ...user,
        lastLoginAt: new Date().toISOString(),
        role: this.resolveRole(normalizedEmail, existing?.role),
        disabled: existing?.disabled ?? false,
      });
      this.upsertUser(nextUser, existing?.id);
      return nextUser;
    }
  }

  async setRole(userId: string, role: UserRole): Promise<void> {
    const target = this.getUserById(userId);
    if (!target || this.isProtectedAdmin(target)) {
      return;
    }

    const next = { ...target, role: this.resolveRole(target.email, role) };
    this.upsertUser(next);

    const db = firebaseDb;
    if (!db) {
      return;
    }

    try {
      await setDoc(doc(db, 'users', userId), { role: next.role }, { merge: true });
    } catch (err: any) {
      this.syncErrorSignal.set(err?.message ?? 'Failed to update user role.');
    }
  }

  async setDisabled(userId: string, disabled: boolean): Promise<void> {
    const target = this.getUserById(userId);
    if (!target || (this.isProtectedAdmin(target) && disabled)) {
      return;
    }

    const next = { ...target, disabled };
    this.upsertUser(next);

    const db = firebaseDb;
    if (!db) {
      return;
    }

    try {
      await setDoc(doc(db, 'users', userId), { disabled: next.disabled }, { merge: true });
    } catch (err: any) {
      this.syncErrorSignal.set(err?.message ?? 'Failed to update user status.');
    }
  }

  async removeUser(userId: string): Promise<void> {
    const target = this.getUserById(userId);
    if (!target || this.isProtectedAdmin(target)) {
      return;
    }

    const nextUsers = this.usersSignal().filter((item) => item.id !== userId);
    this.saveUsers(nextUsers);

    const db = firebaseDb;
    if (!db) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'users', userId));
    } catch (err: any) {
      this.syncErrorSignal.set(err?.message ?? 'Failed to delete user.');
    }
  }

  isAdmin(user: Pick<UserProfile, 'email' | 'role'> | null | undefined): boolean {
    if (!user) {
      return false;
    }

    return user.role === 'admin' || this.isConfiguredAdminEmail(user.email);
  }

  isProtectedAdmin(user: Pick<UserProfile, 'email' | 'role'> | null | undefined): boolean {
    if (!user) {
      return false;
    }

    return this.isConfiguredAdminEmail(user.email);
  }

  private refreshUsers(): void {
    this.usersSignal.set(this.loadUsers());
    this.versionSignal.update((value) => value + 1);
  }

  private upsertUser(user: UserProfile, previousId?: string): void {
    const nextUsers = this.usersSignal().filter((item) => item.id !== user.id && item.email !== user.email);

    if (previousId && previousId !== user.id) {
      const cleanedUsers = nextUsers.filter((item) => item.id !== previousId);
      cleanedUsers.push(user);
      this.saveUsers(cleanedUsers);
      return;
    }

    nextUsers.push(user);
    this.saveUsers(nextUsers);
  }

  private saveUsers(users: UserProfile[]): void {
    const normalizedUsers = users
      .map((item) => this.normalizeUser(item))
      .sort((a, b) => new Date(b.lastLoginAt ?? b.createdAt).getTime() - new Date(a.lastLoginAt ?? a.createdAt).getTime());

    this.usersSignal.set(normalizedUsers);
    this.versionSignal.update((value) => value + 1);

    if (typeof localStorage === 'undefined') {
      return;
    }

    localStorage.setItem(this.storageKey, JSON.stringify(normalizedUsers));
  }

  private loadUsers(): UserProfile[] {
    if (typeof localStorage === 'undefined') {
      return [];
    }

    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) {
        return [];
      }

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.map((item) => this.normalizeUser(item));
    } catch {
      return [];
    }
  }

  private normalizeUser(user: Partial<UserProfile>): UserProfile {
    const email = user.email?.trim().toLowerCase() ?? '';
    const role = this.resolveRole(email, user.role);

    return {
      id: user.id ?? '',
      email,
      name: user.name?.trim() || (email ? email.split('@')[0] : 'User'),
      createdAt: user.createdAt ?? new Date().toISOString(),
      lastLoginAt: user.lastLoginAt,
      role,
      disabled: Boolean(user.disabled),
    };
  }

  private resolveRole(email: string, currentRole?: UserRole): UserRole {
    if (this.isConfiguredAdminEmail(email)) {
      return 'admin';
    }

    return currentRole === 'admin' ? 'admin' : 'user';
  }

  private isConfiguredAdminEmail(email: string): boolean {
    return ADMIN_EMAILS.includes(email.trim().toLowerCase());
  }

  private findUserByEmail(email: string): UserProfile | null {
    return this.usersSignal().find((item) => item.email === email) ?? null;
  }

  private pendingUserId(email: string): string {
    return `pending:${encodeURIComponent(email)}`;
  }
}
