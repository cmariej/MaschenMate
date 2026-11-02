import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';

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
  image: string | null;
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

export type FeedActivityType = 'started' | 'section_completed' | 'finished' | 'cancelled';

export interface FeedActivity {
  id: string;
  userId: string;
  projectId: string;
  projectName: string;
  projectImage: string | null;
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

  instructionPdfUrl(projectId: string): string {
    return `${this.apiUrl}/${encodeURIComponent(projectId)}/instruction-pdf`;
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

  cancel(projectId: string): Observable<{ project: Project }> {
    return this.http.post<{ project: Project }>(`${this.apiUrl}/${encodeURIComponent(projectId)}/cancel`, {}, { withCredentials: true }).pipe(
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
