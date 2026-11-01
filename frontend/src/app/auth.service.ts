import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { EMPTY, Observable, catchError, finalize, tap, throwError } from 'rxjs';

export interface AuthUser {
  id: string;
  name: string;
  username: string;
  profileImage: string | null;
}

export interface AuthResponse {
  user: AuthUser;
}

export type RegistrationResponse =
  | AuthResponse
  | {
      pendingApproval: true;
      message: string;
    };

interface UsernameAvailability {
  available: boolean;
}

declare global {
  interface Window {
    MASCHENMATE_CONFIG?: {
      apiUrl?: string;
    };
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${window.MASCHENMATE_CONFIG?.apiUrl?.replace(/\/+$/, '') ?? ''}/api`;
  readonly user = signal<AuthUser | null>(null);
  readonly loading = signal(false);

  loadCurrentUser(): Observable<AuthResponse> {
    return this.http.get<AuthResponse>(`${this.apiUrl}/auth/me`, { withCredentials: true }).pipe(
      tap(({ user }) => this.user.set(user)),
      catchError((error: HttpErrorResponse) => {
        this.user.set(null);
        if (error.status === 401) {
          return EMPTY;
        }
        return throwError(() => error);
      }),
    );
  }

  login(username: string, password: string): Observable<AuthResponse> {
    this.loading.set(true);
    return this.http.post<AuthResponse>(`${this.apiUrl}/auth/login`, { username, password }, { withCredentials: true }).pipe(
      tap(({ user }) => this.user.set(user)),
      catchError((error: HttpErrorResponse) => this.handleError(error)),
      finalize(() => this.loading.set(false)),
    );
  }

  register(
    name: string,
    username: string,
    password: string,
    profileImage: string | null,
  ): Observable<RegistrationResponse> {
    this.loading.set(true);
    return this.http
      .post<RegistrationResponse>(
        `${this.apiUrl}/auth/register`,
        { name, username, password, profileImage },
        { withCredentials: true },
      )
      .pipe(
        tap((response) => this.user.set('user' in response ? response.user : null)),
        catchError((error: HttpErrorResponse) => this.handleError(error)),
        finalize(() => this.loading.set(false)),
      );
  }

  checkUsernameAvailability(username: string): Observable<UsernameAvailability> {
    return this.http.get<UsernameAvailability>(
      `${this.apiUrl}/auth/username-availability?username=${encodeURIComponent(username)}`,
      { withCredentials: true },
    );
  }

  updateProfile(username: string, profileImage: string | null): Observable<AuthResponse> {
    return this.http.patch<AuthResponse>(
      `${this.apiUrl}/auth/profile`,
      { username, profileImage },
      { withCredentials: true },
    ).pipe(
      tap(({ user }) => this.user.set(user)),
      catchError((error: HttpErrorResponse) => this.handleError(error)),
    );
  }

  logout(): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/auth/logout`, {}, { withCredentials: true }).pipe(
      tap(() => this.user.set(null)),
      catchError((error: HttpErrorResponse) => this.handleError(error)),
    );
  }

  deleteAccount(): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/auth/account`, { withCredentials: true }).pipe(
      tap(() => this.user.set(null)),
      catchError((error: HttpErrorResponse) => this.handleError(error)),
    );
  }

  private handleError(error: HttpErrorResponse): Observable<never> {
    const message =
      typeof error.error?.message === 'string'
        ? error.error.message
        : 'Die Anfrage ist fehlgeschlagen. Bitte versuche es erneut.';
    return throwError(() => new Error(message));
  }
}
