import { ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { catchError, map, of, switchMap, timer } from 'rxjs';
import { AdminService } from './admin.service';

@Component({
  selector: 'app-registration-banner',
  styleUrl: './registration-banner.component.css',
  templateUrl: './registration-banner.component.html',
})
export class RegistrationBannerComponent implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);

  protected pendingCount = 0;
  protected error = '';

  ngOnInit(): void {
    timer(0, 30_000).pipe(
      switchMap(() => this.adminService.registrationCount().pipe(
        map(({ count }) => ({ count, error: '' })),
        catchError((error: Error) => of({ count: 0, error: error.message })),
      )),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(({ count, error }) => {
      this.pendingCount = count;
      this.error = error;
      this.changeDetector.markForCheck();
    });
  }

  protected openRegistrations(): void {
    void this.router.navigateByUrl('/admin/registrations');
  }
}
