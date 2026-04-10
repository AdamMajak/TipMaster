import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { BetSlipService } from './shared/betslip.service';
import { AuthService } from './shared/auth.service';
import { AnalysisService } from './shared/analysis.service';
import { UserAdminService, UserProfile, UserRole } from './shared/user-admin.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule, DatePipe],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  private readonly betSlipService = inject(BetSlipService);
  private readonly authService = inject(AuthService);
  private readonly analysisService = inject(AnalysisService);
  private readonly userAdminService = inject(UserAdminService);

  protected readonly title = signal('TipMaster');
  protected stake = 10;
  protected authMode: 'login' | 'register' = 'login';
  protected loginEmail = '';
  protected loginPassword = '';
  protected registerName = '';
  protected registerEmail = '';
  protected registerPassword = '';
  protected authMessage = '';
  protected authPending = false;
  protected inviteAdminEmail = '';
  protected adminInviteMessage = '';

  protected readonly selections = this.betSlipService.entries;
  protected readonly selectionCount = this.betSlipService.count;
  protected readonly tickets = this.betSlipService.tickets;
  protected readonly currentUser = this.authService.currentUser;
  protected readonly isAuthenticated = this.authService.isAuthenticated;
  protected readonly isAdmin = this.authService.isAdmin;
  protected readonly isAuthReady = this.authService.isReady;
  protected readonly authConfigError = this.authService.configError;
  protected readonly userSyncSource = this.userAdminService.syncSource;
  protected readonly managedUsers = computed(() => {
    this.userAdminService.version();
    return this.userAdminService
      .getAllUsers()
      .sort((a, b) => new Date(b.lastLoginAt ?? b.createdAt).getTime() - new Date(a.lastLoginAt ?? a.createdAt).getTime());
  });
  protected readonly canPlaceBet = computed(
    () => this.betSlipService.count() > 0 && this.stake > 0
  );

  protected readonly totalOdds = computed(() => {
    const count = this.betSlipService.count();
    return count ? this.betSlipService.totalOdds().toFixed(2) : '0.00';
  });

  constructor() {
    effect(() => {
      this.userAdminService.watchAllUsers(this.isAdmin());
    });
  }

  protected setAuthMode(mode: 'login' | 'register'): void {
    this.authMode = mode;
    this.authMessage = '';
  }

  protected async login(): Promise<void> {
    this.authPending = true;
    const result = await this.authService.login(this.loginEmail, this.loginPassword);
    this.authPending = false;
    if (!result.ok) {
      this.authMessage = result.message;
      return;
    }

    this.authMessage = '';
    this.loginPassword = '';
  }

  protected async register(): Promise<void> {
    this.authPending = true;
    const result = await this.authService.register(
      this.registerName,
      this.registerEmail,
      this.registerPassword
    );
    this.authPending = false;
    if (!result.ok) {
      this.authMessage = result.message;
      return;
    }

    this.authMessage = '';
    this.registerPassword = '';
    this.authMode = 'login';
  }

  protected async logout(): Promise<void> {
    await this.authService.logout();
  }

  protected async inviteAdmin(): Promise<void> {
    const currentUser = this.currentUser();
    if (!currentUser || currentUser.role !== 'admin') {
      return;
    }

    const result = await this.userAdminService.inviteAdmin(this.inviteAdminEmail);
    this.adminInviteMessage = result.ok
      ? 'Admin access prepared for this email. The user will become admin after login.'
      : result.message;

    if (result.ok) {
      this.inviteAdminEmail = '';
    }
  }

  protected async setUserRole(userId: string, role: UserRole): Promise<void> {
    const currentUser = this.currentUser();
    const targetUser = this.managedUsers().find((item) => item.id === userId);
    if (!currentUser || currentUser.role !== 'admin' || !targetUser || !this.canManageUser(targetUser)) {
      return;
    }

    await this.userAdminService.setRole(userId, role);
  }

  protected async toggleUserDisabled(userId: string): Promise<void> {
    const currentUser = this.currentUser();
    const targetUser = this.managedUsers().find((item) => item.id === userId);
    if (!currentUser || currentUser.role !== 'admin' || !targetUser || !this.canManageUser(targetUser)) {
      return;
    }

    await this.userAdminService.setDisabled(userId, !targetUser.disabled);
  }

  protected deleteUserAnalyses(userId: string): void {
    const currentUser = this.currentUser();
    const targetUser = this.managedUsers().find((item) => item.id === userId);
    if (!currentUser || currentUser.role !== 'admin' || !targetUser || !this.canManageUser(targetUser)) {
      return;
    }

    this.analysisService.removeByAuthor(userId);
  }

  protected async removeUserFromApp(userId: string): Promise<void> {
    const currentUser = this.currentUser();
    const targetUser = this.managedUsers().find((item) => item.id === userId);
    if (!currentUser || currentUser.role !== 'admin' || !targetUser || !this.canManageUser(targetUser)) {
      return;
    }

    this.analysisService.removeByAuthor(userId);
    await this.userAdminService.removeUser(userId);
  }

  protected removeSelection(eventId: string, market: string): void {
    this.betSlipService.removeSelection(eventId, market);
  }

  protected clearTicket(): void {
    this.betSlipService.clear();
  }

  protected placeBet(): void {
    if (!this.isAuthenticated()) {
      this.authMessage = 'Login first to place bets.';
      return;
    }
    this.betSlipService.placeBet(this.stake);
  }

  protected clearHistory(): void {
    this.betSlipService.clearTickets();
  }

  protected potentialWin(): string {
    if (!this.betSlipService.count()) {
      return '0.00';
    }
    return (this.betSlipService.totalOdds() * this.stake).toFixed(2);
  }

  protected canManageUser(user: UserProfile): boolean {
    const currentUser = this.currentUser();
    if (!currentUser || currentUser.role !== 'admin') {
      return false;
    }

    return currentUser.id !== user.id && !this.userAdminService.isProtectedAdmin(user);
  }

  protected isProtectedAdmin(user: UserProfile): boolean {
    return this.userAdminService.isProtectedAdmin(user);
  }
}
