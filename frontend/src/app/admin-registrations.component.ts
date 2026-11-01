import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AdminService, PendingRegistration } from './admin.service';

@Component({
  selector: 'app-admin-registrations',
  styleUrl: './admin-registrations.component.css',
  templateUrl: './admin-registrations.component.html',
})
export class AdminRegistrationsComponent implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly router = inject(Router);

  protected registrations: PendingRegistration[] = [];
  protected loading = true;
  protected error = '';
  protected message = '';
  protected busyUserId: string | null = null;

  ngOnInit(): void {
    this.loadRegistrations();
  }

  protected loadRegistrations(): void {
    this.loading = true;
    this.adminService.listRegistrations().subscribe({
      next: ({ registrations }) => {
        this.registrations = registrations;
        this.loading = false;
        this.error = '';
        this.changeDetector.markForCheck();
      },
      error: (error: Error) => {
        this.error = error.message;
        this.loading = false;
        this.changeDetector.markForCheck();
      },
    });
  }

  protected decide(user: PendingRegistration, accept: boolean): void {
    this.busyUserId = user.id;
    this.error = '';
    this.message = '';
    this.adminService.decideRegistration(user.id, accept).subscribe({
      next: () => {
        this.registrations = this.registrations.filter((registration) => registration.id !== user.id);
        this.busyUserId = null;
        this.message = accept
          ? `@${user.username} wurde freigeschaltet.`
          : `Die Registrierung von @${user.username} wurde abgelehnt.`;
        this.changeDetector.markForCheck();
      },
      error: (error: Error) => {
        this.busyUserId = null;
        this.error = error.message;
        this.changeDetector.markForCheck();
      },
    });
  }

  protected backToDashboard(): void {
    void this.router.navigateByUrl('/dashboard');
  }

  protected formatDate(value: string): string {
    return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  }
}
