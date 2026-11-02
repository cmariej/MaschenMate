import { ChangeDetectorRef, Component, DestroyRef, ElementRef, OnInit, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { faBookOpen, faFolderOpen, faHouse, faMinus, faPlus, faTrashCan, faShareNodes, faUser } from '@fortawesome/free-solid-svg-icons';
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
import { compareNames } from './name-sort';
import { AuthService } from './auth.service';
import { RegistrationBannerComponent } from './registration-banner.component';
import {
  Gauge,
  InstructionRange,
  InstructionRepeat,
  TemplateSummary,
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
  @ViewChild('currentRowNumberInput') private currentRowNumberInput?: ElementRef<HTMLInputElement>;
  protected readonly faPlus = faPlus;
  protected readonly faMinus = faMinus;
  protected readonly faBookOpen = faBookOpen;
  protected readonly faTrashCan = faTrashCan;
  protected readonly faShareNodes = faShareNodes;
  protected readonly faUser = faUser;
  protected readonly faHomeTab = faHouse;
  protected readonly faProjectsTab = faFolderOpen;

  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly projectService = inject(ProjectService);
  private readonly progressSectionCache = new WeakMap<Project, ProjectSection[]>();
  private preferredCurrentProjectId = '';
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected projects: Project[] = [];
  protected loading = true;
  protected saving = false;
  protected processingProjectImage = false;
  private projectImageRequest = 0;
  protected error = '';
  protected feedError = '';
  protected feedLoading = true;
  protected feedActivities: FeedActivity[] = [];
  protected editingCurrentRow = false;
  protected currentRowInput: number | null = null;
  protected currentRowInputError = '';
  protected editorError = '';
  protected templates: TemplateSummary[] = [];
  protected templatesLoading = false;
  protected templatesError = '';
  protected templateSaving = false;
  protected templateSaved = false;
  protected templateError = '';
  protected templateDeleteId: string | null = null;
  protected templateTypeFilter: 'all' | 'knitting' | 'crochet' = 'all';
  protected templateOwnerFilter: 'all' | 'own' | 'friends' = 'all';
  protected templateCategoryFilter: 'all' | ProjectCategory = 'all';
  protected readonly duplicationMessage = signal('');
  private duplicationMessageTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingInstructionPdf: File | null = null;
  protected busyProjectId = '';
  protected editingId: string | null = null;
  protected instructionOnlyEditor = false;
  protected draft: ProjectInput = this.newProject();
  protected page: 'home' | 'projects' | 'templates' | 'yarns' | 'needles' = 'home';
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
    this.destroyRef.onDestroy(() => {
      if (this.duplicationMessageTimer !== null) clearTimeout(this.duplicationMessageTimer);
    });
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe((event) => this.syncRoute(event.urlAfterRedirects));
    this.syncRoute(this.router.url);
    this.loadProjects();
    this.loadFeed();
    this.loadMaterials();
    this.loadTemplates();
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
    ).sort((left, right) => compareNames(left.name, right.name));
  }

  protected get filteredTemplates(): TemplateSummary[] {
    return this.templates.filter((template) =>
      (this.templateTypeFilter === 'all' || template.type === this.templateTypeFilter)
      && (this.templateOwnerFilter === 'all' || template.isOwner === (this.templateOwnerFilter === 'own'))
      && (this.templateCategoryFilter === 'all' || template.category === this.templateCategoryFilter))
      .sort((left, right) => compareNames(left.name, right.name));
  }

  protected get activeTemplateFilterCount(): number {
    return Number(this.templateTypeFilter !== 'all') + Number(this.templateCategoryFilter !== 'all') + Number(this.templateOwnerFilter !== 'all');
  }

  protected clearTemplateFilters(): void {
    this.templateTypeFilter = 'all';
    this.templateOwnerFilter = 'all';
    this.templateCategoryFilter = 'all';
  }

  protected loadTemplates(): void {
    this.templatesLoading = true;
    this.templatesError = '';
    this.projectService.listTemplates().subscribe({
      next: ({ templates }) => { this.templates = templates.sort((a, b) => b.createdAt.localeCompare(a.createdAt)); this.templatesLoading = false; this.changeDetector.markForCheck(); },
      error: (error: Error) => { this.templatesError = error.message; this.templatesLoading = false; this.changeDetector.markForCheck(); },
    });
  }

  protected saveProjectTemplate(project: Project, name: string): void {
    if (this.templateSaving) return;
    this.templateSaving = true;
    this.templateSaved = false;
    this.templateError = '';
    this.projectService.saveTemplate(project.id, name).subscribe({
      next: ({ template }) => {
        this.templates = [template, ...this.templates];
        this.templateSaving = false;
        this.templateSaved = true;
        void this.router.navigateByUrl(`/templates/${encodeURIComponent(template.id)}`);
        this.changeDetector.markForCheck();
      },
      error: (error: Error) => { this.templateError = error.message; this.templateSaving = false; this.changeDetector.markForCheck(); },
    });
  }

  protected deleteTemplate(id: string): void {
    this.templatesError = '';
    this.projectService.deleteTemplate(id).subscribe({
      next: () => { this.templates = this.templates.filter((template) => template.id !== id); this.templateDeleteId = null; this.changeDetector.markForCheck(); },
      error: (error: Error) => { this.templatesError = error.message; this.changeDetector.markForCheck(); },
    });
  }

  protected openTemplate(id: string): void {
    void this.router.navigateByUrl(`/templates/${encodeURIComponent(id)}`);
  }

  protected templateImageUrl(id: string): string {
    return this.projectService.templateImageUrl(id);
  }

  protected get activeProjectFilterCount(): number {
    return Number(this.projectTypeFilter !== 'all') + Number(this.projectCategoryFilter !== 'all');
  }

  protected clearProjectFilters(): void {
    this.projectTypeFilter = 'all';
    this.projectCategoryFilter = 'all';
  }

  protected get projectsToShow(): Project[] {
    return this.filteredProjects;
  }

  protected get activeProjects(): Project[] {
    return this.projects.filter((project) =>
      project.progress.startedAt && !project.progress.cancelledAt && !this.projectCompleted(project),
    );
  }

  protected get currentProject(): Project | null {
    return this.activeProjects.find((project) => project.id === this.preferredCurrentProjectId)
      ?? this.activeProjects[0]
      ?? null;
  }

  protected makeCurrentProject(project: Project): void {
    if (!this.activeProjects.some((active) => active.id === project.id)) return;
    this.preferredCurrentProjectId = project.id;
    const userId = this.auth.user()?.id;
    if (userId) {
      try {
        localStorage.setItem(`maschenmate-current-project:${userId}`, project.id);
      } catch {
        // Keep the current selection for this session if browser storage is unavailable.
      }
    }
    this.changeDetector.markForCheck();
  }

  protected get currentSection(): ProjectSection | null {
    const project = this.currentProject;
    return project ? this.progressSection(project, project.progress.activeSectionId) : null;
  }

  protected get currentRowNumber(): number {
    const project = this.currentProject;
    const section = this.currentSection;
    if (!project || !section) return 0;
    return this.currentRow(project)?.number ?? this.sectionRows(section).length + 1;
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
    ).sort((left, right) => compareNames(left.name, right.name) || compareNames(left.brand, right.brand) || compareNames(left.color, right.color));
  }

  protected get sortedNeedles(): Needle[] {
    return [...this.materials.needles].sort((left, right) =>
      compareNames(this.needleKindName(left.type), this.needleKindName(right.type)) || left.size - right.size);
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
      : segments[0] === 'templates'
        ? 'templates'
      : segments[0] === 'yarns'
        ? 'yarns'
        : segments[0] === 'needles'
          ? 'needles'
          : 'home';
    this.view = 'list';
    this.selectedProject = null;
    this.yarnDraft = null;
    this.needleDraft = null;
    this.instructionOnlyEditor = false;

    const preservePath = this.preserveProjectDraftOnPath.replace(/^\/+|\/+$/g, '');
    if (preservePath && path === preservePath) {
      this.preserveProjectDraftOnPath = '';
      this.instructionOnlyEditor = preservePath.split('/')[3] === 'instructions';
      this.view = 'project-edit';
      this.lastRoutePath = path;
      return;
    }

    if (segments[0] === 'projects' && segments[1] === 'new') {
      this.editingId = null;
      this.pendingInstructionPdf = null;
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
        this.instructionOnlyEditor = segments[3] === 'instructions';
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

  private pagePath(page: 'home' | 'projects' | 'templates' | 'yarns' | 'needles'): string {
    return page === 'home' ? '/dashboard' : `/${page}`;
  }

  protected loadProjects(): void {
    this.loading = true;
    this.projectService.list().subscribe({
      next: ({ projects }) => {
        this.projects = projects.map((project) => this.normalizeProject(project))
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
        const userId = this.auth.user()?.id;
        if (userId) {
          try {
            this.preferredCurrentProjectId = localStorage.getItem(`maschenmate-current-project:${userId}`) ?? '';
          } catch {
            this.preferredCurrentProjectId = '';
          }
        }
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

  protected showPage(page: 'home' | 'projects' | 'templates' | 'yarns' | 'needles'): void {
    if (page === 'home' && this.returnToEditorPath) {
      const returnPath = this.returnToEditorPath;
      this.returnToEditorPath = '';
      this.preserveProjectDraftOnPath = returnPath;
      void this.router.navigateByUrl(returnPath, { state: { projectReturnPath: this.projectReturnPath() } });
      return;
    }
    this.returnToEditorPath = '';
    this.selectedProject = null;
    void this.router.navigateByUrl(this.pagePath(page));
  }

  protected openMaterialsFromEditor(): void {
    this.returnToEditorPath = this.router.url;
    void this.router.navigateByUrl('/yarns', { state: { projectReturnPath: this.projectReturnPath() } });
  }

  protected openNewProject(): void {
    this.editingId = null;
    this.instructionOnlyEditor = false;
    this.pendingInstructionPdf = null;
    this.draft = this.newProject();
    this.editorError = '';
    void this.router.navigateByUrl('/projects/new');
  }

  protected editProject(project: Project): void {
    this.instructionOnlyEditor = false;
    this.setProjectDraft(project);
    void this.router.navigateByUrl(`/projects/${encodeURIComponent(project.id)}/edit`, { state: { projectReturnPath: this.projectReturnPath() } });
  }

  protected editProjectInstructions(project: Project): void {
    this.instructionOnlyEditor = true;
    this.setProjectDraft(project);
    void this.router.navigateByUrl(`/projects/${encodeURIComponent(project.id)}/edit/instructions`, { state: { projectReturnPath: this.projectReturnPath() } });
  }

  private setProjectDraft(project: Project): void {
    const { id, userId, createdAt, updatedAt, patternYarn, ...input } = structuredClone(project);
    this.editingId = id;
    this.pendingInstructionPdf = null;
    const projectYarns = input.yarns.map((yarn) => this.normalizeProjectYarn(yarn));
    this.draft = {
      ...input,
      category: input.category ?? 'other',
      yarns: projectYarns,
      needles: input.needles,
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

  protected removeLibraryYarn(id: string): void {
    if (this.materialsSaving) return;
    if (!this.materials.yarns.some((item) => item.id === id)) { this.error = 'Dieses Garn wurde nicht gefunden.'; return; }
    this.saveMaterialLibrary({ ...this.materials, yarns: this.materials.yarns.filter((item) => item.id !== id) }, () => {
      this.yarnDraft = null;
      void this.router.navigateByUrl('/yarns');
    });
  }

  protected removeLibraryNeedle(id: string): void {
    if (this.materialsSaving) return;
    if (!this.materials.needles.some((item) => item.id === id)) { this.error = 'Diese Nadel wurde nicht gefunden.'; return; }
    this.saveMaterialLibrary({ ...this.materials, needles: this.materials.needles.filter((item) => item.id !== id) }, () => {
      this.needleDraft = null;
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
    this.templateSaved = false;
    this.templateError = '';
    const projectReturnPath = this.page === 'home' ? '/dashboard' : '/projects';
    void this.router.navigateByUrl(`/projects/${encodeURIComponent(project.id)}`, { state: { projectReturnPath } });
  }

  protected closeDetails(): void {
    void this.router.navigateByUrl(this.projectReturnPath());
  }

  private projectReturnPath(): '/dashboard' | '/projects' {
    return history.state?.projectReturnPath === '/dashboard' ? '/dashboard' : '/projects';
  }

  protected changeCurrentRow(project: Project, delta: -1 | 1): void {
    const section = this.progressSection(project, project.progress.activeSectionId);
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

  protected editCurrentRowNumber(): void {
    this.currentRowInput = this.currentRowNumber;
    this.currentRowInputError = '';
    this.editingCurrentRow = true;
    setTimeout(() => this.currentRowNumberInput?.nativeElement.focus());
  }

  protected cancelCurrentRowEdit(): void {
    this.editingCurrentRow = false;
    this.currentRowInput = null;
    this.currentRowInputError = '';
  }

  protected saveCurrentRowNumber(project: Project): void {
    const section = this.progressSection(project, project.progress.activeSectionId);
    const requestedRow = this.currentRowInput;
    if (!section || requestedRow === null || !Number.isInteger(requestedRow)) {
      this.currentRowInputError = 'Bitte gib eine ganze Reihennummer ein.';
      return;
    }
    const rows = this.sectionRows(section);
    const maxNextRow = rows.length + 1;
    if (requestedRow < 1 || requestedRow > maxNextRow) {
      this.currentRowInputError = `Gib eine Zahl zwischen 1 und ${maxNextRow} ein.`;
      return;
    }
    const completed = project.progress.completedRows[section.id] ?? 0;
    const nextCompleted = requestedRow - 1;
    if (completed !== nextCompleted) {
      const next = structuredClone(project);
      next.progress.completedRows[section.id] = nextCompleted;
      next.progress.changelog.push({
        id: this.createId(),
        type: nextCompleted > completed ? 'row_completed' : 'row_reopened',
        timestamp: new Date().toISOString(),
        sectionId: section.id,
        rowNumber: rows[nextCompleted > completed ? nextCompleted - 1 : nextCompleted]?.number,
      });
      this.saveProgress(next);
    }
    this.cancelCurrentRowEdit();
  }

  protected completeCurrentSection(project: Project): void {
    const section = this.progressSection(project, project.progress.activeSectionId);
    if (!section) return;
    const rows = this.sectionRows(section);
    const completed = project.progress.completedRows[section.id] ?? 0;
    if (completed >= rows.length) return;
    const next = structuredClone(project);
    next.progress.completedRows[section.id] = rows.length;
    next.progress.changelog.push({
      id: this.createId(),
      type: 'row_completed',
      timestamp: new Date().toISOString(),
      sectionId: section.id,
      rowNumber: rows[rows.length - 1]?.number,
    });
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
    if (checked) this.draft.yarns.push(this.normalizeProjectYarn({ ...yarn, id: this.createId() }));
    else this.draft.yarns = this.draft.yarns.filter((item) => item.id !== yarn.id);
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
    if (checked) this.draft.needles.push({ ...structuredClone(needle), id: this.createId() });
    else this.draft.needles = this.draft.needles.filter((item) => item.id !== needle.id);
    for (const section of this.draft.sections) {
      if (section.needleId === needle.id && !checked) section.needleId = undefined;
    }
  }

  protected closeEditor(): void {
    if (this.saving) return;
    this.projectImageRequest++;
    this.processingProjectImage = false;
    void this.router.navigateByUrl(this.editingId
      ? `/projects/${encodeURIComponent(this.editingId)}`
      : this.pagePath(this.page), { state: { projectReturnPath: this.projectReturnPath() } });
  }

  protected addSection(): void {
    this.draft.sections.push({
      id: this.createId(),
      name: `Abschnitt ${this.draft.sections.length + 1}`,
      entries: [],
    });
  }

  protected duplicateSection(index: number): void {
    const section = this.draft.sections[index];
    if (!section) return;
    if (this.draft.sections.length >= 50) {
      this.editorError = 'Ein Projekt kann höchstens 50 Abschnitte enthalten.';
      return;
    }
    const copy = structuredClone(section);
    copy.id = this.createId();
    copy.name = `${section.name} (Kopie)`.slice(0, 100);
    copy.entries = copy.entries.map((entry) => ({ ...entry, id: this.createId() }));
    this.draft.sections.push(copy);
    this.editorError = '';
    this.showDuplicationMessage('Abschnitt erfolgreich dupliziert.');
  }

  protected duplicatePdfSection(index: number): void {
    const section = this.draft.pdfSections[index];
    if (!section) return;
    if (this.draft.pdfSections.length >= 50) {
      this.editorError = 'Ein Projekt kann höchstens 50 PDF-Abschnitte enthalten.';
      return;
    }
    this.draft.pdfSections.push({
      ...structuredClone(section),
      id: this.createId(),
      name: `${section.name} (Kopie)`.slice(0, 100),
    });
    this.editorError = '';
    this.showDuplicationMessage('Abschnitt erfolgreich dupliziert.');
  }

  protected duplicateEntry(sectionIndex: number, entryIndex: number): void {
    const section = this.draft.sections[sectionIndex];
    const entry = section?.entries[entryIndex];
    if (!section || !entry) return;
    if (section.entries.length >= 300) {
      this.editorError = `Der Abschnitt „${section.name}“ kann höchstens 300 Anweisungen enthalten.`;
      return;
    }
    const rowCount = entry.toRow - entry.fromRow + 1;
    if (this.lastRow(section) + rowCount > 10_000) {
      this.editorError = 'Die duplizierte Anweisung würde die Grenze von 10.000 Reihen überschreiten.';
      return;
    }
    const copy = structuredClone(entry);
    copy.id = this.createId();
    copy.fromRow = entry.toRow + 1;
    copy.toRow = copy.fromRow + rowCount - 1;
    for (const following of section.entries.slice(entryIndex + 1)) {
      following.fromRow += rowCount;
      following.toRow += rowCount;
    }
    section.entries.splice(entryIndex + 1, 0, copy);
    this.editorError = '';
    this.showDuplicationMessage('Anweisung erfolgreich dupliziert.');
  }

  private showDuplicationMessage(message: string): void {
    if (this.duplicationMessageTimer !== null) clearTimeout(this.duplicationMessageTimer);
    this.duplicationMessage.set(message);
    this.duplicationMessageTimer = setTimeout(() => {
      this.duplicationMessage.set('');
      this.duplicationMessageTimer = null;
    }, 2000);
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

  protected async onProjectImageSelected(event: Event): Promise<void> {
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
    const request = ++this.projectImageRequest;
    const draft = this.draft;
    this.processingProjectImage = true;
    input.value = '';
    const objectUrl = URL.createObjectURL(file);
    try {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('Das Projektbild konnte nicht geöffnet werden.'));
        image.src = objectUrl;
      });
      const scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Das Projektbild konnte nicht verarbeitet werden.');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const encode = (type: string, quality: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
      let optimized = await encode('image/webp', 0.8);
      if (!optimized || optimized.type !== 'image/webp') optimized = await encode('image/jpeg', 0.82);
      if (!optimized) throw new Error('Das Projektbild konnte nicht verarbeitet werden.');
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Das Projektbild konnte nicht gelesen werden.'));
        reader.onerror = () => reject(new Error('Das Projektbild konnte nicht gelesen werden.'));
        reader.readAsDataURL(optimized);
      });
      if (request === this.projectImageRequest && this.draft === draft) draft.image = data;
    } catch (error) {
      if (request === this.projectImageRequest && this.draft === draft) {
        this.editorError = error instanceof Error ? error.message : 'Das Projektbild konnte nicht verarbeitet werden.';
      }
    } finally {
      URL.revokeObjectURL(objectUrl);
      if (request === this.projectImageRequest) {
        this.processingProjectImage = false;
        this.changeDetector.markForCheck();
      }
    }
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
    void file.slice(0, 5).arrayBuffer().then((header) => {
      if (new TextDecoder().decode(header) !== '%PDF-') {
        this.editorError = 'Die ausgewählte Datei ist keine gültige PDF-Datei.';
      } else {
        this.pendingInstructionPdf = file;
        this.draft.instructionPdf = null;
        this.draft.instructionPdfName = file.name;
        this.draft.instructionMode = 'pdf';
      }
      input.value = '';
      this.changeDetector.markForCheck();
    }).catch(() => {
      this.editorError = 'Die PDF-Datei konnte nicht gelesen werden.';
      input.value = '';
      this.changeDetector.markForCheck();
    });
  }

  protected saveProject(): void {
    if (this.processingProjectImage) return;
    this.editorError = '';
    if (!this.draft.instructionPdfName || this.draft.instructionMode !== 'pdf') this.pendingInstructionPdf = null;
    this.draft.progress ??= { startedAt: null, activeSectionId: null, completedRows: {}, changelog: [] };
    this.draft.progress.pdfProgress ??= 0;
    this.draft.progress.completedRows ??= {};
    this.draft.progress.changelog ??= [];
    this.draft.pdfSections ??= [];
    const progressSections = this.draft.instructionMode === 'pdf' ? this.draft.pdfSections : this.draft.sections;
    if (!progressSections.some((section) => section.id === this.draft.progress.activeSectionId)) {
      this.draft.progress.activeSectionId = progressSections[0]?.id ?? null;
    }
    const validationError = this.validateProjectDraft();
    if (validationError) {
      this.editorError = validationError;
      return;
    }

    // Fill optional legacy fields so requests always have the complete shape
    // expected by the API, even when editing an older project.
    const pdfToUpload = this.draft.instructionMode === 'pdf' ? this.pendingInstructionPdf : null;
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
        if (pdfToUpload) {
          this.projectService.uploadInstructionPdf(saved.id, pdfToUpload).subscribe({
            next: () => {
              const uploaded = { ...saved, instructionPdfName: pdfToUpload.name };
              this.projects = this.projects.map((item) => item.id === uploaded.id ? uploaded : item);
              this.finishProjectSave(uploaded);
            },
            error: (error: Error) => {
              this.editorError = `Projekt gespeichert, aber PDF-Upload fehlgeschlagen: ${error.message}`;
              this.saving = false;
              this.changeDetector.markForCheck();
            },
          });
          return;
        }
        this.finishProjectSave(saved);
      },
      error: (error: Error) => {
        this.editorError = error.message;
        this.saving = false;
        this.changeDetector.markForCheck();
      },
    });
  }

  private finishProjectSave(saved: Project): void {
    this.pendingInstructionPdf = null;
    this.saving = false;
    void this.router.navigateByUrl(`/projects/${encodeURIComponent(saved.id)}`, { state: { projectReturnPath: this.projectReturnPath() } });
    this.changeDetector.markForCheck();
  }

  private validateProjectDraft(): string | null {
    const project = this.draft;
    if (!project.name?.trim() || project.name.trim().length > 100) return 'Bitte gib einen Projektnamen mit höchstens 100 Zeichen ein.';
    if ((project.size ?? '').trim().length > 50) return 'Die Größe darf höchstens 50 Zeichen lang sein.';
    if ((project.designer ?? '').trim().length > 100) return 'Der Name des Designers darf höchstens 100 Zeichen lang sein.';
    const websiteUrl = (project.websiteUrl ?? '').trim();
    if (websiteUrl) {
      try { if (websiteUrl.length > 2048 || !['http:', 'https:'].includes(new URL(websiteUrl).protocol)) throw new Error(); }
      catch { return 'Bitte gib eine gültige Webseite mit http:// oder https:// ein.'; }
    }
    const normalizedProjectName = project.name.trim().toLocaleLowerCase();
    if (this.projects.some((item) => item.id !== this.editingId && item.name.trim().toLocaleLowerCase() === normalizedProjectName)) return 'Ein Projekt mit diesem Namen existiert bereits. Bitte wähle einen eindeutigen Namen.';
    if (!['knitting', 'crochet'].includes(project.type)) return 'Bitte wähle eine gültige Art aus.';
    if (!this.categories.some((category) => category.value === project.category)) return 'Bitte wähle eine gültige Kategorie aus.';
    if (project.yarns.length > 30 || project.needles.length > 30 || project.sections.length > 50 || project.pdfSections.length > 50) return 'Das Projekt enthält mehr Materialien oder Abschnitte als erlaubt.';
    if (project.image && !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(project.image)) return 'Das Projektbild hat ein ungültiges Format. Bitte wähle es erneut aus.';

    for (const yarn of project.yarns) {
      if (!yarn.id || !yarn.name.trim() || yarn.name.trim().length > 100) return 'Jedes ausgewählte Garn braucht einen Namen mit höchstens 100 Zeichen.';
      if ((yarn.brand ?? '').length > 100 || (yarn.color ?? '').length > 100 || (yarn.colorCode ?? '').length > 40) return `Die Angaben für „${yarn.name}“ sind zu lang.`;
      if (!this.isPositiveFinite(yarn.needleSize, 100) || !this.isPositiveFinite(yarn.length, 1_000_000) || !this.isPositiveFinite(yarn.weight, 1_000_000)) return `Bitte prüfe Nadelstärke, Lauflänge und Gewicht für „${yarn.name}“.`;
      if (!this.isPositiveFinite(yarn.gauge?.stitches, 1000) || !this.isPositiveFinite(yarn.gauge?.rows, 1000)) return `Bitte gib für „${yarn.name}“ eine gültige Maschenprobe ein.`;
      if (!yarn.needUnknown && (yarn.plannedSkeins === null || !Number.isInteger(yarn.plannedSkeins) || yarn.plannedSkeins < 1 || yarn.plannedSkeins > 500)) return `Bitte gib für „${yarn.name}“ eine Knäuelanzahl zwischen 1 und 500 an oder markiere den Bedarf als unbekannt.`;
      if (yarn.swatchWeightGrams !== null && !this.isPositiveFinite(yarn.swatchWeightGrams, 1000)) return `Bitte gib für „${yarn.name}“ ein gültiges Gewicht der Maschenprobe an.`;
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

    if (this.instructionOnlyEditor && project.instructionMode === 'pdf') {
      if ((!project.instructionPdf && !this.editingId && !this.pendingInstructionPdf) || (project.instructionPdf && !project.instructionPdf.startsWith('data:application/pdf;base64,JVBERi0'))) return 'Bitte lade eine gültige PDF-Anleitung hoch.';
      if (!project.instructionPdfName?.trim() || project.instructionPdfName.length > 255) return 'Der Dateiname der PDF-Anleitung ist ungültig.';
      const pdfSectionIds = new Set<string>();
      for (const section of project.pdfSections) {
        if (!section.id || pdfSectionIds.has(section.id)) return 'Jeder PDF-Abschnitt braucht eine eindeutige Kennung.';
        pdfSectionIds.add(section.id);
        if (!section.name.trim() || section.name.trim().length > 100) return 'Bitte gib jedem PDF-Abschnitt einen Namen mit höchstens 100 Zeichen.';
        if (!Number.isInteger(section.rowCount) || section.rowCount < 1 || section.rowCount > 10_000) return `Bitte gib für „${section.name}“ eine Reihenanzahl zwischen 1 und 10.000 ein.`;
      }
    } else if (this.instructionOnlyEditor) {
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

    if (this.instructionOnlyEditor && project.progress.activeSectionId && !this.trackingSections(project).some((section) => section.id === project.progress.activeSectionId)) return 'Der aktive Anleitungsabschnitt ist nicht mehr vorhanden.';
    if (Object.values(project.progress.completedRows).some((rows) => !Number.isInteger(rows) || rows < 0 || rows > 100_000)) return 'Der gespeicherte Reihenfortschritt ist ungültig.';
    const pdfProgress = project.progress.pdfProgress ?? 0;
    if (!Number.isInteger(pdfProgress) || pdfProgress < 0 || pdfProgress > 100 || pdfProgress % 10 !== 0) return 'Der PDF-Fortschritt muss zwischen 0 und 100 % in 10-%-Schritten liegen.';
    if (project.progress.changelog.length > 500) return 'Das Projekt enthält zu viele Fortschrittseinträge. Bitte lade die Seite neu.';
    return null;
  }

  private isPositiveFinite(value: number | undefined, maximum: number): boolean {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= maximum;
  }

  protected startProject(project: Project): void {
    if (project.progress.cancelledAt) return;
    if (project.instructionMode !== 'pdf' && !project.sections.length) {
      this.error = 'Füge zuerst mindestens einen Anleitungsabschnitt hinzu.';
      return;
    }
    const next = structuredClone(project);
    const timestamp = new Date().toISOString();
    next.progress.startedAt = timestamp;
    if (next.instructionMode === 'pdf') {
      const firstSectionId = next.pdfSections[0]?.id ?? null;
      if (!next.pdfSections.some((section) => section.id === next.progress.activeSectionId)) next.progress.activeSectionId = firstSectionId;
    } else {
      next.progress.activeSectionId ??= next.sections[0].id;
    }
    next.progress.changelog.push({
      id: this.createId(),
      type: 'started',
      timestamp,
      sectionId: next.progress.activeSectionId ?? undefined,
    });
    this.saveProgress(next);
  }

  protected changePdfProgress(project: Project, delta: -10 | 10): void {
    if (project.instructionMode !== 'pdf' || project.pdfSections.length > 0 || !project.progress.startedAt || project.progress.cancelledAt) return;
    const current = project.progress.pdfProgress ?? 0;
    const updated = Math.max(0, Math.min(100, current + delta));
    if (updated === current) return;
    const next = structuredClone(project);
    next.progress.pdfProgress = updated;
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

  protected setCurrentSection(project: Project, sectionId: string): void {
    if (project.progress.activeSectionId === sectionId || this.busyProjectId === project.id) return;
    this.cancelCurrentRowEdit();
    project.progress.activeSectionId = sectionId;
    this.selectSection(project);
  }

  protected completeNextRow(project: Project): void {
    const section = this.progressSection(project, project.progress.activeSectionId);
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
    this.projectService.updateProgress(project).subscribe({
      next: ({ project: saved }) => {
        const normalized = this.normalizeProject({ ...saved, image: project.image });
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

  protected restartProject(project: Project): void {
    if (this.busyProjectId || !project.progress.cancelledAt) return;
    this.error = '';
    this.busyProjectId = project.id;
    this.projectService.restart(project.id).subscribe({
      next: ({ project: saved }) => {
        const normalized = this.normalizeProject(saved);
        this.projects = this.projects.map((item) => item.id === saved.id ? normalized : item)
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
        if (this.selectedProject?.id === saved.id) this.selectedProject = normalized;
        this.busyProjectId = '';
        this.loadFeed();
        this.changeDetector.markForCheck();
      },
      error: (error: Error) => { this.busyProjectId = ''; this.error = error.message; this.changeDetector.markForCheck(); },
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
    if (project.instructionMode === 'pdf') {
      if (!project.pdfSections.length) return project.progress.pdfProgress ?? 0;
      const totalRows = project.pdfSections.reduce((total, section) => total + section.rowCount, 0);
      const completedRows = project.pdfSections.reduce(
        (total, section) => total + Math.min(section.rowCount, project.progress.completedRows[section.id] ?? 0),
        0,
      );
      return totalRows ? Math.round(completedRows / totalRows * 100) : 0;
    }
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
    const section = this.progressSection(project, project.progress.activeSectionId);
    if (!section) return null;
    return this.sectionRows(section)[project.progress.completedRows[section.id] ?? 0] ?? null;
  }

  protected projectCompleted(project: Project): boolean {
    if (project.instructionMode === 'pdf') {
      return project.pdfSections.length
        ? project.pdfSections.every((section) => (project.progress.completedRows[section.id] ?? 0) >= section.rowCount)
        : (project.progress.pdfProgress ?? 0) >= 100;
    }
    return project.sections.length > 0 && project.sections.every(
      (section) => this.sectionCompletedRows(project, section) >= this.sectionRows(section).length,
    );
  }

  protected sectionProgressMap(project: Project): Record<string, number> {
    return Object.fromEntries(this.trackingSections(project).map((section) => [section.id, this.sectionPercent(project, section)]));
  }

  protected sectionNeedlesMap(project: Project): Record<string, string> {
    return Object.fromEntries(this.trackingSections(project).map((section) => [section.id, this.needleNameById(section.needleId, project.needles)]));
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

  protected trackingSections(project: Project | ProjectInput): ProjectSection[] {
    if (project.instructionMode !== 'pdf') return project.sections;
    if ('id' in project) {
      const cached = this.progressSectionCache.get(project);
      if (cached) return cached;
    }
    const sections = project.pdfSections.map((section) => ({
      id: section.id,
      name: section.name,
      entries: [{
        id: section.id,
        type: 'range' as const,
        fromRow: 1,
        toRow: section.rowCount,
        instructions: 'PDF-Reihe',
        stitchesPerRow: 1,
      }],
    }));
    if ('id' in project) this.progressSectionCache.set(project, sections);
    return sections;
  }

  private progressSection(project: Project, sectionId: string | null): ProjectSection | null {
    return this.trackingSections(project).find((section) => section.id === sectionId) ?? null;
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
      needUnknown: projectYarn.needUnknown ?? projectYarn.plannedSkeins == null,
      plannedSkeins: projectYarn.plannedSkeins ?? null,
      swatchWeightKnown: projectYarn.swatchWeightKnown ?? projectYarn.swatchWeightGrams != null,
      swatchWeightGrams: projectYarn.swatchWeightGrams ?? null,
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
      size: legacy.size ?? '',
      designer: legacy.designer ?? '',
      websiteUrl: legacy.websiteUrl ?? '',
      instructionMode: legacy.instructionMode ?? 'manual',
      instructionPdf: legacy.instructionPdf ?? null,
      instructionPdfName: legacy.instructionPdfName ?? null,
      pdfSections: legacy.pdfSections ?? [],
      progress: { ...legacy.progress, pdfProgress: legacy.progress.pdfProgress ?? 0 },
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
      size: '',
      designer: '',
      websiteUrl: '',
      image: null,
      gauge: undefined,
      patternYarn: null,
      yarns: [],
      needles: [],
      instructionMode: 'manual',
      instructionPdf: null,
      instructionPdfName: null,
      pdfSections: [],
      sections: [],
      progress: { startedAt: null, activeSectionId: null, pdfProgress: 0, completedRows: {}, changelog: [] },
    };
  }

  private createId(): string {
    return crypto.randomUUID();
  }

}
