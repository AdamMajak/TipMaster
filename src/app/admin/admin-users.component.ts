import { CommonModule, DatePipe } from '@angular/common';
import { Component, computed, effect, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AnalysisService } from '../shared/analysis.service';
import { AuthService } from '../shared/auth.service';
import { UserAdminService, UserProfile, UserRole } from '../shared/user-admin.service';

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [CommonModule, DatePipe, FormsModule, RouterLink],
  templateUrl: './admin-users.component.html',
  styleUrl: './admin-users.component.css',
})
export class AdminUsersComponent {
  private readonly authService = inject(AuthService);
  private readonly userAdminService = inject(UserAdminService);
  private readonly analysisService = inject(AnalysisService);

  protected inviteAdminEmail = '';
  protected adminInviteMessage = '';
  protected userSearch = '';
  protected bankrollDrafts: Record<string, number> = {};

  protected readonly currentUser = this.authService.currentUser;
  protected readonly isAdmin = this.authService.isAdmin;
  protected readonly adminListSyncSource = this.userAdminService.adminListSource;
  protected readonly adminListSyncError = this.userAdminService.adminListError;
  protected readonly managedUsers = computed(() => {
    this.userAdminService.version();
    return this.userAdminService
      .getAllUsers()
      .sort((a, b) => new Date(b.lastLoginAt ?? b.createdAt).getTime() - new Date(a.lastLoginAt ?? a.createdAt).getTime());
  });
  protected readonly filteredUsers = computed(() => {
    const term = this.normalizeSearch(this.userSearch);
    if (!term) return this.managedUsers();
    return this.managedUsers().filter((user) =>
      this.normalizeSearch(`${user.name} ${user.email} ${user.role}`).includes(term)
    );
  });
  protected readonly activeUsers = computed(() => this.managedUsers().filter((user) => !user.disabled).length);
  protected readonly blockedUsers = computed(() => this.managedUsers().filter((user) => user.disabled).length);
  protected readonly totalBankroll = computed(() =>
    this.managedUsers().reduce((sum, user) => sum + (user.bettingBudget ?? 100), 0)
  );

  constructor() {
    effect(() => {
      this.userAdminService.watchAllUsers(this.isAdmin());
    });
  }

  protected async inviteAdmin(): Promise<void> {
    const currentUser = this.currentUser();
    if (!currentUser || currentUser.role !== 'admin') return;

    const result = await this.userAdminService.inviteAdmin(this.inviteAdminEmail);
    this.adminInviteMessage = result.ok
      ? 'Admin access prepared for this email. The user will become admin after login.'
      : result.message;

    if (result.ok) {
      this.inviteAdminEmail = '';
    }
  }

  protected async setUserRole(userId: string, role: UserRole): Promise<void> {
    const user = this.findUser(userId);
    if (!user || !this.canManageUser(user)) return;
    await this.userAdminService.setRole(userId, role);
  }

  protected async toggleUserDisabled(userId: string): Promise<void> {
    const user = this.findUser(userId);
    if (!user || !this.canManageUser(user)) return;
    await this.userAdminService.setDisabled(userId, !user.disabled);
  }

  protected async deleteUserAnalyses(userId: string): Promise<void> {
    const user = this.findUser(userId);
    if (!user || !this.canManageUser(user)) return;
    await this.analysisService.removeByAuthor(userId);
  }

  protected async removeUserFromApp(userId: string): Promise<void> {
    const user = this.findUser(userId);
    if (!user || !this.canManageUser(user)) return;
    await this.analysisService.removeByAuthor(userId);
    await this.userAdminService.removeUser(userId);
  }

  protected bankrollDraft(user: UserProfile): number {
    if (this.bankrollDrafts[user.id] === undefined) {
      this.bankrollDrafts[user.id] = 10;
    }
    return this.bankrollDrafts[user.id];
  }

  protected setBankrollDraft(userId: string, value: number | string | null): void {
    const parsed = Number(value);
    this.bankrollDrafts[userId] = Number.isFinite(parsed) ? parsed : 0;
  }

  protected async addBankroll(userId: string): Promise<void> {
    const user = this.findUser(userId);
    if (!user || !this.canManageUser(user)) return;
    await this.userAdminService.addBankroll(userId, this.bankrollDrafts[userId] ?? 0);
    this.bankrollDrafts[userId] = 10;
  }

  protected canManageUser(user: UserProfile): boolean {
    const currentUser = this.currentUser();
    if (!currentUser || currentUser.role !== 'admin') return false;
    return currentUser.id !== user.id && !this.userAdminService.isProtectedAdmin(user);
  }

  protected isProtectedAdmin(user: UserProfile): boolean {
    return this.userAdminService.isProtectedAdmin(user);
  }

  private findUser(userId: string): UserProfile | undefined {
    return this.managedUsers().find((user) => user.id === userId);
  }

  private normalizeSearch(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }
}
