import { Injectable, computed, inject, signal } from '@angular/core';
import {
  User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { firebaseAuth, firebaseInitError } from './firebase.config';
import { UserAdminService, UserProfile } from './user-admin.service';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  role: 'user' | 'admin';
  disabled: boolean;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly userAdminService = inject(UserAdminService);
  private readonly currentUserSignal = signal<AuthUser | null>(null);
  private readonly authReadySignal = signal(false);
  private readonly configErrorSignal = signal<string | null>(firebaseInitError);
  private currentUserUnsubscribe: (() => void) | null = null;

  readonly currentUser = this.currentUserSignal.asReadonly();
  readonly isAuthenticated = computed(() => Boolean(this.currentUserSignal()));
  readonly isAdmin = computed(() => this.userAdminService.isAdmin(this.currentUserSignal()));
  readonly isReady = this.authReadySignal.asReadonly();
  readonly configError = this.configErrorSignal.asReadonly();

  constructor() {
    const auth = firebaseAuth;
    if (!auth) {
      this.currentUserSignal.set(null);
      this.authReadySignal.set(true);
      return;
    }

    onAuthStateChanged(auth, async (user) => {
      this.currentUserUnsubscribe?.();
      this.currentUserUnsubscribe = null;
      this.authReadySignal.set(true);

      if (!user) {
        this.currentUserSignal.set(null);
        return;
      }

      try {
        const mappedUser = await this.mapUser(user);
        if (mappedUser.disabled) {
          await signOut(auth);
          this.currentUserSignal.set(null);
          return;
        }

        this.currentUserSignal.set(mappedUser);
        this.startWatchingCurrentUser(mappedUser.id);
      } catch {
        this.currentUserSignal.set({
          id: user.uid,
          email: user.email ?? '',
          name: user.displayName?.trim() || (user.email ? user.email.split('@')[0] : 'User'),
          createdAt: user.metadata.creationTime
            ? new Date(user.metadata.creationTime).toISOString()
            : new Date().toISOString(),
          role: 'user',
          disabled: false,
        });
      }
    });
  }

  async register(name: string, email: string, password: string): Promise<{ ok: true } | { ok: false; message: string }> {
    if (!firebaseAuth) {
      return { ok: false, message: this.configErrorSignal() ?? 'Firebase Auth is not available.' };
    }

    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = password.trim();

    if (!normalizedName || !normalizedEmail || !normalizedPassword) {
      return { ok: false, message: 'Fill in name, email and password.' };
    }

    if (!normalizedEmail.includes('@')) {
      return { ok: false, message: 'Email format is invalid.' };
    }

    if (normalizedPassword.length < 6) {
      return { ok: false, message: 'Password must have at least 6 characters.' };
    }

    try {
      const credentials = await createUserWithEmailAndPassword(firebaseAuth, normalizedEmail, normalizedPassword);
      await updateProfile(credentials.user, { displayName: normalizedName });
      const mappedUser = await this.mapUser(credentials.user, normalizedName);
      this.currentUserSignal.set(mappedUser);
      this.startWatchingCurrentUser(mappedUser.id);
      return { ok: true };
    } catch (error) {
      return { ok: false, message: this.toMessage(error) };
    }
  }

  async login(email: string, password: string): Promise<{ ok: true } | { ok: false; message: string }> {
    if (!firebaseAuth) {
      return { ok: false, message: this.configErrorSignal() ?? 'Firebase Auth is not available.' };
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = password.trim();

    if (!normalizedEmail || !normalizedPassword) {
      return { ok: false, message: 'Fill in email and password.' };
    }

    try {
      const credentials = await signInWithEmailAndPassword(firebaseAuth, normalizedEmail, normalizedPassword);
      const mappedUser = await this.mapUser(credentials.user);
      if (mappedUser.disabled) {
        await signOut(firebaseAuth);
        this.currentUserSignal.set(null);
        return { ok: false, message: 'This account has been blocked by admin.' };
      }

      this.currentUserSignal.set(mappedUser);
      this.startWatchingCurrentUser(mappedUser.id);
      return { ok: true };
    } catch (error) {
      return { ok: false, message: this.toMessage(error) };
    }
  }

  async logout(): Promise<void> {
    if (!firebaseAuth) {
      return;
    }

    this.currentUserUnsubscribe?.();
    this.currentUserUnsubscribe = null;
    await signOut(firebaseAuth);
    this.currentUserSignal.set(null);
  }

  private async mapUser(user: User, fallbackName?: string): Promise<AuthUser> {
    const profile = await this.userAdminService.syncUser({
      id: user.uid,
      email: user.email ?? '',
      name: user.displayName?.trim() || fallbackName || (user.email ? user.email.split('@')[0] : 'User'),
      createdAt: user.metadata.creationTime
        ? new Date(user.metadata.creationTime).toISOString()
        : new Date().toISOString(),
    });
    return this.toAuthUser(profile);
  }

  private startWatchingCurrentUser(userId: string): void {
    this.currentUserUnsubscribe?.();
    this.currentUserUnsubscribe = this.userAdminService.watchUser(userId, (profile) => {
      if (!profile) {
        return;
      }

      if (profile.disabled) {
        void this.logout();
        return;
      }

      this.currentUserSignal.set(this.toAuthUser(profile));
    });
  }

  private toAuthUser(profile: UserProfile): AuthUser {
    return {
      id: profile.id,
      email: profile.email,
      name: profile.name,
      createdAt: profile.createdAt,
      role: profile.role,
      disabled: profile.disabled,
    };
  }

  private toMessage(error: unknown): string {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';

    if (code.includes('api-key-not-valid') || code === 'auth/invalid-api-key') {
      return 'Firebase API key is invalid. Check src/app/shared/firebase.config.local.ts.';
    }

    if (code === 'auth/app-not-authorized') {
      return 'This app is not authorized for this Firebase project. Check authDomain/projectId in src/app/shared/firebase.config.local.ts.';
    }

    switch (code) {
      case 'auth/email-already-in-use':
        return 'Account with this email already exists.';
      case 'auth/invalid-email':
        return 'Email format is invalid.';
      case 'auth/weak-password':
        return 'Password is too weak.';
      case 'auth/configuration-not-found':
        return 'Firebase Auth configuration not found. Check that the Firebase project is correct and Auth is enabled.';
      case 'auth/invalid-credential':
      case 'auth/user-not-found':
      case 'auth/wrong-password':
        return 'Wrong email or password.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Try again later.';
      case 'auth/network-request-failed':
        return 'Network error. Check your connection.';
      case 'auth/operation-not-allowed':
        return 'Email/password login is not enabled in Firebase Auth.';
      default:
        return 'Authentication failed.';
    }
  }
}
