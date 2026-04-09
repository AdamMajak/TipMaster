import { Injectable, computed, signal } from '@angular/core';
import {
  User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { firebaseAuth, firebaseInitError } from './firebase.config';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly currentUserSignal = signal<AuthUser | null>(null);
  private readonly authReadySignal = signal(false);
  private readonly configErrorSignal = signal<string | null>(firebaseInitError);

  readonly currentUser = this.currentUserSignal.asReadonly();
  readonly isAuthenticated = computed(() => Boolean(this.currentUserSignal()));
  readonly isReady = this.authReadySignal.asReadonly();
  readonly configError = this.configErrorSignal.asReadonly();

  constructor() {
    if (!firebaseAuth) {
      this.currentUserSignal.set(null);
      this.authReadySignal.set(true);
      return;
    }

    onAuthStateChanged(firebaseAuth, (user) => {
      this.currentUserSignal.set(user ? this.mapUser(user) : null);
      this.authReadySignal.set(true);
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
      this.currentUserSignal.set(this.mapUser(credentials.user, normalizedName));
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
      this.currentUserSignal.set(this.mapUser(credentials.user));
      return { ok: true };
    } catch (error) {
      return { ok: false, message: this.toMessage(error) };
    }
  }

  async logout(): Promise<void> {
    if (!firebaseAuth) {
      return;
    }

    await signOut(firebaseAuth);
    this.currentUserSignal.set(null);
  }

  private mapUser(user: User, fallbackName?: string): AuthUser {
    return {
      id: user.uid,
      email: user.email ?? '',
      name: user.displayName?.trim() || fallbackName || (user.email ? user.email.split('@')[0] : 'User'),
      createdAt: user.metadata.creationTime
        ? new Date(user.metadata.creationTime).toISOString()
        : new Date().toISOString(),
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
