import { ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { faArrowLeft, faShareNodes, faUser } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIconComponent } from './fontawesome-icon.component';
import { ProjectCategory, ProjectService, ProjectTemplate } from './project.service';
import { compareNames } from './name-sort';
import { PdfViewerComponent } from './pdf-viewer.component';

@Component({
  selector: 'app-template-detail',
  imports: [FormsModule, FontAwesomeIconComponent, PdfViewerComponent],
  templateUrl: './template-detail.component.html',
  styleUrl: './template-detail.component.css',
})
export class TemplateDetailComponent implements OnInit {
  protected readonly faArrowLeft = faArrowLeft;
  protected readonly faShareNodes = faShareNodes;
  protected readonly faUser = faUser;
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly projectService = inject(ProjectService);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  protected template: ProjectTemplate | null = null;
  protected loading = true;
  protected error = '';
  protected projectDialogOpen = false;
  protected projectName = '';
  protected projectError = '';
  protected creating = false;
  protected shareDialogOpen = false;
  protected rightsConfirmed = false;
  protected sharing = false;
  protected shareError = '';
  protected pdfUrl: string | null = null;
  protected pdfData: Blob | null = null;
  protected pdfLoading = false;
  protected pdfError = '';
  protected readonly returnToFeed = history.state?.templateReturnPath === '/dashboard';
  private readonly feedActivityId = typeof history.state?.feedActivityId === 'string' ? history.state.feedActivityId : '';

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => { if (this.pdfUrl) URL.revokeObjectURL(this.pdfUrl); });
    const id = this.route.snapshot.paramMap.get('templateId');
    if (!id) { this.loading = false; this.error = 'Vorlage nicht gefunden.'; return; }
    this.projectService.getTemplate(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ template }) => {
        this.template = template;
        if (template.instructionMode === 'pdf' && template.instructionPdfName) {
          this.pdfLoading = true;
          this.projectService.downloadTemplatePdf(template.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: (pdf) => {
              this.pdfUrl = URL.createObjectURL(pdf);
              this.pdfData = pdf;
              this.pdfLoading = false;
              this.changeDetector.markForCheck();
            },
            error: (error: Error) => { this.pdfError = error.message; this.pdfLoading = false; this.changeDetector.markForCheck(); },
          });
        }
        this.loading = false;
        this.changeDetector.markForCheck();
      },
      error: (error: Error) => { this.error = error.message; this.loading = false; this.changeDetector.markForCheck(); },
    });
  }

  protected back(): void {
    if (this.returnToFeed) void this.router.navigateByUrl('/dashboard', { state: { feedActivityId: this.feedActivityId } });
    else void this.router.navigateByUrl('/templates');
  }

  protected openShareDialog(): void {
    this.rightsConfirmed = false;
    this.shareError = '';
    this.shareDialogOpen = true;
  }

  protected setSharing(shared: boolean): void {
    if (!this.template?.isOwner || this.sharing || (shared && !this.rightsConfirmed)) return;
    this.sharing = true;
    this.shareError = '';
    this.projectService.setTemplateSharing(this.template.id, shared).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => { if (this.template) this.template = { ...this.template, shared: result.shared }; this.sharing = false; this.shareDialogOpen = false; this.changeDetector.markForCheck(); },
      error: (error: Error) => { this.shareError = error.message; this.sharing = false; this.changeDetector.markForCheck(); },
    });
  }

  protected openProjectDialog(): void {
    this.projectName = '';
    this.projectError = '';
    this.projectDialogOpen = true;
  }

  protected createProject(): void {
    const name = this.projectName.trim();
    if (!this.template || this.creating || !name || name.length > 100) return;
    this.creating = true;
    this.projectError = '';
    this.projectService.createFromTemplate(this.template.id, name).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ project }) => {
        this.creating = false;
        void this.router.navigateByUrl(`/projects/${encodeURIComponent(project.id)}`, { state: { projectReturnPath: '/projects' } });
      },
      error: (error: Error) => { this.projectError = error.message; this.creating = false; this.changeDetector.markForCheck(); },
    });
  }

  protected categoryName(category: ProjectCategory): string {
    const labels: Record<ProjectCategory, string> = { sweater: 'Pullover', hat: 'Mütze', scarf: 'Schal', socks: 'Socken', blanket: 'Decke', bag: 'Tasche', accessory: 'Accessoire', other: 'Sonstiges' };
    return labels[category] ?? category;
  }

  protected needleName(id?: string): string {
    const needle = this.template?.needles.find((item) => item.id === id);
    if (!needle) return 'Keine Nadel ausgewählt';
    const kinds: Record<string, string> = { straight: 'Gerade Stricknadeln', circular: 'Rundstricknadel', 'double-pointed': 'Nadelspiel', 'crochet-hook': 'Häkelnadel', other: 'Sonstige Nadel' };
    return `${kinds[needle.type] ?? 'Nadel'} · ${needle.size} mm`;
  }

  protected get sortedYarns(): ProjectTemplate['yarns'] {
    return [...(this.template?.yarns ?? [])].sort((left, right) => compareNames(left.name, right.name));
  }

  protected get sortedNeedles(): ProjectTemplate['needles'] {
    return [...(this.template?.needles ?? [])].sort((left, right) => compareNames(this.needleName(left.id), this.needleName(right.id)));
  }

  protected yarnName(id?: string): string {
    return this.template?.yarns.find((item) => item.id === id)?.name ?? 'Kein Garn ausgewählt';
  }
}
