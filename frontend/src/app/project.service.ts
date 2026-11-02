import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';

export type ProjectKind = 'crochet' | 'knitting';
export type ProjectCategory = 'sweater' | 'hat' | 'scarf' | 'socks' | 'blanket' | 'bag' | 'accessory' | 'other';
export type YarnUnit = 'g' | 'm';
export type NeedleKind = 'straight' | 'circular' | 'double-pointed' | 'crochet-hook' | 'other';

export interface Gauge {
  stitches: number;
  rows: number;
}

export interface PatternYarn {
  amount: number;
  unit: YarnUnit;
}

export interface Yarn {
  id: string;
  name: string;
  brand: string;
  color: string;
  colorCode: string;
  needleSize: number;
  length: number;
  weight: number;
  composition: YarnComposition[];
}

export interface YarnComposition {
  material: string;
  percentage: number;
}

export interface ProjectYarn extends Yarn {
  gauge: Gauge;
  needUnknown: boolean;
  plannedSkeins: number | null;
  swatchWeightKnown: boolean;
  swatchWeightGrams: number | null;
}

export interface Needle {
  id: string;
  type: NeedleKind;
  size: number;
}

export interface InstructionRow {
  instructions: string;
  stitchesPerRow: number;
  yarnId?: string;
}

export interface InstructionRange extends InstructionRow {
  id: string;
  type: 'range';
  fromRow: number;
  toRow: number;
}

export interface InstructionRepeat {
  id: string;
  type: 'repeat';
  fromRow: number;
  toRow: number;
  repeatRows: InstructionRow[];
  yarnId?: string;
}

export type InstructionEntry = InstructionRange | InstructionRepeat;

export interface ProjectSection {
  id: string;
  name: string;
  entries: InstructionEntry[];
  needleId?: string;
}

export interface PdfSection {
  id: string;
  name: string;
  rowCount: number;
}

export interface ProjectLogEntry {
  id: string;
  type: 'started' | 'section_changed' | 'row_completed' | 'row_reopened';
  timestamp: string;
  sectionId?: string;
  rowNumber?: number;
}

export interface ProjectProgress {
  startedAt: string | null;
  cancelledAt?: string | null;
  activeSectionId: string | null;
  pdfProgress?: number;
  completedRows: Record<string, number>;
  changelog: ProjectLogEntry[];
}

export interface ProjectInput {
  type: ProjectKind;
  category: ProjectCategory;
  name: string;
  size: string;
  image: string | null;
  designer?: string;
  websiteUrl?: string;
  gauge?: {
    pattern: Gauge;
    personal: Gauge;
  };
  patternYarn: PatternYarn | null;
  yarns: ProjectYarn[];
  needles: Needle[];
  instructionMode: 'manual' | 'pdf';
  instructionPdf: string | null;
  instructionPdfName: string | null;
  pdfSections: PdfSection[];
  sections: ProjectSection[];
  progress: ProjectProgress;
}

export interface MaterialLibrary {
  yarns: Yarn[];
  needles: Needle[];
}

