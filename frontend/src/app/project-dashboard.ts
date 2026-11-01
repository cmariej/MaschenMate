import { ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { faFolderOpen, faHouse, faPlus } from '@fortawesome/free-solid-svg-icons';
import { NavigationEnd, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { ProjectPreviewComponent } from './project-preview.component';
import { YarnComponent } from './yarn.component';
import { NeedleComponent } from './needle.component';
import { ProjectDetailComponent } from './project-detail.component';
import { ProjectEditorComponent } from './project-editor.component';
import { ActivityFeedComponent } from './activity-feed.component';
import { FontAwesomeIconComponent } from './fontawesome-icon.component';
import { AuthService } from './auth.service';
import { RegistrationBannerComponent } from './registration-banner.component';
import {
  Gauge,
  InstructionRange,
  InstructionRepeat,
  Needle,
  NeedleKind,
  MaterialLibrary,
  Project,
  ProjectCategory,
  ProjectInput,
  ProjectYarn,
  ProjectSection,
  ProjectService,
  FeedActivity,
  Yarn,
} from './project.service';

interface ExpandedRow {
  number: number;
  stitches: number;
  instructions: string;
  yarnId?: string;
}

@Component({
  imports: [FormsModule, FontAwesomeIconComponent, ProjectPreviewComponent, ProjectDetailComponent, ProjectEditorComponent, ActivityFeedComponent, RegistrationBannerComponent, YarnComponent, NeedleComponent],
  selector: 'app-project-dashboard',
  styleUrl: './project-dashboard.css',
  templateUrl: './project-dashboard.html',
})
export class ProjectDashboard implements OnInit {
  protected readonly faPlus = faPlus;
  protected readonly faHomeTab = faHouse;
  protected readonly faProjectsTab = faFolderOpen;

  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly projectService = inject(ProjectService);
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected projects: Project[] = [];
  protected loading = true;
  protected saving = false;
  protected error = '';
  protected feedError = '';
  protected feedLoading = true;
  protected feedActivities: FeedActivity[] = [];
  protected editorError = '';
  protected busyProjectId = '';
  protected editingId: string | null = null;
  protected draft: ProjectInput = this.newProject();
  protected page: 'home' | 'projects' | 'yarns' | 'needles' = 'home';
  protected view: 'list' | 'project-detail' | 'project-edit' | 'yarn-edit' | 'needle-edit' = 'list';
  protected projectTypeFilter: 'all' | 'knitting' | 'crochet' = 'all';
  protected projectCategoryFilter: 'all' | ProjectCategory = 'all';
  protected yarnNeedleSizeFilters: number[] = [];
  protected yarnColorFilters: string[] = [];
  protected yarnMaterialFilters: string[] = [];
  protected materials: MaterialLibrary = { yarns: [], needles: [] };
  protected materialsLoading = true;
  protected materialsSaving = false;
  protected selectedProject: Project | null = null;
  protected yarnDraft: Yarn | null = null;
  protected needleDraft: Needle | null = null;
  private returnToEditorPath = '';
  private preserveProjectDraftOnPath = '';
  private lastRoutePath = '';
  protected readonly categories: { value: ProjectCategory; label: string }[] = [
    { value: 'sweater', label: 'Pullover' },
    { value: 'hat', label: 'Mütze' },
    { value: 'scarf', label: 'Schal' },
    { value: 'socks', label: 'Socken' },
    { value: 'blanket', label: 'Decke' },
    { value: 'bag', label: 'Tasche' },
    { value: 'accessory', label: 'Accessoire' },
    { value: 'other', label: 'Sonstiges' },
  ];
  protected readonly needleKinds: { value: NeedleKind; label: string }[] = [
    { value: 'straight', label: 'Gerade Stricknadeln' },
    { value: 'circular', label: 'Rundstricknadel' },
    { value: 'double-pointed', label: 'Nadelspiel' },
    { value: 'crochet-hook', label: 'Häkelnadel' },
    { value: 'other', label: 'Sonstige' },
  ];

  ngOnInit(): void {
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe((event) => this.syncRoute(event.urlAfterRedirects));
    this.syncRoute(this.router.url);
    this.loadProjects();
    this.loadFeed();
    this.loadMaterials();
  }

  protected get recentProjects(): Project[] {
    return this.projects.slice(0, 3);
  }

  protected get authUserId(): string | null {
    return this.auth.user()?.id ?? null;
  }

  protected get isAdmin(): boolean {
    return this.auth.user()?.username.toLowerCase() === 'clara';
  }

  protected get filteredProjects(): Project[] {
    return this.projects.filter((project) =>
      (this.projectTypeFilter === 'all' || project.type === this.projectTypeFilter)
      && (this.projectCategoryFilter === 'all' || project.category === this.projectCategoryFilter),
    );
  }

  protected get activeProjectFilterCount(): number {
    return Number(this.projectTypeFilter !== 'all') + Number(this.projectCategoryFilter !== 'all');
  }

  protected clearProjectFilters(): void {
    this.projectTypeFilter = 'all';
    this.projectCategoryFilter = 'all';
  }

  protected get projectsToShow(): Project[] {
    return this.page === 'projects' ? this.filteredProjects : this.recentProjects;
  }

  protected get activeProjects(): Project[] {
    return this.projects.filter((project) =>
      project.progress.startedAt && !project.progress.cancelledAt && !this.projectCompleted(project),
    );
  }

  protected get currentProject(): Project | null {
    return this.activeProjects[0] ?? null;
  }

  protected get currentSection(): ProjectSection | null {
    const project = this.currentProject;
    return project?.sections.find((section) => section.id === project.progress.activeSectionId) ?? null;
  }

  protected get currentRowNumber(): number {
    const project = this.currentProject;
    const section = this.currentSection;
    if (!project || !section) return 0;
    return this.currentRow(project)?.number ?? this.sectionRows(section).length;
  }

  protected get completedCurrentRows(): number {
    const project = this.currentProject;
    const section = this.currentSection;
    return project && section ? (project.progress.completedRows[section.id] ?? 0) : 0;
  }

  protected get isEditingSavedYarn(): boolean {
    return this.yarnDraft !== null && this.materials.yarns.some((item) => item.id === this.yarnDraft?.id);
  }

  protected get isEditingSavedNeedle(): boolean {
    return this.needleDraft !== null && this.materials.needles.some((item) => item.id === this.needleDraft?.id);
  }

  protected get currentProjectNextRow(): ExpandedRow | null {
    const project = this.currentProject;
    return project ? this.currentRow(project) : null;
  }

  protected get filteredYarns(): Yarn[] {
    return this.materials.yarns.filter((yarn) =>
      (!this.yarnNeedleSizeFilters.length || this.yarnNeedleSizeFilters.includes(yarn.needleSize))
      && (!this.yarnColorFilters.length || this.yarnColorFilters.includes(yarn.color))
      && (!this.yarnMaterialFilters.length || yarn.composition.some((item) => this.yarnMaterialFilters.includes(item.material))),
    );
  }

  protected get yarnFilterNeedleSizes(): number[] {
    return [...new Set(this.materials.yarns.map((yarn) => yarn.needleSize))].sort((a, b) => a - b);
  }

  protected get yarnFilterColors(): string[] {
    return [...new Set(this.materials.yarns.map((yarn) => yarn.color.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
  }

  protected get yarnFilterMaterials(): string[] {
    return [...new Set(this.materials.yarns.flatMap((yarn) => yarn.composition.map((item) => item.material)))].sort((a, b) => a.localeCompare(b, 'de'));
  }

  protected checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  private syncRoute(url: string): void {
    const path = url.split(/[?#]/, 1)[0].replace(/^\/+|\/+$/g, '') || 'dashboard';
    if (path === this.lastRoutePath) return;
    const segments = path.split('/');
    this.page = segments[0] === 'projects'
      ? 'projects'
      : segments[0] === 'yarns'
        ? 'yarns'
        : segments[0] === 'needles'
          ? 'needles'
          : 'home';
    this.view = 'list';
    this.selectedProject = null;
    this.yarnDraft = null;
    this.needleDraft = null;

    const preservePath = this.preserveProjectDraftOnPath.replace(/^\/+|\/+$/g, '');
    if (preservePath && path === preservePath) {
      this.preserveProjectDraftOnPath = '';
      this.view = 'project-edit';
      this.lastRoutePath = path;
      return;
    }

    if (segments[0] === 'projects' && segments[1] === 'new') {
      this.editingId = null;
      this.draft = this.newProject();
      this.editorError = '';
      this.view = 'project-edit';
    } else if (segments[0] === 'projects' && segments[1]) {
      const projectId = decodeURIComponent(segments[1]);
      const project = this.projects.find((item) => item.id === projectId);
      if (!project) {
        if (this.loading) return;
        this.error = 'Dieses Projekt wurde nicht gefunden.';
      } else if (segments[2] === 'edit') {
        if (this.editingId !== project.id) this.setProjectDraft(project);
        this.view = 'project-edit';
      } else {
        this.selectedProject = project;
        this.view = 'project-detail';
      }
    } else if (segments[0] === 'yarns' && segments[1] === 'new') {
      this.yarnDraft = {
        id: this.createId(), name: '', brand: '', color: '', colorCode: '',
        needleSize: 4, length: 100, weight: 50,
        composition: [],
      };
      this.view = 'yarn-edit';
    } else if (segments[0] === 'yarns' && segments[1]) {
      const yarnId = decodeURIComponent(segments[1]);
      const yarn = this.materials.yarns.find((item) => item.id === yarnId);
      if (!yarn) {
        if (this.materialsLoading) return;
        this.error = 'Dieses Garn wurde nicht gefunden.';
      } else if (segments[2] === 'edit') {
        this.yarnDraft = structuredClone(yarn);
        this.view = 'yarn-edit';
      } else {
        this.yarnDraft = structuredClone(yarn);
        this.view = 'yarn-edit';
      }
    } else if (segments[0] === 'needles' && segments[1] === 'new') {
      this.needleDraft = { id: this.createId(), type: 'circular', size: 4 };
      this.view = 'needle-edit';
    } else if (segments[0] === 'needles' && segments[1]) {
      const needleId = decodeURIComponent(segments[1]);
      const needle = this.materials.needles.find((item) => item.id === needleId);
      if (!needle) {
        if (this.materialsLoading) return;
        this.error = 'Diese Nadel wurde nicht gefunden.';
      } else if (segments[2] === 'edit') {
        this.needleDraft = structuredClone(needle);
        this.view = 'needle-edit';
      } else {
        this.needleDraft = structuredClone(needle);
        this.view = 'needle-edit';
      }
    }
    this.lastRoutePath = path;
    this.changeDetector.markForCheck();
  }

  private pagePath(page: 'home' | 'projects' | 'yarns' | 'needles'): string {
    return page === 'home' ? '/dashboard' : `/${page}`;
  }

  protected loadProjects(): void {
    this.loading = true;
    this.projectService.list().subscribe({
      next: ({ projects }) => {
        this.projects = projects.map((project) => this.normalizeProject(project))
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
        this.loading = false;
        this.syncRoute(this.router.url);
        this.changeDetector.markForCheck();
      },
      error: (error: Error) => {
        this.error = error.message;
        this.loading = false;
        this.changeDetector.markForCheck();
      },
    });
  }

  protected loadMaterials(): void {
    this.projectService.listMaterials().subscribe({
      next: ({ materials }) => {
        this.materials = {
          ...materials,
          yarns: materials.yarns.map((yarn) => this.normalizeLibraryYarn(yarn)),
        };
        this.materialsLoading = false;
        this.syncRoute(this.router.url);
        this.changeDetector.markForCheck();
      },
      error: (error: Error) => {
        this.error = error.message;
        this.materialsLoading = false;
        this.syncRoute(this.router.url);
        this.changeDetector.markForCheck();
      },
    });
  }

  protected showPage(page: 'home' | 'projects' | 'yarns' | 'needles'): void {
    if (page === 'home' && this.returnToEditorPath) {
      const returnPath = this.returnToEditorPath;
      this.returnToEditorPath = '';
      this.preserveProjectDraftOnPath = returnPath;
      void this.router.navigateByUrl(returnPath);
      return;
    }
    this.returnToEditorPath = '';
    this.selectedProject = null;
    void this.router.navigateByUrl(this.pagePath(page));
  }

  protected openMaterialsFromEditor(): void {
    this.returnToEditorPath = this.router.url;
    void this.router.navigateByUrl('/yarns');
  }

  protected openNewProject(): void {
    this.editingId = null;
    this.draft = this.newProject();
    this.editorError = '';
    void this.router.navigateByUrl('/projects/new');
  }

  protected editProject(project: Project): void {
    this.setProjectDraft(project);
    void this.router.navigateByUrl(`/projects/${encodeURIComponent(project.id)}/edit`);
  }

  private setProjectDraft(project: Project): void {
    const { id, userId, createdAt, updatedAt, patternYarn, ...input } = structuredClone(project);
    this.editingId = id;
    const projectYarns = input.yarns.map((yarn) => this.normalizeProjectYarn(yarn));
    const projectNeedles = input.needles.map((needle) => this.materials.needles.find((libraryNeedle) => libraryNeedle.id === needle.id) ?? needle);
    this.draft = {
      ...input,
      category: input.category ?? 'other',
      yarns: projectYarns,
      needles: projectNeedles,
      patternYarn,
    };
    this.editorError = '';
  }

  protected addLibraryYarn(): void {
    this.yarnDraft = {
      id: this.createId(), name: '', brand: '', color: '', colorCode: '',
      needleSize: 4, length: 100, weight: 50,
      composition: [],
    };
    void this.router.navigateByUrl('/yarns/new');
  }

  protected addLibraryNeedle(): void {
    this.needleDraft = { id: this.createId(), type: 'circular', size: 4 };
    void this.router.navigateByUrl('/needles/new');
  }

  protected removeLibraryYarn(index: number): void {
    const yarn = this.materials.yarns[index];
    if (!yarn) return;
    this.saveMaterialLibrary({ ...this.materials, yarns: this.materials.yarns.filter((item) => item.id !== yarn.id) }, () => {
      void this.router.navigateByUrl('/yarns');
    });
  }

  protected removeLibraryNeedle(index: number): void {
    const needle = this.materials.needles[index];
    if (!needle) return;
    this.saveMaterialLibrary({ ...this.materials, needles: this.materials.needles.filter((item) => item.id !== needle.id) }, () => {
      void this.router.navigateByUrl('/needles');
    });
  }

  protected openYarnDetail(yarn: Yarn): void {
    this.editYarn(yarn);
  }

  protected openNeedleDetail(needle: Needle): void {
    this.editNeedle(needle);
  }

  protected toggleYarnFilter(
    filterName: 'needleSize' | 'color' | 'material',
    value: number | string,
    checked: boolean,
  ): void {
    if (filterName === 'needleSize' && typeof value === 'number') {
      this.yarnNeedleSizeFilters = this.toggleFilterValue(this.yarnNeedleSizeFilters, value, checked);
    } else if (filterName === 'color' && typeof value === 'string') {
      this.yarnColorFilters = this.toggleFilterValue(this.yarnColorFilters, value, checked);
    } else if (filterName === 'material' && typeof value === 'string') {
      this.yarnMaterialFilters = this.toggleFilterValue(this.yarnMaterialFilters, value, checked);
    }
  }

  protected clearYarnFilters(): void {
    this.yarnNeedleSizeFilters = [];
    this.yarnColorFilters = [];
    this.yarnMaterialFilters = [];
  }

  private toggleFilterValue<T extends string | number>(values: T[], value: T, checked: boolean): T[] {
    if (checked && !values.includes(value)) return [...values, value];
    if (!checked) return values.filter((item) => item !== value);
    return values;
  }

  protected editYarn(yarn: Yarn): void {
    this.yarnDraft = structuredClone(yarn);
    void this.router.navigateByUrl(`/yarns/${encodeURIComponent(yarn.id)}/edit`);
  }

  protected editNeedle(needle: Needle): void {
    this.needleDraft = structuredClone(needle);
    void this.router.navigateByUrl(`/needles/${encodeURIComponent(needle.id)}/edit`);
  }

  protected closeMaterialEditor(): void {
    if (this.yarnDraft) {
      void this.router.navigateByUrl('/yarns');
    } else if (this.needleDraft) {
      void this.router.navigateByUrl('/needles');
    }
  }

  protected saveYarn(): void {
    if (!this.yarnDraft) return;
    const yarn = this.normalizeLibraryYarn(this.yarnDraft);
    const yarns = this.materials.yarns.filter((item) => item.id !== yarn.id);
    yarns.push(yarn);
    this.saveMaterialLibrary({ ...this.materials, yarns }, () => {
      this.yarnDraft = null;
      void this.router.navigateByUrl('/yarns');
    });
  }

  protected saveNeedle(): void {
    if (!this.needleDraft) return;
    const needle = structuredClone(this.needleDraft);
    const needles = this.materials.needles.filter((item) => item.id !== needle.id);
    needles.push(needle);
    this.saveMaterialLibrary({ ...this.materials, needles }, () => {
      this.needleDraft = null;
      void this.router.navigateByUrl('/needles');
    });
  }

  protected openProjectDetail(project: Project): void {
    void this.router.navigateByUrl(`/projects/${encodeURIComponent(project.id)}`);
  }

  protected closeDetails(): void {
    void this.router.navigateByUrl(this.pagePath(this.page));
  }

  protected changeCurrentRow(project: Project, delta: -1 | 1): void {
    const section = project.sections.find((item) => item.id === project.progress.activeSectionId);
    if (!section) return;
    const completed = project.progress.completedRows[section.id] ?? 0;
    const rows = this.sectionRows(section);
    const nextCompleted = Math.max(0, Math.min(rows.length, completed + delta));
    if (completed === nextCompleted) return;
    const next = structuredClone(project);
    next.progress.completedRows[section.id] = nextCompleted;
    const rowNumber = delta > 0 ? rows[completed]?.number : rows[nextCompleted]?.number;
    if (rowNumber) {
      next.progress.changelog.push({
        id: this.createId(),
        type: delta > 0 ? 'row_completed' : 'row_reopened',
        timestamp: new Date().toISOString(),
        sectionId: section.id,
        rowNumber,
      });
    }
    this.saveProgress(next);
  }

  private saveMaterialLibrary(materials: MaterialLibrary, onSaved: () => void): void {
    this.error = '';
    this.materialsSaving = true;
    this.projectService.saveMaterials(materials).subscribe({
      next: ({ materials: saved }) => {
        this.materials = saved;
        this.materialsSaving = false;
        onSaved();
        this.changeDetector.markForCheck();
      },
      error: (error: Error) => {
        this.error = error.message;
        this.materialsSaving = false;
        this.changeDetector.markForCheck();
      },
    });
  }

  protected saveMaterials(): void {
    this.error = '';
    this.materialsSaving = true;
    this.projectService.saveMaterials(this.materials).subscribe({
      next: ({ materials }) => {
        this.materials = materials;
        this.materialsSaving = false;
        this.changeDetector.markForCheck();
      },
      error: (error: Error) => {
        this.error = error.message;
        this.materialsSaving = false;
        this.changeDetector.markForCheck();
      },
    });
  }

  protected toggleProjectYarn(yarn: Yarn, checked: boolean): void {
    const selected = this.draft.yarns.some((item) => item.id === yarn.id);
    if (checked && !selected) this.draft.yarns.push(this.normalizeProjectYarn(yarn));
    if (!checked && selected) this.draft.yarns = this.draft.yarns.filter((item) => item.id !== yarn.id);
    const defaultYarnId = this.draft.yarns[0]?.id;
    for (const section of this.draft.sections) {
      for (const entry of section.entries) {
        if (entry.type === 'range') {
          if (entry.yarnId === yarn.id && !checked) entry.yarnId = defaultYarnId;
          else if (!entry.yarnId) entry.yarnId = defaultYarnId;
        } else {
          if (entry.yarnId === yarn.id && !checked) entry.yarnId = defaultYarnId;
          else if (!entry.yarnId) entry.yarnId = defaultYarnId;
          for (const row of entry.repeatRows) {
            if (row.yarnId === yarn.id && !checked) row.yarnId = entry.yarnId ?? defaultYarnId;
            else if (!row.yarnId) row.yarnId = entry.yarnId ?? defaultYarnId;
          }
        }
      }
    }
  }

  protected toggleProjectNeedle(needle: Needle, checked: boolean): void {
    const selected = this.draft.needles.some((item) => item.id === needle.id);
    if (checked && !selected) this.draft.needles.push(structuredClone(needle));
    if (!checked && selected) this.draft.needles = this.draft.needles.filter((item) => item.id !== needle.id);
    for (const section of this.draft.sections) {
      if (section.needleId === needle.id && !checked) section.needleId = undefined;
    }
  }

  protected closeEditor(): void {
    if (this.saving) return;
    void this.router.navigateByUrl(this.editingId
      ? `/projects/${encodeURIComponent(this.editingId)}`
      : this.pagePath(this.page));
  }

  protected addSection(): void {
    this.draft.sections.push({
      id: this.createId(),
      name: `Abschnitt ${this.draft.sections.length + 1}`,
      entries: [],
    });
  }

  protected removeSection(index: number): void {
    const [section] = this.draft.sections.splice(index, 1);
    delete this.draft.progress.completedRows[section.id];
    if (this.draft.progress.activeSectionId === section.id) this.draft.progress.activeSectionId = null;
  }

  protected addRange(section: ProjectSection): void {
    const lastRow = this.lastRow(section);
    const entry: InstructionRange = {
      id: this.createId(),
      type: 'range',
      fromRow: lastRow + 1,
      toRow: lastRow + 1,
      instructions: '',
      stitchesPerRow: 1,
      yarnId: this.draft.yarns[0]?.id,
    };
    section.entries.push(entry);
  }

  protected addRepeat(section: ProjectSection): void {
    const lastRow = this.lastRow(section);
    const entry: InstructionRepeat = {
      id: this.createId(),
      type: 'repeat',
      fromRow: lastRow + 1,
      toRow: lastRow + 10,
      repeatRows: [
        { instructions: '', stitchesPerRow: 1, yarnId: this.draft.yarns[0]?.id },
        { instructions: '', stitchesPerRow: 1, yarnId: this.draft.yarns[0]?.id },
      ],
    };
    section.entries.push(entry);
  }

  protected addRepeatRow(entry: InstructionRepeat): void {
    entry.repeatRows.push({ instructions: '', stitchesPerRow: 1, yarnId: this.draft.yarns[0]?.id });
  }

  protected onProjectImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.editorError = '';
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      this.editorError = 'Bitte wähle ein JPG-, PNG- oder WebP-Bild aus.';
      input.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.editorError = 'Das Projektbild darf höchstens 5 MB groß sein.';
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        this.editorError = 'Das Projektbild konnte nicht gelesen werden.';
      } else {
        this.draft.image = reader.result;
      }
      input.value = '';
    };
    reader.onerror = () => {
      this.editorError = 'Das Projektbild konnte nicht gelesen werden.';
      input.value = '';
    };
    reader.readAsDataURL(file);
  }

  protected onInstructionPdfSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.editorError = '';
    if (file.type !== 'application/pdf') {
      this.editorError = 'Bitte wähle eine PDF-Datei aus.';
      input.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.editorError = 'Die PDF-Anleitung darf höchstens 5 MB groß sein.';
      input.value = '';
      return;
    }

    this.draft.instructionMode = 'pdf';
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string' || !reader.result.startsWith('data:application/pdf;base64,JVBERi0')) {
        this.editorError = 'Die ausgewählte Datei ist keine gültige PDF-Datei.';
      } else {
        this.draft.instructionPdf = reader.result;
        this.draft.instructionPdfName = file.name;
        this.draft.instructionMode = 'pdf';
      }
      input.value = '';
    };
    reader.onerror = () => {
      this.editorError = 'Die PDF-Datei konnte nicht gelesen werden.';
      input.value = '';
    };
    reader.readAsDataURL(file);
  }

  protected saveProject(): void {
    this.editorError = '';
    this.draft.progress ??= { startedAt: null, activeSectionId: null, completedRows: {}, changelog: [] };
    this.draft.progress.completedRows ??= {};
    this.draft.progress.changelog ??= [];
    const validationError = this.validateProjectDraft();
    if (validationError) {
      this.editorError = validationError;
      return;
    }

    // Fill optional legacy fields so requests always have the complete shape
    // expected by the API, even when editing an older project.
    this.saving = true;
    const request = this.editingId
      ? this.projectService.update(this.editingId, this.draft)
      : this.projectService.create(this.draft);
    request.subscribe({
      next: ({ project }) => {
        const saved = this.normalizeProject(project);
        this.projects = [saved, ...this.projects.filter((item) => item.id !== project.id)]
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
        this.editingId = saved.id;
        this.saving = false;
        void this.router.navigateByUrl(`/projects/${encodeURIComponent(saved.id)}`);
        this.changeDetector.markForCheck();
      },
      error: (error: Error) => {
        this.editorError = error.message;
        this.saving = false;
        this.changeDetector.markForCheck();
      },
    });
  }

  private validateProjectDraft(): string | null {
    const project = this.draft;
    if (!project.name?.trim() || project.name.trim().length > 100) return 'Bitte gib einen Projektnamen mit höchstens 100 Zeichen ein.';
    if (!['knitting', 'crochet'].includes(project.type)) return 'Bitte wähle eine gültige Projektart aus.';
    if (!this.categories.some((category) => category.value === project.category)) return 'Bitte wähle eine gültige Kategorie aus.';
    if (project.yarns.length > 30 || project.needles.length > 30 || project.sections.length > 50) return 'Das Projekt enthält mehr Materialien oder Abschnitte als erlaubt.';
    if (project.image && !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(project.image)) return 'Das Projektbild hat ein ungültiges Format. Bitte wähle es erneut aus.';

    for (const yarn of project.yarns) {
      if (!yarn.id || !yarn.name.trim() || yarn.name.trim().length > 100) return 'Jedes ausgewählte Garn braucht einen Namen mit höchstens 100 Zeichen.';
      if ((yarn.brand ?? '').length > 100 || (yarn.color ?? '').length > 100 || (yarn.colorCode ?? '').length > 40) return `Die Angaben für „${yarn.name}“ sind zu lang.`;
      if (!this.isPositiveFinite(yarn.needleSize, 100) || !this.isPositiveFinite(yarn.length, 1_000_000) || !this.isPositiveFinite(yarn.weight, 1_000_000)) return `Bitte prüfe Nadelstärke, Lauflänge und Gewicht für „${yarn.name}“.`;
      if (!this.isPositiveFinite(yarn.gauge?.stitches, 1000) || !this.isPositiveFinite(yarn.gauge?.rows, 1000)) return `Bitte gib für „${yarn.name}“ eine gültige Maschenprobe ein.`;
      if (yarn.composition.length > 20 || yarn.composition.some((item) => !item.material.trim() || item.material.trim().length > 60 || !this.isPositiveFinite(item.percentage, 100))) return `Bitte prüfe die Materialzusammensetzung für „${yarn.name}“.`;
      if (yarn.composition.length && Math.round(yarn.composition.reduce((sum, item) => sum + item.percentage, 0) * 100) / 100 !== 100) return `Die Materialanteile für „${yarn.name}“ müssen zusammen 100 % ergeben.`;
    }
    if (new Set(project.yarns.map((yarn) => yarn.id)).size !== project.yarns.length) return 'Ein Garn ist mehrfach ausgewählt. Bitte aktualisiere die Auswahl.';

    for (const needle of project.needles) {
      if (!needle.id || !['straight', 'circular', 'double-pointed', 'crochet-hook', 'other'].includes(needle.type) || !this.isPositiveFinite(needle.size, 100)) return 'Bitte prüfe die ausgewählten Nadeln.';
    }
    if (new Set(project.needles.map((needle) => needle.id)).size !== project.needles.length) return 'Eine Nadel ist mehrfach ausgewählt. Bitte aktualisiere die Auswahl.';

    if (project.patternYarn && !this.isPositiveFinite(project.patternYarn.amount, 1_000_000)) return 'Bitte gib eine gültige Garnmenge für die Maschenprobe ein.';
    if (project.gauge && (!this.isPositiveFinite(project.gauge.pattern.stitches, 1000) || !this.isPositiveFinite(project.gauge.pattern.rows, 1000) || !this.isPositiveFinite(project.gauge.personal.stitches, 1000) || !this.isPositiveFinite(project.gauge.personal.rows, 1000))) return 'Bitte prüfe die Maschenprobe.';

    if (project.instructionMode === 'pdf') {
      if ((!project.instructionPdf && !this.editingId) || (project.instructionPdf && !project.instructionPdf.startsWith('data:application/pdf;base64,JVBERi0'))) return 'Bitte lade eine gültige PDF-Anleitung hoch.';
      if (!project.instructionPdfName?.trim() || project.instructionPdfName.length > 255) return 'Der Dateiname der PDF-Anleitung ist ungültig.';
    } else {
      if (project.sections.length === 0) return 'Bitte füge mindestens einen Abschnitt mit einer Anleitung hinzu.';
      const sectionIds = new Set<string>();
      const needleIds = new Set(project.needles.map((needle) => needle.id));
      const yarnIds = new Set(project.yarns.map((yarn) => yarn.id));
      for (const section of project.sections) {
        if (!section.id || sectionIds.has(section.id)) return 'Jeder Anleitungsabschnitt braucht eine eindeutige Kennung.';
        sectionIds.add(section.id);
        if (!section.name.trim() || section.name.trim().length > 100) return 'Bitte gib jedem Abschnitt einen Namen mit höchstens 100 Zeichen.';
        if (section.needleId && !needleIds.has(section.needleId)) return `Die ausgewählte Nadel im Abschnitt „${section.name}“ ist nicht mehr vorhanden.`;
        if (section.entries.length === 0) return `Bitte füge im Abschnitt „${section.name}“ mindestens eine Reihenanweisung hinzu.`;
        if (section.entries.length > 300) return `Der Abschnitt „${section.name}“ enthält zu viele Anweisungen.`;
        if (this.sectionRows(section).length !== this.lastRow(section)) return `Die Reihen im Abschnitt „${section.name}“ müssen lückenlos und ohne Überschneidungen ab Reihe 1 eingetragen sein.`;
        if (this.lastRow(section) > 10_000) return `Der Abschnitt „${section.name}“ darf höchstens 10.000 Reihen enthalten.`;
        for (const entry of section.entries) {
          if (!entry.id || !Number.isInteger(entry.fromRow) || !Number.isInteger(entry.toRow) || entry.fromRow < 1 || entry.toRow < entry.fromRow || entry.toRow > 100_000) return `Bitte prüfe die Reihenangaben im Abschnitt „${section.name}“.`;
          if (entry.yarnId && !yarnIds.has(entry.yarnId)) return `Das ausgewählte Garn im Abschnitt „${section.name}“ ist nicht mehr vorhanden.`;
          if (entry.type === 'range') {
            if (!entry.instructions.trim() || entry.instructions.trim().length > 500 || !Number.isInteger(entry.stitchesPerRow) || entry.stitchesPerRow < 1 || entry.stitchesPerRow > 100_000) return `Bitte ergänze Anweisung und Maschenzahl im Abschnitt „${section.name}“.`;
          } else {
            if (entry.repeatRows.length === 0 || entry.repeatRows.length > 100) return `Die Reihenwiederholung im Abschnitt „${section.name}“ braucht 1 bis 100 Musterreihen.`;
            for (const row of entry.repeatRows) {
              if (!row.instructions.trim() || row.instructions.trim().length > 500 || !Number.isInteger(row.stitchesPerRow) || row.stitchesPerRow < 1 || row.stitchesPerRow > 100_000) return `Bitte ergänze alle Musterreihen im Abschnitt „${section.name}“ vollständig.`;
              if (row.yarnId && !yarnIds.has(row.yarnId)) return `Das ausgewählte Garn im Abschnitt „${section.name}“ ist nicht mehr vorhanden.`;
            }
          }
        }
      }
    }

    if (project.progress.activeSectionId && !project.sections.some((section) => section.id === project.progress.activeSectionId)) return 'Der aktive Anleitungsabschnitt ist nicht mehr vorhanden.';
    if (Object.values(project.progress.completedRows).some((rows) => !Number.isInteger(rows) || rows < 0 || rows > 100_000)) return 'Der gespeicherte Reihenfortschritt ist ungültig.';
    if (project.progress.changelog.length > 500) return 'Das Projekt enthält zu viele Fortschrittseinträge. Bitte lade die Seite neu.';
    return null;
  }

  private isPositiveFinite(value: number | undefined, maximum: number): boolean {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= maximum;
  }

  protected startProject(project: Project): void {
    if (project.progress.cancelledAt) return;
    if (!project.sections.length) {
      this.error = 'Füge zuerst mindestens einen Anleitungsabschnitt hinzu.';
      return;
    }
    const next = structuredClone(project);
    const timestamp = new Date().toISOString();
    next.progress.startedAt = timestamp;
    next.progress.activeSectionId ??= next.sections[0].id;
    next.progress.changelog.push({
      id: this.createId(),
      type: 'started',
      timestamp,
      sectionId: next.progress.activeSectionId ?? undefined,
    });
    this.saveProgress(next);
  }

  protected selectSection(project: Project): void {
    if (!project.progress.startedAt || !project.progress.activeSectionId) return;
    const next = structuredClone(project);
    const sectionId = next.progress.activeSectionId;
    if (!sectionId) return;
    next.progress.changelog.push({
      id: this.createId(),
      type: 'section_changed',
      timestamp: new Date().toISOString(),
      sectionId,
    });
    this.saveProgress(next);
  }

  protected completeNextRow(project: Project): void {
    const section = project.sections.find((item) => item.id === project.progress.activeSectionId);
    if (!section) return;
    const rows = this.sectionRows(section);
    const completed = project.progress.completedRows[section.id] ?? 0;
    const row = rows[completed];
    if (!row) return;

    const next = structuredClone(project);
    next.progress.completedRows[section.id] = completed + 1;
    next.progress.changelog.push({
      id: this.createId(),
      type: 'row_completed',
      timestamp: new Date().toISOString(),
      sectionId: section.id,
      rowNumber: row.number,
    });
    this.saveProgress(next);
  }

  protected saveProgress(project: Project): void {
    this.busyProjectId = project.id;
    this.projectService.update(project.id, project).subscribe({
      next: ({ project: saved }) => {
        const normalized = this.normalizeProject(saved);
        this.projects = this.projects.map((item) => item.id === saved.id ? normalized : item)
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
        if (this.selectedProject?.id === saved.id) this.selectedProject = normalized;
        this.busyProjectId = '';
        this.error = '';
        this.loadFeed();
        this.changeDetector.markForCheck();
      },
      error: (error: Error) => {
        this.busyProjectId = '';
        this.error = error.message;
        this.changeDetector.markForCheck();
      },
    });
  }

  protected cancelProject(project: Project): void {
    this.busyProjectId = project.id;
    this.projectService.cancel(project.id).subscribe({
      next: ({ project: saved }) => {
        const normalized = this.normalizeProject(saved);
        this.projects = this.projects.map((item) => item.id === saved.id ? normalized : item);
        if (this.selectedProject?.id === saved.id) this.selectedProject = normalized;
        this.busyProjectId = '';
        this.error = '';
        this.loadFeed();
        this.changeDetector.markForCheck();
      },
      error: (error: Error) => {
        this.busyProjectId = '';
        this.error = error.message;
        this.changeDetector.markForCheck();
      },
    });
  }

  protected loadFeed(): void {
    this.feedLoading = true;
    this.projectService.feed().subscribe({
      next: ({ activities }) => {
        this.feedActivities = activities;
        this.feedLoading = false;
        this.feedError = '';
        this.changeDetector.markForCheck();
      },
      error: (error: Error) => {
        this.feedError = error.message;
        this.feedLoading = false;
        this.changeDetector.markForCheck();
      },
    });
  }

  protected progressPercent(project: Project): number {
    let totalStitches = 0;
    let completedStitches = 0;
    for (const section of project.sections) {
      const rows = this.sectionRows(section);
      totalStitches += rows.reduce((total, row) => total + row.stitches, 0);
      const completed = Math.min(project.progress.completedRows[section.id] ?? 0, rows.length);
      completedStitches += rows.slice(0, completed).reduce((total, row) => total + row.stitches, 0);
    }
    return totalStitches ? Math.round(completedStitches / totalStitches * 100) : 0;
  }

  protected sectionPercent(project: Project, section: ProjectSection): number {
    const rows = this.sectionRows(section);
    const total = rows.reduce((sum, row) => sum + row.stitches, 0);
    const completedCount = Math.min(project.progress.completedRows[section.id] ?? 0, rows.length);
    const completed = rows.slice(0, completedCount).reduce((sum, row) => sum + row.stitches, 0);
    return total ? Math.round(completed / total * 100) : 0;
  }

  protected sectionCompletedRows(project: Project, section: ProjectSection): number {
    return Math.min(project.progress.completedRows[section.id] ?? 0, this.sectionRows(section).length);
  }

  protected currentRow(project: Project): ExpandedRow | null {
    const section = project.sections.find((item) => item.id === project.progress.activeSectionId);
    if (!section) return null;
    return this.sectionRows(section)[project.progress.completedRows[section.id] ?? 0] ?? null;
  }

  protected projectCompleted(project: Project): boolean {
    return project.sections.length > 0 && project.sections.every(
      (section) => this.sectionCompletedRows(project, section) >= this.sectionRows(section).length,
    );
  }

  protected sectionProgressMap(project: Project): Record<string, number> {
    return Object.fromEntries(project.sections.map((section) => [section.id, this.sectionPercent(project, section)]));
  }

  protected sectionNeedlesMap(project: Project): Record<string, string> {
    return Object.fromEntries(project.sections.map((section) => [section.id, this.needleNameById(section.needleId, project.needles)]));
  }

  protected categoryName(category: ProjectCategory | undefined): string {
    return this.categories.find((item) => item.value === category)?.label ?? 'Sonstiges';
  }

  protected deleteProject(project: Project): void {
    this.projectService.delete(project.id).subscribe({
      next: () => {
        this.projects = this.projects.filter((item) => item.id !== project.id);
        this.changeDetector.markForCheck();
      },
      error: (error: Error) => {
        this.error = error.message;
        this.changeDetector.markForCheck();
      },
    });
  }

  protected formatDate(value: string): string {
    return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(new Date(value));
  }

  protected needleName(needle: Needle): string {
    return `${this.needleKindName(needle.type)} ${needle.size} mm`;
  }

  protected needleKindName(type: NeedleKind): string {
    return this.needleKinds.find((item) => item.value === type)?.label ?? 'Nadel';
  }

  protected needleNameById(needleId: string | undefined, needles: Needle[] = this.draft.needles): string {
    const needle = needles.find((item) => item.id === needleId);
    return needle ? this.needleName(needle) : 'Keine Nadel ausgewählt';
  }

  protected sectionRows(section: ProjectSection): ExpandedRow[] {
    const rows = new Map<number, ExpandedRow>();
    for (const entry of section.entries) {
      const width = entry.toRow - entry.fromRow + 1;
      if (entry.fromRow < 1 || width < 1 || width > 100_000) continue;
      for (let offset = 0; offset < width; offset += 1) {
        const rowNumber = entry.fromRow + offset;
        const instruction = entry.type === 'repeat'
          ? entry.repeatRows[offset % Math.max(entry.repeatRows.length, 1)]
          : entry;
        if (instruction) {
          rows.set(rowNumber, {
            number: rowNumber,
            stitches: instruction.stitchesPerRow,
            instructions: instruction.instructions,
            yarnId: instruction.yarnId ?? entry.yarnId ?? undefined,
          });
        }
      }
    }
    return [...rows.values()].sort((left, right) => left.number - right.number);
  }

  protected lastRow(section: ProjectSection): number {
    return section.entries.reduce((max, entry) => Math.max(max, entry.toRow), 0);
  }

  private normalizeLibraryYarn(yarn: Yarn): Yarn {
    const legacy = yarn as Yarn & { colorCode?: string; composition?: Yarn['composition'] };
    return {
      id: legacy.id,
      name: legacy.name,
      brand: legacy.brand,
      color: legacy.color,
      colorCode: legacy.colorCode ?? '',
      needleSize: Math.max(legacy.needleSize || 4, 0.1),
      length: Math.max(legacy.length || 100, 1),
      weight: Math.max(legacy.weight || 50, 1),
      composition: Array.isArray(legacy.composition)
        ? legacy.composition.map((item) => ({ material: item.material, percentage: item.percentage }))
        : [],
    };
  }

  private normalizeProjectYarn(yarn: Yarn | ProjectYarn): ProjectYarn {
    const projectYarn = yarn as ProjectYarn;
    return {
      ...this.normalizeLibraryYarn(projectYarn),
      gauge: projectYarn.gauge ?? { stitches: 10, rows: 10 },
    };
  }

  private normalizeProject(project: Project): Project {
    const legacy = project as Project & { category?: ProjectCategory; mainYarnId?: string | null };
    const normalized = { ...legacy };
    delete normalized.mainYarnId;
    const defaultYarnId = legacy.yarns[0]?.id;
    return {
      ...normalized,
      category: legacy.category ?? 'other',
      instructionMode: legacy.instructionMode ?? 'manual',
      instructionPdf: legacy.instructionPdf ?? null,
      instructionPdfName: legacy.instructionPdfName ?? null,
      yarns: legacy.yarns.map((yarn) => this.normalizeProjectYarn(yarn)),
      sections: legacy.sections.map((section) => ({
        ...section,
        entries: section.entries.map((entry) => entry.type === 'range'
          ? { ...entry, yarnId: entry.yarnId ?? defaultYarnId }
          : {
            ...entry,
            yarnId: entry.yarnId ?? defaultYarnId,
            repeatRows: entry.repeatRows.map((row) => ({ ...row, yarnId: row.yarnId ?? entry.yarnId ?? defaultYarnId })),
          }),
      })),
    };
  }

  private newProject(): ProjectInput {
    return {
      type: 'knitting',
      category: 'sweater',
      name: '',
      image: null,
      gauge: undefined,
      patternYarn: null,
      yarns: [],
      needles: [],
      instructionMode: 'manual',
      instructionPdf: null,
      instructionPdfName: null,
      sections: [],
      progress: { startedAt: null, activeSectionId: null, completedRows: {}, changelog: [] },
    };
  }

  private createId(): string {
    return crypto.randomUUID();
  }
}
