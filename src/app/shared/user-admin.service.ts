import { Injectable, signal } from '@angular/core';
import { ADMIN_EMAILS } from './admin.config';

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
  private readonly syncSourceSignal = signal<'local'>('local');
  private readonly syncErrorSignal = signal<string | null>(null);

  readonly version = this.versionSignal.asReadonly();
  readonly syncSource = this.syncSourceSignal.asReadonly();
  readonly syncError = this.syncErrorSignal.asReadonly();

  getAllUsers(): UserProfile[] {
    return this.usersSignal();
  }

  getUserById(id: string): UserProfile | null {
    return this.usersSignal().find((item) => item.id === id) ?? null;
  }

  watchAllUsers(enabled: boolean): void {
    if (!enabled) {
      this.versionSignal.update((value) => value + 1);
      return;
    }

    this.refreshUsers();
  }

  watchUser(userId: string, onChange: (profile: UserProfile | null) => void): () => void {
    onChange(this.getUserById(userId));
    return () => undefined;
  }

  async inviteAdmin(email: string): Promise<{ ok: true } | { ok: false; message: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      return { ok: false, message: 'Enter an email address.' };
    }

    if (!normalizedEmail.includes('@')) {
      return { ok: false, message: 'Email format is invalid.' };
    }

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

  async syncUser(user: SyncableUser): Promise<UserProfile> {
    const normalizedEmail = user.email.trim().toLowerCase();
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

  async setRole(userId: string, role: UserRole): Promise<void> {
    const target = this.getUserById(userId);
    if (!target || this.isProtectedAdmin(target)) {
      return;
    }

    this.upsertUser({ ...target, role: this.resolveRole(target.email, role) });
  }

  async setDisabled(userId: string, disabled: boolean): Promise<void> {
    const target = this.getUserById(userId);
    if (!target || (this.isProtectedAdmin(target) && disabled)) {
      return;
    }

    this.upsertUser({ ...target, disabled });
  }

  async removeUser(userId: string): Promise<void> {
    const target = this.getUserById(userId);
    if (!target || this.isProtectedAdmin(target)) {
      return;
    }

    const nextUsers = this.usersSignal().filter((item) => item.id !== userId);
    this.saveUsers(nextUsers);
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
