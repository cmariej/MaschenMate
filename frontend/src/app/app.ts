import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { faArrowLeft } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIconComponent } from './fontawesome-icon.component';
import { finalize } from 'rxjs';
import type { Observable } from 'rxjs';
import { AuthResponse, AuthService, RegistrationResponse } from './auth.service';

@Component({
  imports: [FormsModule, RouterLink, RouterOutlet, FontAwesomeIconComponent],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App implements OnInit {
  protected readonly faArrowLeft = faArrowLeft;

  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);
  protected get isLegalPage(): boolean {
    return this.router.url.startsWith('/datenschutz-impressum');
  }
  protected get isAdmin(): boolean {
    return this.auth.user()?.username.toLowerCase() === 'clara';
  }
  protected password = '';
  protected passwordVisible = false;
  protected name = '';
  protected username = '';
  protected isRegistering = false;
  protected errorMessage = '';
  protected registrationMessage = '';
  protected profileError = '';
  protected avatarError = '';
  protected profileSaved = false;
  protected profileOpen = false;
  protected menuOpen = false;
  protected deleteDialogOpen = false;
  protected deletingAccount = false;
  protected savingProfile = false;
  protected usernameAvailable: boolean | null = null;
  protected usernameChecking = false;
  protected checkedUsername = '';
  protected availabilityError = '';
  protected selectedAvatar: string | null = null;
  protected readingAvatar = false;
  protected cropDialogOpen = false;
  protected cropSource: string | null = null;
  protected cropImage: HTMLImageElement | null = null;
  protected cropZoom = 1;
  protected cropX = 50;
  protected cropY = 50;
  protected readonly cropStageSize = 280;

  protected get cropImageWidth(): number {
    if (!this.cropImage) return this.cropStageSize;
    return Math.max(
      this.cropStageSize / this.cropImage.naturalWidth,
      this.cropStageSize / this.cropImage.naturalHeight,
    ) * this.cropZoom * this.cropImage.naturalWidth;
  }

  protected get cropImageHeight(): number {
    if (!this.cropImage) return this.cropStageSize;
    return Math.max(
      this.cropStageSize / this.cropImage.naturalWidth,
      this.cropStageSize / this.cropImage.naturalHeight,
    ) * this.cropZoom * this.cropImage.naturalHeight;
  }

  protected get cropImageLeft(): number {
    return (this.cropStageSize - this.cropImageWidth) * this.cropX / 100;
  }

  protected get cropImageTop(): number {
    return (this.cropStageSize - this.cropImageHeight) * this.cropY / 100;
  }

  ngOnInit(): void {
    this.auth.loadCurrentUser().subscribe({
      error: () => {
        this.errorMessage = 'Der Anmeldedienst ist momentan nicht erreichbar.';
      },
    });
  }

  protected submit(): void {
    this.errorMessage = '';
    this.registrationMessage = '';
    const request: Observable<AuthResponse | RegistrationResponse> = this.isRegistering
      ? this.auth.register(this.name, this.username, this.password, this.selectedAvatar)
      : this.auth.login(this.username, this.password);

    request.subscribe({
      next: (response) => {
        if ('pendingApproval' in response && response.pendingApproval) {
          this.registrationMessage = response.message;
        }
      },
      error: (error: Error) => {
        this.errorMessage = error.message;
      },
    });
  }

  protected toggleMode(): void {
    this.isRegistering = !this.isRegistering;
    this.passwordVisible = false;
    this.usernameChecking = false;
    this.errorMessage = '';
    this.usernameAvailable = null;
    this.availabilityError = '';
    this.selectedAvatar = null;
  }

  protected onUsernameChanged(): void {
    this.usernameChecking = false;
    this.usernameAvailable = null;
    this.checkedUsername = '';
    this.availabilityError = '';
    this.profileSaved = false;
  }

  protected usernameValidationError(): string {
    const candidate = this.username.trim();
    if (candidate.length < 5) return 'Der Benutzername muss mindestens 5 Zeichen lang sein.';
    if (candidate.length > 20) return 'Der Benutzername darf höchstens 20 Zeichen lang sein.';
    if (!/^[a-zA-Z0-9._-]+$/.test(candidate)) {
      return 'Erlaubt sind Buchstaben, Zahlen sowie die Sonderzeichen . _ -.';
    }
    return '';
  }

  protected registrationPasswordValid(): boolean {
    return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\p{P}\p{S}]).+$/u.test(this.password) &&
      new TextEncoder().encode(this.password).length <= 72;
  }

  protected checkUsernameAvailability(): void {
    const candidate = this.username.trim().toLowerCase();
    if (this.usernameValidationError()) {
      this.usernameAvailable = null;
      this.usernameChecking = false;
      return;
    }

    this.usernameChecking = true;
    this.checkedUsername = candidate;
    this.auth.checkUsernameAvailability(candidate)
      .pipe(finalize(() => {
        if (this.username.trim().toLowerCase() === candidate) this.usernameChecking = false;
        this.changeDetector.markForCheck();
      }))
      .subscribe({
        next: ({ available }) => {
          if (this.username.trim().toLowerCase() === candidate) {
            this.usernameAvailable = available;
          }
          this.changeDetector.markForCheck();
        },
        error: (error: Error) => {
          if (this.username.trim().toLowerCase() === candidate) {
            this.availabilityError = error.message;
          }
          this.changeDetector.markForCheck();
        },
      });
  }

  protected openProfileSettings(): void {
    const user = this.auth.user();
    if (!user) {
      return;
    }
    this.username = user.username;
    this.selectedAvatar = user.profileImage;
    this.usernameAvailable = true;
    this.checkedUsername = user.username;
    this.profileError = '';
    this.usernameChecking = false;
    this.profileSaved = false;
    this.profileOpen = true;
    this.menuOpen = false;
  }

  protected openFriends(): void {
    this.menuOpen = false;
    void this.router.navigateByUrl('/friends');
  }

  protected openAdminRegistrations(): void {
    this.menuOpen = false;
    void this.router.navigateByUrl('/admin/registrations');
  }

  protected closeProfileSettings(): void {
    this.usernameChecking = false;
    this.profileOpen = false;
    this.profileError = '';
    this.usernameAvailable = null;
  }

  protected onAvatarSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    this.avatarError = '';
    this.profileSaved = false;
    this.readingAvatar = true;
    if (!file) {
      this.readingAvatar = false;
      return;
    }

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      this.avatarError = 'Bitte wähle ein JPG-, PNG- oder WebP-Bild aus.';
      this.readingAvatar = false;
      input.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.avatarError = 'Das Profilbild darf höchstens 5 MB groß sein.';
      this.readingAvatar = false;
      input.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const imageData = reader.result;
        const image = new Image();
        image.onload = () => {
          this.cropImage = image;
          this.cropSource = imageData;
          this.cropZoom = 1;
          this.cropX = 50;
          this.cropY = 50;
          this.cropDialogOpen = true;
          this.readingAvatar = false;
          input.value = '';
          this.changeDetector.markForCheck();
        };
        image.onerror = () => {
          this.avatarError = 'Das Bild konnte nicht geöffnet werden.';
          this.readingAvatar = false;
          input.value = '';
          this.changeDetector.markForCheck();
        };
        image.src = imageData;
      } else {
        this.avatarError = 'Das Bild konnte nicht gelesen werden.';
        this.readingAvatar = false;
        input.value = '';
        this.changeDetector.markForCheck();
      }
    };
    reader.onerror = () => {
      this.avatarError = 'Das Bild konnte nicht gelesen werden.';
      this.readingAvatar = false;
      input.value = '';
      this.changeDetector.markForCheck();
    };
    reader.readAsDataURL(file);
  }

  protected cancelAvatarCrop(): void {
    this.cropDialogOpen = false;
    this.cropImage = null;
    this.cropSource = null;
  }

  protected applyAvatarCrop(): void {
    if (!this.cropImage) {
      this.avatarError = 'Das Bild konnte nicht zugeschnitten werden.';
      return;
    }

    const cropSize = Math.min(this.cropImage.naturalWidth, this.cropImage.naturalHeight) / this.cropZoom;
    const sourceX = (this.cropImage.naturalWidth - cropSize) * this.cropX / 100;
    const sourceY = (this.cropImage.naturalHeight - cropSize) * this.cropY / 100;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext('2d');
    if (!context) {
      this.avatarError = 'Das Bild konnte nicht zugeschnitten werden.';
      return;
    }

    try {
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(this.cropImage, sourceX, sourceY, cropSize, cropSize, 0, 0, 512, 512);
      this.selectedAvatar = canvas.toDataURL('image/jpeg', 0.9);
      this.avatarError = '';
      this.profileSaved = false;
      this.cancelAvatarCrop();
    } catch {
      this.avatarError = 'Das Bild konnte nicht zugeschnitten werden.';
    }
  }

  protected removeAvatar(): void {
    this.selectedAvatar = null;
    this.profileSaved = false;
    this.avatarError = '';
  }

  protected saveProfile(): void {
    this.profileError = '';
    this.profileSaved = false;
    this.savingProfile = true;
    this.auth.updateProfile(this.username, this.selectedAvatar).subscribe({
      next: () => {
        this.savingProfile = false;
        this.profileSaved = true;
        this.usernameAvailable = true;
        this.checkedUsername = this.username.trim().toLowerCase();
      },
      error: (error: Error) => {
        this.savingProfile = false;
        this.profileError = error.message;
      },
    });
  }

  protected logout(): void {
    this.auth.logout().subscribe({
      error: (error: Error) => {
        if (this.profileOpen) {
          this.profileError = error.message;
        } else {
          this.errorMessage = error.message;
        }
      },
    });
  }

  protected confirmDeleteAccount(): void {
    this.deletingAccount = true;
    this.profileError = '';
    this.auth.deleteAccount().subscribe({
      next: () => {
        this.deletingAccount = false;
        this.deleteDialogOpen = false;
        this.profileOpen = false;
        this.menuOpen = false;
      },
      error: (error: Error) => {
        this.deletingAccount = false;
        this.profileError = error.message;
        this.deleteDialogOpen = false;
      },
    });
  }
}
