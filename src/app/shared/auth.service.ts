import { Injectable, computed, signal } from '@angular/core';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

interface StoredAuthUser extends AuthUser {
  password: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly usersKey = 'tipmaster-users';
  private readonly sessionKey = 'tipmaster-session';
  private readonly currentUserSignal = signal<AuthUser | null>(this.loadSessionUser());

  readonly currentUser = this.currentUserSignal.asReadonly();
  readonly isAuthenticated = computed(() => Boolean(this.currentUserSignal()));

  register(name: string, email: string, password: string): { ok: true } | { ok: false; message: string } {
    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = password.trim();

    if (!normalizedName || !normalizedEmail || !normalizedPassword) {
      return { ok: false, message: 'Fill in name, email and password.' };
    }

    if (!normalizedEmail.includes('@')) {
      return { ok: false, message: 'Email format is invalid.' };
    }

    if (normalizedPassword.length < 4) {
      return { ok: false, message: 'Password must have at least 4 characters.' };
    }

    const users = this.loadUsers();
    if (users.some((user) => user.email === normalizedEmail)) {
      return { ok: false, message: 'Account with this email already exists.' };
    }

    const created: StoredAuthUser = {
      id: `user-${Date.now()}`,
      email: normalizedEmail,
      name: normalizedName,
      createdAt: new Date().toISOString(),
      password: normalizedPassword,
    };

    users.push(created);
    this.saveUsers(users);
    this.setSession(created);
    return { ok: true };
  }

  login(email: string, password: string): { ok: true } | { ok: false; message: string } {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = password.trim();
    const user = this.loadUsers().find(
      (item) => item.email === normalizedEmail && item.password === normalizedPassword
    );

    if (!user) {
      return { ok: false, message: 'Wrong email or password.' };
    }

    this.setSession(user);
    return { ok: true };
  }

  logout(): void {
    this.currentUserSignal.set(null);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(this.sessionKey);
    }
  }

  private setSession(user: StoredAuthUser | AuthUser): void {
    const sessionUser: AuthUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
    };

    this.currentUserSignal.set(sessionUser);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.sessionKey, JSON.stringify(sessionUser));
    }
  }

  private loadSessionUser(): AuthUser | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }

    try {
      const raw = localStorage.getItem(this.sessionKey);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as AuthUser;
      if (!parsed?.id || !parsed?.email) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  private loadUsers(): StoredAuthUser[] {
    if (typeof localStorage === 'undefined') {
      return [];
    }

    try {
      const raw = localStorage.getItem(this.usersKey);
      const parsed = raw ? (JSON.parse(raw) as StoredAuthUser[]) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private saveUsers(users: StoredAuthUser[]): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    localStorage.setItem(this.usersKey, JSON.stringify(users));
  }
}
