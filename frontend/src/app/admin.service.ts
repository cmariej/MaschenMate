import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';

export interface PendingRegistration {
  id: string;
  name: string;
  username: string;
  profileImage: string | null;
  createdAt: string;
}

declare global {
  interface Window {
    MASCHENMATE_CONFIG?: { apiUrl?: string };
  }
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${window.MASCHENMATE_CONFIG?.apiUrl?.replace(/\/+$/, '') ?? ''}/api/admin`;

  listRegistrations(): Observable<{ registrations: PendingRegistration[] }> {
    return this.http.get<{ registrations: PendingRegistration[] }>(
      `${this.apiUrl}/registrations`,
      { withCredentials: true },
    ).pipe(catchError((error: HttpErrorResponse) => this.handleError(error)));
  }

  registrationCount(): Observable<{ count: number }> {
    return this.http.get<{ count: number }>(
      `${this.apiUrl}/registrations/count`,
      { withCredentials: true },
    ).pipe(catchError((error: HttpErrorResponse) => this.handleError(error)));
  }

  decideRegistration(userId: string, accept: boolean): Observable<void> {
    return this.http.patch<void>(
      `${this.apiUrl}/registrations/${encodeURIComponent(userId)}`,
      { accept },
      { withCredentials: true },
    ).pipe(catchError((error: HttpErrorResponse) => this.handleError(error)));
  }

  private handleError(error: HttpErrorResponse): Observable<never> {
    const message = typeof error.error?.message === 'string'
      ? error.error.message
      : 'Die Registrierungsanfragen konnten nicht geladen werden.';
    return throwError(() => new Error(message));
  }
}