export interface Project extends ProjectInput {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateSummary {
  id: string;
  name: string;
  creatorUsername: string;
  isOwner: boolean;
  shared: boolean;
  designer?: string;
  size: string;
  type: ProjectKind;
  category: ProjectCategory;
  instructionMode: 'manual' | 'pdf';
  hasImage: boolean;
  createdAt: string;
}

export interface ProjectTemplate extends TemplateSummary {
  websiteUrl?: string;
  sharingRestricted?: boolean;
  projectName: string;
  image: ProjectInput['image'];
  gauge: ProjectInput['gauge'];
  patternYarn: ProjectInput['patternYarn'];
  yarns: ProjectYarn[];
  needles: Needle[];
  instructionPdfName: string | null;
  pdfSections: PdfSection[];
  sections: ProjectSection[];
}

export type FeedActivityType = 'started' | 'section_completed' | 'finished' | 'cancelled' | 'template_shared';

export interface FeedActivity {
  id: string;
  userId: string;
  projectId: string;
  projectName: string;
  projectImage: string | null;
  templateHasImage?: boolean;
  projectType: ProjectKind;
  projectCategory: ProjectCategory;
  type: FeedActivityType;
  sectionName: string | null;
  createdAt: string;
  actor: { id: string; name: string; username: string; profileImage: string | null };
}

@Injectable({ providedIn: 'root' })
export class ProjectService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${window.MASCHENMATE_CONFIG?.apiUrl?.replace(/\/+$/, '') ?? ''}/api/projects`;
  private readonly feedUrl = `${window.MASCHENMATE_CONFIG?.apiUrl?.replace(/\/+$/, '') ?? ''}/api/feed`;
  private readonly templatesUrl = `${window.MASCHENMATE_CONFIG?.apiUrl?.replace(/\/+$/, '') ?? ''}/api/project-templates`;

  listTemplates(): Observable<{ templates: TemplateSummary[] }> {
    return this.http.get<{ templates: TemplateSummary[] }>(this.templatesUrl, { withCredentials: true }).pipe(catchError((error: HttpErrorResponse) => this.handleError(error)));
  }

  saveTemplate(projectId: string, name: string): Observable<{ template: TemplateSummary }> {
    return this.http.post<{ template: TemplateSummary }>(this.templatesUrl, { projectId, name }, { withCredentials: true }).pipe(catchError((error: HttpErrorResponse) => this.handleError(error)));
  }

  getTemplate(id: string): Observable<{ template: ProjectTemplate }> {
    return this.http.get<{ template: ProjectTemplate }>(`${this.templatesUrl}/${encodeURIComponent(id)}`, { withCredentials: true }).pipe(catchError((error: HttpErrorResponse) => this.handleError(error)));
  }

  templatePdfUrl(id: string): string {
    return `${this.templatesUrl}/${encodeURIComponent(id)}/instruction-pdf`;
  }

  downloadTemplatePdf(id: string): Observable<Blob> {
    return this.downloadPdf(this.templatePdfUrl(id));
  }

  templateImageUrl(id: string): string {
    return `${this.templatesUrl}/${encodeURIComponent(id)}/image`;
  }

  createFromTemplate(id: string, name: string): Observable<{ project: Project }> {
    return this.http.post<{ project: Project }>(`${this.templatesUrl}/${encodeURIComponent(id)}/projects`, { name }, { withCredentials: true }).pipe(catchError((error: HttpErrorResponse) => this.handleError(error)));
  }

  deleteTemplate(id: string): Observable<void> {
    return this.http.delete<void>(`${this.templatesUrl}/${encodeURIComponent(id)}`, { withCredentials: true }).pipe(catchError((error: HttpErrorResponse) => this.handleError(error)));
  }

  setTemplateSharing(id: string, shared: boolean): Observable<{ shared: boolean }> {
    return this.http.put<{ shared: boolean }>(`${this.templatesUrl}/${encodeURIComponent(id)}/sharing`, shared ? { shared: true, rightsConfirmed: true } : { shared: false }, { withCredentials: true }).pipe(catchError((error: HttpErrorResponse) => this.handleError(error)));
  }

  instructionPdfUrl(projectId: string): string {
    return `${this.apiUrl}/${encodeURIComponent(projectId)}/instruction-pdf`;
  }

  downloadInstructionPdf(projectId: string): Observable<Blob> {
    return this.downloadPdf(this.instructionPdfUrl(projectId));
  }

  private downloadPdf(url: string): Observable<Blob> {
    return this.http.get(url, { responseType: 'blob', withCredentials: true }).pipe(
      map((pdf) => {
        if (pdf.type.split(';')[0].toLowerCase() !== 'application/pdf' || !pdf.size) throw new Error('Die PDF-Anleitung konnte nicht geladen werden. Bitte versuche es erneut.');
        return pdf;
      }),
      catchError((error: unknown) => error instanceof HttpErrorResponse ? this.handleError(error) : throwError(() => error)),
    );
  }

  list(): Observable<{ projects: Project[] }> {
    return this.http.get<{ projects: Project[] }>(this.apiUrl, { withCredentials: true }).pipe(
      catchError((error: HttpErrorResponse) => this.handleError(error)),
    );
  }

  listMaterials(): Observable<{ materials: MaterialLibrary }> {
    return this.http.get<{ materials: MaterialLibrary }>(`${this.apiUrl.replace(/\/projects$/, '/materials')}`, { withCredentials: true }).pipe(
      catchError((error: HttpErrorResponse) => this.handleError(error)),
    );
  }

  saveMaterials(materials: MaterialLibrary): Observable<{ materials: MaterialLibrary }> {
    return this.http.put<{ materials: MaterialLibrary }>(`${this.apiUrl.replace(/\/projects$/, '/materials')}`, materials, { withCredentials: true }).pipe(
      catchError((error: HttpErrorResponse) => this.handleError(error)),
    );
  }

  create(project: ProjectInput): Observable<{ project: Project }> {
    return this.http.post<{ project: Project }>(this.apiUrl, project, { withCredentials: true }).pipe(
      catchError((error: HttpErrorResponse) => this.handleError(error)),
    );
  }

  update(projectId: string, project: ProjectInput): Observable<{ project: Project }> {
    return this.http.put<{ project: Project }>(`${this.apiUrl}/${encodeURIComponent(projectId)}`, project, { withCredentials: true }).pipe(
      catchError((error: HttpErrorResponse) => this.handleError(error)),
    );
  }

  updateProgress(project: Project): Observable<{ project: Project }> {
    const projectData: Record<string, unknown> = { ...project };
    delete projectData['image'];
    delete projectData['instructionPdf'];
    delete projectData['instructionPdfName'];
    return this.http.put<{ project: Project }>(`${this.apiUrl}/${encodeURIComponent(project.id)}`, projectData, { withCredentials: true }).pipe(
      catchError((error: HttpErrorResponse) => this.handleError(error)),
    );
  }

  uploadInstructionPdf(projectId: string, file: File): Observable<void> {
    const url = `${this.instructionPdfUrl(projectId)}?name=${encodeURIComponent(file.name)}`;
    return this.http.put<void>(url, file, {
      headers: { 'Content-Type': 'application/pdf' },
      withCredentials: true,
    }).pipe(
      catchError((error: HttpErrorResponse) => this.handleError(error)),
    );
  }

  cancel(projectId: string): Observable<{ project: Project }> {
    return this.http.post<{ project: Project }>(`${this.apiUrl}/${encodeURIComponent(projectId)}/cancel`, {}, { withCredentials: true }).pipe(
      catchError((error: HttpErrorResponse) => this.handleError(error)),
    );
  }

  restart(projectId: string): Observable<{ project: Project }> {
    return this.http.post<{ project: Project }>(`${this.apiUrl}/${encodeURIComponent(projectId)}/restart`, {}, { withCredentials: true }).pipe(
      catchError((error: HttpErrorResponse) => this.handleError(error)),
    );
  }

  feed(): Observable<{ activities: FeedActivity[] }> {
    return this.http.get<{ activities: FeedActivity[] }>(this.feedUrl, { withCredentials: true }).pipe(
      catchError((error: HttpErrorResponse) => this.handleError(error)),
    );
  }

  delete(projectId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${encodeURIComponent(projectId)}`, { withCredentials: true }).pipe(
      catchError((error: HttpErrorResponse) => this.handleError(error)),
    );
  }

  private handleError(error: HttpErrorResponse): Observable<never> {
    const message = typeof error.error?.message === 'string'
      ? error.error.message
      : 'Das Projekt konnte nicht gespeichert werden. Bitte versuche es erneut.';
    return throwError(() => new Error(message));
  }
}
