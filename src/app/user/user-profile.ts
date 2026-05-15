import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../shared/auth.service';
import { UserAdminService, UserProfile } from '../shared/user-admin.service';
import { UserTicketsComponent } from './user-tickets.component';
import { UserAnalysesComponent } from './user-analyses.component';
import { UserFormComponent } from './user-form.component';

@Component({
  selector: 'app-user-profile',
  standalone: true,
  imports: [CommonModule, RouterLink, UserTicketsComponent, UserAnalysesComponent, UserFormComponent],
  templateUrl: './user-profile.html',
  styleUrls: ['./user-profile.css']
})
export class UserProfileComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);
  private readonly userAdminService = inject(UserAdminService);

  protected readonly profile = signal<UserProfile | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly userId = signal<string>('');
  protected activeTab: 'tickets' | 'analyses' | 'form' = 'tickets';

  private unsubscribeProfile: (() => void) | null = null;
  private readonly routeSubscription = new Subscription();

  protected readonly currentUser = this.authService.currentUser;
  protected readonly isAdmin = this.authService.isAdmin;
  protected readonly isCurrentUser = computed(() => this.currentUser()?.id === this.userId());
  protected readonly initials = computed(() => {
    const name = (this.profile()?.name ?? '').trim();
    if (!name) {
      return '?';
    }

    const parts = name.split(/\s+/).filter(Boolean);
    const first = parts[0]?.[0] ?? '?';
    const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
    return (first + last).toUpperCase();
  });

  protected readonly canViewTickets = computed(() => {
    const profile = this.profile();
    if (this.isAdmin() || this.isCurrentUser()) {
      return true;
    }

    return Boolean(profile?.shareProfile);
  });

  protected readonly canViewForm = computed(() => this.canViewTickets());

  protected readonly canViewAnalyses = computed(() => true);

  ngOnInit(): void {
    this.routeSubscription.add(
      this.route.paramMap.subscribe((params) => {
      const id = (params.get('id') ?? '').trim();
      this.userId.set(id);
      this.activeTab = 'analyses';
      this.loadProfile(id);
      })
    );
  }

  ngOnDestroy(): void {
    this.unsubscribeProfile?.();
    this.unsubscribeProfile = null;
    this.routeSubscription.unsubscribe();
  }

  private loadProfile(userId: string): void {
    this.unsubscribeProfile?.();
    this.unsubscribeProfile = null;

    if (!userId) {
      this.profile.set(null);
      this.loadError.set('Missing user id.');
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.loadError.set(null);
    this.profile.set(null);

    this.unsubscribeProfile = this.userAdminService.watchUser(userId, (profile) => {
      if (!profile) {
        this.profile.set(null);
        this.loadError.set('Profil je súkromný alebo neexistuje.');
        this.loading.set(false);
        return;
      }

      this.profile.set(profile);
      this.loading.set(false);
    });
  }

  async toggleShareProfile() {
    const profile = this.profile();
    if (!profile) {
      return;
    }
    const next = !profile.shareProfile;
    this.profile.set({ ...profile, shareProfile: next });
    await this.userAdminService.setShareProfile(profile.id, next);
  }
}
