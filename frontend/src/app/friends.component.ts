import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import type { Observable } from 'rxjs';
import { faArrowLeft } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIconComponent } from './fontawesome-icon.component';
import { compareNames } from './name-sort';

interface FriendUser {
  id: string;
  username: string;
  name: string;
  profileImage: string | null;
}

interface SearchUser extends FriendUser {
  relationship: 'none' | 'sent' | 'received' | 'friend';
}

interface FriendsResponse {
  friends: FriendUser[];
  incoming: FriendUser[];
  outgoing: FriendUser[];
}

declare global {
  interface Window {
    MASCHENMATE_CONFIG?: { apiUrl?: string };
  }
}

@Component({
  imports: [FormsModule, FontAwesomeIconComponent],
  selector: 'app-friends',
  styleUrl: './friends.component.css',
  templateUrl: './friends.component.html',
})
export class FriendsComponent implements OnInit {
  protected readonly faArrowLeft = faArrowLeft;
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly apiUrl = `${window.MASCHENMATE_CONFIG?.apiUrl?.replace(/\/+$/, '') ?? ''}/api/friends`;

  protected usernameQuery = '';
  protected results: SearchUser[] = [];
  protected friends: FriendUser[] = [];
  protected incoming: FriendUser[] = [];
  protected outgoing: FriendUser[] = [];
  protected loading = true;
  protected searching = false;
  protected errorMessage = '';
  protected successMessage = '';
  protected busyUserId: string | null = null;

  ngOnInit(): void {
    this.refresh();
  }

  protected backToDashboard(): void {
    void this.router.navigateByUrl('/dashboard');
  }

  protected search(): void {
    const query = this.usernameQuery.trim();
    this.errorMessage = '';
    this.successMessage = '';
    if (query.length < 2) {
      this.results = [];
      this.errorMessage = 'Gib mindestens 2 Zeichen des Benutzernamens ein.';
      return;
    }

    this.searching = true;
    this.http.get<{ users: SearchUser[] }>(
      `${this.apiUrl}/search?q=${encodeURIComponent(query)}`,
      { withCredentials: true },
    ).subscribe({
      next: ({ users }) => {
        this.results = users.sort((left, right) => compareNames(left.name, right.name) || compareNames(left.username, right.username));
        this.searching = false;
        this.changeDetector.markForCheck();
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage = getErrorMessage(error);
        this.searching = false;
        this.changeDetector.markForCheck();
      },
    });
  }

  protected sendRequest(user: SearchUser): void {
    this.runUserAction(user.id, () => this.http.post(`${this.apiUrl}/requests/${user.id}`, {}, { withCredentials: true }), () => {
      this.successMessage = `Freundschaftsanfrage an @${user.username} gesendet.`;
      this.refresh(false);
    });
  }

  protected respond(user: FriendUser, accept: boolean): void {
    this.runUserAction(user.id, () =>
      this.http.patch(`${this.apiUrl}/requests/${user.id}`, { accept }, { withCredentials: true }),
    () => {
      this.successMessage = accept ? `@${user.username} ist jetzt dein Freund.` : 'Freundschaftsanfrage abgelehnt.';
      this.refresh(false);
    });
  }

  protected removeFriend(user: FriendUser): void {
    if (!window.confirm(`Möchtest du @${user.username} wirklich aus deiner Freundesliste entfernen?`)) return;
    this.runUserAction(user.id, () =>
      this.http.delete(`${this.apiUrl}/${user.id}`, { withCredentials: true }),
    () => {
      this.successMessage = `@${user.username} wurde aus deiner Freundesliste entfernt.`;
      this.refresh(false);
    });
  }

  protected relationshipLabel(relationship: SearchUser['relationship']): string {
    if (relationship === 'friend') return 'Bereits befreundet';
    if (relationship === 'sent') return 'Anfrage gesendet';
    if (relationship === 'received') return 'Anfrage erhalten';
    return 'Anfrage senden';
  }

  private refresh(showLoading = true): void {
    if (showLoading) this.loading = true;
    this.http.get<FriendsResponse>(this.apiUrl, { withCredentials: true }).subscribe({
      next: (data) => {
        const byName = (left: FriendUser, right: FriendUser) => compareNames(left.name, right.name) || compareNames(left.username, right.username);
        this.friends = data.friends.sort(byName);
        this.incoming = data.incoming.sort(byName);
        this.outgoing = data.outgoing.sort(byName);
        this.loading = false;
        this.updateSearchRelationships();
        this.changeDetector.markForCheck();
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage = getErrorMessage(error);
        this.loading = false;
        this.changeDetector.markForCheck();
      },
    });
  }

  private updateSearchRelationships(): void {
    const friendIds = new Set(this.friends.map((user) => user.id));
    const incomingIds = new Set(this.incoming.map((user) => user.id));
    const outgoingIds = new Set(this.outgoing.map((user) => user.id));
    this.results = this.results.map((user) => ({
      ...user,
      relationship: friendIds.has(user.id) ? 'friend' :
        incomingIds.has(user.id) ? 'received' :
          outgoingIds.has(user.id) ? 'sent' : 'none',
    }));
  }

  private runUserAction(
    userId: string,
    request: () => Observable<unknown>,
    success: () => void,
  ): void {
    this.busyUserId = userId;
    this.errorMessage = '';
    this.successMessage = '';
    request().subscribe({
      next: () => {
        this.busyUserId = null;
        success();
        this.changeDetector.markForCheck();
      },
      error: (error: HttpErrorResponse) => {
        this.busyUserId = null;
        this.errorMessage = getErrorMessage(error);
        this.changeDetector.markForCheck();
      },
    });
  }
}

function getErrorMessage(error: HttpErrorResponse): string {
  return typeof error.error?.message === 'string'
    ? error.error.message
    : 'Die Freundesliste konnte nicht aktualisiert werden.';
}
