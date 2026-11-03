import { materialId } from './material-selection';
import { repeatRowLabel } from './repeat-row-label';
import { ChangeDetectorRef, Component, DestroyRef, EventEmitter, Input, OnChanges, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { faArrowLeft, faPen } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIconComponent } from './fontawesome-icon.component';
import { Project, ProjectService } from './project.service';
import { compareNames } from './name-sort';
import { Subscription } from 'rxjs';
import { PdfViewerComponent } from './pdf-viewer.component';

export interface ProjectDetailRow {
  number: number;
  stitches: number;
  instructions: string;
  yarnId?: string;
}

interface YarnUsage {
  source: 'pattern' | 'estimate' | 'unknown';
  requiredMeters: number | null;
  consumedMeters: number | null;
  consumptionSource: 'swatch' | 'pattern' | 'none' | 'unknown';
  requiredSkeins: number | null;
  consumedWholeSkeins: number | null;
  openedSkein: boolean | null;
  remainingSkeins: number | null;
}

@Component({
  imports: [FormsModule, FontAwesomeIconComponent, PdfViewerComponent],
  selector: 'app-project-detail',
  styleUrl: './project-detail.component.css',
  template: `
    <section class="detail-page" aria-labelledby="detail-title">
      <header class="detail-page-heading">
        <button class="route-back-button icon-action-button back-navigation-button" type="button" (click)="back.emit()" aria-label="Zurück" title="Zurück"><app-fa-icon [icon]="faArrowLeft" /></button>
        <div class="detail-title-group"><span class="eyebrow">{{ project.type === 'knitting' ? 'Strickprojekt' : 'Häkelprojekt' }} · {{ category }}</span><h2 id="detail-title">{{ project.name }}</h2>@if (project.size) { <span class="project-size">Größe {{ project.size }}</span> }</div>
        <div class="detail-heading-actions">
          <button class="secondary-button icon-action-button" type="button" (click)="edit.emit()" aria-label="Projekt bearbeiten" title="Projekt bearbeiten"><app-fa-icon [icon]="faPen" /></button>
        </div>
      </header>
      @if (project.image) { <img class="detail-project-image" [src]="project.image" [alt]="'Bild für ' + project.name" /> } @else { <div class="detail-project-image image-placeholder" aria-label="Kein Projektbild vorhanden">{{ project.type === 'knitting' ? '🧶' : '🌼' }}</div> }
      <div class="detail-content">
        @if (project.progress.cancelledAt || (!project.progress.startedAt && !completed)) {
        <section class="detail-block progress-card" aria-labelledby="progress-title">
          <header class="progress-heading progress-heading-static">
            <div><h3 id="progress-title">Mein Fortschritt</h3></div>
            <strong class="progress-badge">{{ progress }}%</strong>
            <div class="progress-track" role="progressbar" aria-label="Gesamtfortschritt des Projekts" [attr.aria-valuenow]="progress" aria-valuemin="0" aria-valuemax="100"><span [style.width.%]="progress"></span></div>
          </header>
          @if (project.progress.cancelledAt) {
            <p class="project-status cancelled-status">Projekt abgebrochen · {{ formatDate(project.progress.cancelledAt) }}</p>
            @if (restartPending) {
              <div class="restart-confirm">
                <p>Der bisherige Fortschritt wird auf null zurückgesetzt. Projekt neu starten?</p>
                <div><button class="secondary-button" type="button" [disabled]="busy" (click)="restartPending = false">Abbrechen</button><button class="small-button" type="button" [disabled]="busy" (click)="restart.emit()">Ja, neu starten</button></div>
              </div>
            } @else {
              <div class="progress-empty-state"><button class="small-button start-project-button" type="button" [disabled]="busy" (click)="restartPending = true">Projekt neu starten</button></div>
            }
          } @else {
            <div class="progress-empty-state"><button class="small-button start-project-button" type="button" [disabled]="busy" (click)="start.emit()">Projekt starten</button></div>
          }
          @if (actionError) { <p class="project-action-error" role="alert">{{ actionError }}</p> }
        </section>
        } @else {
        <details class="detail-block progress-card" aria-labelledby="progress-title">
          <summary class="disclosure-summary progress-heading">
            <div><h3 id="progress-title">Mein Fortschritt</h3></div>
            <strong class="progress-badge">{{ progress }}%</strong>
            <div class="progress-track" role="progressbar" aria-label="Gesamtfortschritt des Projekts" [attr.aria-valuenow]="progress" aria-valuemin="0" aria-valuemax="100"><span [style.width.%]="progress"></span></div>
          </summary>
          @if (project.progress.startedAt && !project.progress.cancelledAt && !completed && !isCurrentProject) {
            <button class="make-current-project-button" type="button" [disabled]="busy" (click)="makeCurrent.emit()">Als aktuelles Projekt festlegen</button>
          }
          @if (project.progress.cancelledAt) {
            <p class="project-status cancelled-status">Projekt abgebrochen · {{ formatDate(project.progress.cancelledAt) }}</p>
          } @else if (completed) {
            <p class="project-status finished-status">Projekt fertiggestellt</p>
          } @else if (project.sections.length === 0) {
            <div class="pdf-progress-controls">
              <p>Fortschritt in 10-%-Schritten</p>
              <div class="pdf-progress-stepper">
                <button type="button" aria-label="Fortschritt um 10 Prozent verringern" [disabled]="busy || (project.progress.pdfProgress ?? 0) === 0" (click)="pdfProgressChange.emit(-10)">-10%</button>
                <strong>{{ project.progress.pdfProgress ?? 0 }}%</strong>
                <button type="button" aria-label="Fortschritt steigern" [disabled]="busy || (project.progress.pdfProgress ?? 0) === 100" (click)="pdfProgressChange.emit(10)">+10%</button>
              </div>
              <p class="pdf-progress-hint">Bei 100 % wird das Projekt als fertiggestellt markiert.</p>
            </div>
          } @else {
            <div class="active-section-progress">
              <section class="progress-subsection" aria-labelledby="sections-title">
                <h4 id="sections-title">Abschnitte</h4>
                <div class="progress-section-list" aria-label="Fortschritt der Abschnitte">
                  @for (section of progressSections; track section.id) {
                    <div class="progress-section-entry" [class.active]="project.progress.activeSectionId === section.id">
                      <button class="progress-section-item" type="button" [class.active]="project.progress.activeSectionId === section.id" [disabled]="busy" (click)="chooseProgressSection(section.id)">
                        <span class="progress-section-heading"><strong>{{ section.name }}</strong><span>{{ sectionCompletedRowsFor(section) }} / {{ sectionRowCountFor(section) }} Reihen</span><b>{{ sectionProgress[section.id] ?? 0 }}%</b></span>
                        <span class="progress-track" aria-hidden="true"><span [style.width.%]="sectionProgress[section.id] ?? 0"></span></span>
                      </button>
                      <div class="progress-section-actions">
                      @if (project.progress.activeSectionId === section.id) {
                        @if (nextRow; as row) {
                          <button class="small-button progress-row-complete-button" type="button" [disabled]="busy" [attr.aria-label]="'Reihe ' + row.number + ' im Abschnitt ' + section.name + ' fertig markieren'" (click)="completeRow.emit()">Reihe fertig</button>
                        } @else {
                          <span class="section-done-note">{{ sectionRowCountFor(section) ? 'Abschnitt abgeschlossen' : 'Noch keine Reihen hinterlegt' }}</span>
                        }
                        <button class="small-button complete-section-button" type="button" [disabled]="busy || !nextRow" (click)="completeSection.emit()">Abschnitt abschließen</button>
                      }
                      </div>
                    </div>
                  }
                </div>
              </section>
            </div>
          }
          @if (project.progress.startedAt && !project.progress.cancelledAt && !completed) {
            @if (cancelPending) {
              <div class="cancel-confirm">
                <span>Projekt wirklich abbrechen?</span>
                <button class="cancel-project-button" type="button" [disabled]="busy" (click)="cancel.emit(); cancelPending = false">Ja, abbrechen</button>
                <button class="dismiss-cancel-button" type="button" (click)="cancelPending = false">Weiterarbeiten</button>
              </div>
            } @else {
              <button class="cancel-project-link" type="button" [disabled]="busy" (click)="cancelPending = true">Projekt abbrechen</button>
            }
          }
        </details>
        }
        <section class="instructions-accordion project-information" aria-labelledby="project-information-title">
          <header class="instructions-heading instructions-fixed-heading"><span id="project-information-title">Allgemeine Projektangaben</span></header>
          <div class="instructions-content project-information-content">
            <dl class="project-information-grid">
              <div><dt>Art</dt><dd>{{ project.type === 'knitting' ? 'Stricken' : 'Häkeln' }}</dd></div>
              <div><dt>Kategorie</dt><dd>{{ category }}</dd></div>
              <div><dt>Größe</dt><dd>{{ project.size || 'Nicht angegeben' }}</dd></div>
              @if (project.designer) { <div><dt>Design</dt><dd>{{ project.designer }}</dd></div> }
              @if (project.websiteUrl) { <div><dt>Webseite</dt><dd><a class="website-link" [href]="project.websiteUrl" target="_blank" rel="noopener noreferrer">Webseite öffnen <span aria-hidden="true">↗</span></a></dd></div> }
            </dl>
            <div class="project-information-materials">
              <h3>Garne</h3>
              @for (yarn of sortedProjectYarns; track yarn.id) {
                <div class="project-information-material">
                  <strong>{{ yarn.name }}</strong>
                  <span>{{ yarn.brand || 'Ohne Marke' }} · {{ yarn.color || 'Farbe offen' }}@if (yarn.colorCode) { · Nr. {{ yarn.colorCode }} }</span>
                  <span>Maschenprobe: {{ yarn.gauge.stitches }} Maschen · {{ yarn.gauge.rows }} Reihen / 10 × 10 cm</span>
                </div>
              } @empty { <p>Keine Garne ausgewählt.</p> }
              <h3>Nadeln</h3>
              @for (needle of sortedProjectNeedles; track needle.id) {
                <div class="project-information-material"><strong>{{ needleLabel(needle) }}</strong></div>
              } @empty { <p>Keine Nadeln ausgewählt.</p> }
            </div>
          </div>
        </section>
        <section class="instructions-accordion">
          <header class="instructions-heading instructions-fixed-heading">
            <div class="instructions-title-group">
              <span>Anleitung</span>
              <small>{{ project.sections.length }} {{ project.sections.length === 1 ? 'Abschnitt' : 'Abschnitte' }}</small>
            </div>
            <div class="instructions-heading-actions">
              <button class="secondary-button" type="button" (click)="editInstructions.emit()">{{ project.sections.length ? 'Anleitung bearbeiten' : 'Anleitung hinzufügen' }}</button>
            </div>
          </header>
          <div class="instructions-content">
          @for (section of project.sections; track section.id) {
            <details class="detail-block pattern-section" [attr.aria-label]="'Abschnitt ' + section.name">
            <summary class="disclosure-summary pattern-section-heading">
              <h3>{{ section.name }}</h3>
            </summary>
            <div class="pattern-section-content">
            @if (project.yarns.length > 1 || project.needles.length > 1) {
            <div class="section-materials">
              @if (project.needles.length > 1) {
              <div class="section-needle">
                <span class="material-label">Nadel</span>
                <strong>{{ sectionNeedles[section.id] || 'Unbekannt' }}</strong>
              </div>
              }
              @if (project.yarns.length > 1) {
                <div class="section-yarns">
                  <span class="material-label">Verwendete Garne</span>
                  <div class="yarn-chip-list">
                    @for (yarn of sectionYarns(section); track yarn.id) {
                      <span class="yarn-chip">
                        <strong>{{ yarn.name }}</strong>
                        <span>{{ yarn.gauge.stitches }} M · {{ yarn.gauge.rows }} R / 10 × 10 cm</span>
                        @if (yarn.composition.length) { <small>{{ compositionLabel(yarn) }}</small> }
                      </span>
                    } @empty {
                      <strong>Unbekannt</strong>
                    }
                  </div>
                </div>
              }
            </div>
            }
            @if (section.notes) { <p class="section-notes">{{ section.notes }}</p> }
            @if (!section.entries.length && section.rowCount) { <p>{{ section.rowCount }} Reihen</p> }
            <div class="instruction-list">
            @for (entry of section.entries; track entry.id) {
              @if (entry.type === 'range') {
                <div class="instruction-item">
                  <strong class="instruction-range">{{ rowRangeLabel(entry.fromRow, entry.toRow) }}:</strong>
                  <span>{{ rowCount(entry.fromRow, entry.toRow) }} {{ rowUnit(entry.fromRow, entry.toRow) }} à {{ entry.stitchesPerRow }} Maschen · {{ entry.instructions }}</span>
                  @if (project.yarns.length > 1 || project.needles.length > 1) {
                  <small>@if (project.yarns.length > 1) { Garn: {{ yarnNameFor(entry.yarnId ?? section.yarnId) }} }@if (project.yarns.length > 1 && project.needles.length > 1) { &middot; }@if (project.needles.length > 1) { Nadel: {{ instructionNeedleName(entry.needleId ?? section.needleId) }} }</small>
                  }
                </div>
              } @else {
                <div class="repeat-pattern">
                  <strong class="instruction-range">Musterwiederholung · {{ rowRangeLabel(entry.fromRow, entry.toRow) }}</strong>
                  @for (repeatRow of entry.repeatRows; track $index; let repeatIndex = $index) {
                    <div class="instruction-item repeat-row">
                      <strong class="instruction-range">{{ repeatRowLabel($index) }}:</strong>
                      <span>{{ repeatRowCount(entry, repeatIndex) }} {{ repeatRowUnit(entry, repeatIndex) }} à {{ repeatRow.stitchesPerRow }} Maschen · {{ repeatRow.instructions }}</span>
                      @if (project.yarns.length > 1 || project.needles.length > 1) {
                  <small>@if (project.yarns.length > 1) { Garn: {{ yarnNameFor(repeatRow.yarnId ?? entry.yarnId ?? section.yarnId) }} }@if (project.yarns.length > 1 && project.needles.length > 1) { &middot; }@if (project.needles.length > 1) { Nadel: {{ instructionNeedleName(repeatRow.needleId ?? entry.needleId ?? section.needleId) }} }</small>
                  }
                    </div>
                  }
                </div>
              }
            }
            </div>
            </div>
            </details>
          }
          </div>
        </section>
        @if (project.instructionPdfName) {
          <section class="detail-block pdf-instruction-viewer" aria-labelledby="pdf-instruction-title">
            <div class="pdf-instruction-heading">
              <h4 id="pdf-instruction-title">PDF-Anleitung</h4>
              <div class="pdf-instruction-actions">
                <button class="secondary-button" type="button" (click)="editInstructions.emit()">{{ project.instructionPdfName ? 'Anleitung bearbeiten' : 'Anleitung hinzufügen' }}</button>
                @if (instructionPdfHref) { <a class="small-button" [href]="instructionPdfHref" target="_blank" rel="noopener">In neuem Tab öffnen</a> }
              </div>
            </div>
            @if (instructionPdfData; as pdf) {
              <app-pdf-viewer [pdf]="pdf" />
            } @else if (pdfLoading) {
              <p class="form-hint" role="status">PDF-Anleitung wird geladen …</p>
            } @else if (pdfError) {
              <p class="form-hint" role="alert">{{ pdfError }}</p>
            } @else {
              <p class="form-hint">Für dieses Projekt ist noch keine PDF-Anleitung hinterlegt.</p>
            }
          </section>
        }
        @if (project.yarns.length) {
          <section class="detail-block yarn-usage-block" aria-labelledby="yarn-usage-title">
            <h4 id="yarn-usage-title">Garnbedarf und Verbrauch</h4>
            <p class="usage-explanation">Der Bedarf kommt aus deiner Angabe oder wird bei manuellen Anleitungen mit einer gewogenen 10 × 10-cm-Maschenprobe geschätzt.</p>
            <div class="yarn-usage-list">
              @for (yarn of sortedProjectYarns; track yarn.id) {
                @let usage = yarnUsage(yarn);
                <article class="yarn-usage-item">
                  <h5>{{ yarn.name }}</h5>
                  @if (usage.requiredSkeins === null && usage.consumedWholeSkeins === null && usage.remainingSkeins === null) {
                    <div class="yarn-usage-unknown"><strong>Unbekannt</strong><small>Bedarf und Verbrauch lassen sich mit den vorhandenen Daten nicht berechnen.</small></div>
                  } @else {
                    <div class="yarn-usage-metrics">
                    <span>Insgesamt<strong>@if (usage.requiredMeters !== null && usage.requiredSkeins !== null) { {{ formatMeters(usage.requiredMeters) }} m · {{ usage.requiredSkeins }} Knäuel } @else { Unbekannt }</strong><small>@if (usage.source === 'pattern') { Angabe laut Anleitung } @else if (usage.source === 'estimate') { Geschätzt inklusive 10 % Reserve } @else { Kein Bedarf eingetragen oder mit den verfügbaren Daten schätzbar }</small></span>
                    <span>Aktueller Knäuelverbrauch<strong>@if (usage.consumedWholeSkeins !== null) { {{ usage.consumedWholeSkeins }} Knäuel @if (usage.openedSkein) { + 1 angefangenes Knäuel } } @else { Unbekannt }</strong><small>@if (usage.consumedMeters !== null) { ca. {{ formatMeters(usage.consumedMeters) }} m @if (usage.consumptionSource === 'swatch') { · anhand der Maschenprobe } @else if (usage.consumptionSource === 'pattern') { · nach erledigtem Maschenanteil geschätzt } } @else { Für eine Verbrauchsschätzung fehlen messbare Daten. }</small></span>
                    <span>Aktuell noch benötigte Knäuel<strong>@if (usage.remainingSkeins !== null) { {{ usage.remainingSkeins }} Knäuel } @else { Unbekannt }</strong><small>@if (usage.remainingSkeins !== null) { Gesamtbedarf abzüglich vollständig verbrauchter und angefangener Knäuel } @else { Nicht berechenbar, solange Bedarf oder Verbrauch unbekannt sind }</small></span>
                    </div>
                  }
                </article>
              }
            </div>
          </section>
        }
        @if (project.progress.changelog.length) {
          <details class="instructions-accordion history-accordion">
            <summary class="disclosure-summary instructions-heading">
              <span>Verlauf</span>
              <small>{{ project.progress.changelog.length }} {{ project.progress.changelog.length === 1 ? 'Eintrag' : 'Einträge' }}</small>
            </summary>
            <div class="instructions-content">
              <div class="detail-block">
                @for (entry of project.progress.changelog.slice().reverse().slice(0, 8); track entry.id) {
                  <p>{{ entry.type === 'started' ? 'Projekt gestartet' : entry.type === 'row_completed' ? 'Reihe ' + entry.rowNumber + ' abgeschlossen' : entry.type === 'row_reopened' ? 'Reihe ' + entry.rowNumber + ' zurückgesetzt' : 'Abschnitt gewechselt' }} · {{ formatDate(entry.timestamp) }}</p>
                }
              </div>
            </div>
          </details>
        }
        @if (deletePending) {
          <div class="confirmation-box" role="alert"><strong>Projekt wirklich löschen?</strong><div class="confirmation-actions"><button class="confirmation-cancel" type="button" (click)="deletePending = false">Abbrechen</button><button class="confirmation-delete" type="button" (click)="remove.emit()">Projekt löschen</button></div></div>
        } @else {
          <button class="delete-link" type="button" (click)="deletePending = true">Projekt löschen</button>
        }
        <div class="project-template-control"><button class="template-save-button" type="button" (click)="openTemplateForm()">Als Vorlage speichern</button></div>
        @if (templateSaved) { <p role="status" class="template-saved-notice">Vorlage erfolgreich gespeichert.</p> }
      </div>
    </section>
    @if (templateFormOpen) {
      <div class="template-dialog-backdrop" (click)="!templateSaving && (templateFormOpen = false)">
        <section class="template-dialog" role="dialog" aria-modal="true" aria-labelledby="template-save-title" (click)="$event.stopPropagation()">
          <h2 id="template-save-title">Als Vorlage speichern</h2>
          <p>Gib deiner Vorlage einen Namen. Der Projektfortschritt wird nicht übernommen.</p>
          <form (ngSubmit)="saveTemplate.emit(templateName.trim())">
            <label>Name der Vorlage <input name="templateName" [(ngModel)]="templateName" maxlength="100" required autofocus placeholder="z. B. Mein Lieblingspullover" /></label>
            @if (templateError) { <p role="alert" class="template-error">{{ templateError }}</p> }
            <div class="template-save-actions">
              <button type="button" class="secondary-button" [disabled]="templateSaving" (click)="templateFormOpen = false">Abbrechen</button>
              <button type="submit" class="template-save-button" [disabled]="templateSaving || !templateName.trim()">{{ templateSaving ? 'Wird gespeichert …' : 'OK' }}</button>
            </div>
          </form>
        </section>
      </div>
    }
  `,
})
export class ProjectDetailComponent implements OnChanges {
  protected readonly repeatRowLabel = repeatRowLabel;
  protected readonly faArrowLeft = faArrowLeft;
  protected readonly faPen = faPen;
  protected instructionPdfData: Blob | null = null;
  protected instructionPdfHref: string | null = null;
  protected pdfLoading = false;
  protected pdfError = '';

  private readonly projectService = inject(ProjectService);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private pdfRequest: Subscription | null = null;
  private pdfKey = '';

  constructor() { this.destroyRef.onDestroy(() => this.clearPdf()); }

  @Input({ required: true }) project!: Project;
  @Input() category = '';
  @Input() progress = 0;
  @Input() completed = false;
  @Input() isCurrentProject = false;
  @Input() busy = false;
  @Input() actionError = '';
  @Input() templateSaving = false;
  @Input() templateSaved = false;
  @Input() templateError = '';
  @Input() nextRow: ProjectDetailRow | null = null;
  @Input() progressSections: Project['sections'] = [];
  @Input() sectionProgress: Record<string, number> = {};
  @Input() sectionNeedles: Record<string, string> = {};
  @Input() formatDate: (date: string) => string = (date) => date;
  @Output() edit = new EventEmitter<void>();
  @Output() editInstructions = new EventEmitter<void>();
  @Output() saveTemplate = new EventEmitter<string>();
  @Output() resetTemplateStatus = new EventEmitter<void>();
  @Output() back = new EventEmitter<void>();
  @Output() start = new EventEmitter<void>();
  @Output() restart = new EventEmitter<void>();
  @Output() makeCurrent = new EventEmitter<void>();
  @Output() sectionChange = new EventEmitter<void>();
  @Output() completeRow = new EventEmitter<void>();
  @Output() completeSection = new EventEmitter<void>();
  @Output() pdfProgressChange = new EventEmitter<-10 | 10>();
  @Output() cancel = new EventEmitter<void>();
  @Output() remove = new EventEmitter<void>();
  protected deletePending = false;
  protected cancelPending = false;
  protected restartPending = false;
  protected templateFormOpen = false;
  protected templateName = '';

  protected openTemplateForm(): void {
    this.templateName = this.project.name;
    this.templateFormOpen = !this.templateFormOpen;
    if (this.templateFormOpen) this.resetTemplateStatus.emit();
  }

  protected sectionRowCountFor(section: Project['sections'][number]): number {
    return section.entries.reduce((total, entry) => total + Math.max(0, entry.toRow - entry.fromRow + 1), section.entries.length ? 0 : section.rowCount ?? 0);
  }

  protected needleLabel(needle: Project['needles'][number]): string {
    const names: Record<typeof needle.type, string> = { straight: 'Gerade Stricknadeln', circular: 'Rundstricknadel', 'double-pointed': 'Nadelspiel', 'crochet-hook': 'Häkelnadel', other: 'Sonstige Nadel' };
    return `${names[needle.type]} · ${needle.size} mm`;
  }

  protected get sortedProjectYarns(): Project['yarns'] {
    return [...this.project.yarns].sort((left, right) => compareNames(left.name, right.name));
  }

  protected get sortedProjectNeedles(): Project['needles'] {
    return [...this.project.needles].sort((left, right) => compareNames(this.needleLabel(left), this.needleLabel(right)));
  }

  protected sectionCompletedRowsFor(section: Project['sections'][number]): number {
    return Math.min(this.sectionRowCountFor(section), this.project.progress.completedRows[section.id] ?? 0);
  }

  protected chooseProgressSection(sectionId: string): void {
    this.project.progress.activeSectionId = sectionId;
    this.sectionChange.emit();
  }

  ngOnChanges(): void {
    if (!this.project?.progress.cancelledAt) this.restartPending = false;
    if (this.templateSaved) this.templateFormOpen = false;
    if (!this.project?.instructionPdfName) {
      this.clearPdf();
      return;
    }
    if (!this.project.instructionPdfName) { this.clearPdf(); return; }
    const key = `${this.project.id}:${this.project.instructionPdfName}`;
    if (this.pdfKey === key) return;
    this.clearPdf();
    this.pdfKey = key;
    this.pdfLoading = true;
    this.pdfRequest = this.projectService.downloadInstructionPdf(this.project.id).subscribe({
      next: (pdf) => {
        const url = URL.createObjectURL(pdf);
        this.instructionPdfHref = url;
        this.instructionPdfData = pdf;
        this.pdfLoading = false;
        this.changeDetector.markForCheck();
      },
      error: (error: Error) => { this.pdfLoading = false; this.pdfError = error.message; this.changeDetector.markForCheck(); },
    });
  }

  private clearPdf(): void {
    this.pdfRequest?.unsubscribe();
    this.pdfRequest = null;
    if (this.instructionPdfHref) URL.revokeObjectURL(this.instructionPdfHref);
    this.instructionPdfHref = null;
    this.instructionPdfData = null;
    this.pdfKey = '';
    this.pdfLoading = false;
    this.pdfError = '';
  }

  protected instructionNeedleName(id?: string): string {
    const needle = this.project.needles.find(item => item.id === materialId(this.project.needles, id));
    return needle ? this.needleLabel(needle) : 'Unbekannt';
  }

  protected yarnNameFor(yarnId?: string): string {
    return this.project.yarns.find((yarn) => yarn.id === materialId(this.project.yarns, yarnId))?.name ?? 'Unbekannt';
  }

  protected compositionLabel(yarn: Project['yarns'][number]): string {
    return yarn.composition.map((item) => `${item.material} ${item.percentage}%`).join(', ');
  }

  protected rowRangeLabel(fromRow: number, toRow: number): string {
    return fromRow === toRow
      ? `Reihe ${fromRow}`
      : `Reihen ${fromRow}–${toRow}`;
  }

  protected rowCount(fromRow: number, toRow: number): number {
    return Math.max(0, toRow - fromRow + 1);
  }

  protected rowUnit(fromRow: number, toRow: number): string {
    return this.rowCount(fromRow, toRow) === 1 ? 'Reihe' : 'Reihen';
  }

  protected repeatRowCount(entry: Extract<Project['sections'][number]['entries'][number], { type: 'repeat' }>, repeatIndex: number): number {
    const totalRows = this.rowCount(entry.fromRow, entry.toRow);
    if (repeatIndex >= totalRows || entry.repeatRows.length === 0) return 0;
    return Math.floor((totalRows - 1 - repeatIndex) / entry.repeatRows.length) + 1;
  }

  protected repeatRowUnit(entry: Extract<Project['sections'][number]['entries'][number], { type: 'repeat' }>, repeatIndex: number): string {
    return this.repeatRowCount(entry, repeatIndex) === 1 ? 'Reihe' : 'Reihen';
  }

  protected yarnUsage(yarn: Project['yarns'][number]): YarnUsage {
    const skeinLength = yarn.length;
    const usage: YarnUsage = {
      source: 'unknown',
      requiredMeters: null,
      consumedMeters: null,
      consumptionSource: 'unknown',
      requiredSkeins: null,
      consumedWholeSkeins: null,
      openedSkein: null,
      remainingSkeins: null,
    };
    if (skeinLength <= 0 || yarn.weight <= 0) return usage;

    const stitchEvents = this.yarnStitchEvents(yarn.id);
    const sampleStitchCount = yarn.gauge.stitches * yarn.gauge.rows;
    const sampleWeightPerTenCentimeters = yarn.swatchWeightGrams;
    const hasCalibratedSwatch = Number.isFinite(sampleWeightPerTenCentimeters)
      && (sampleWeightPerTenCentimeters ?? 0) > 0
      && sampleStitchCount > 0
      && stitchEvents.planned > 0;
    const metersPerGram = skeinLength / yarn.weight;

    if (!yarn.needUnknown && yarn.plannedSkeins !== null && Number.isInteger(yarn.plannedSkeins) && yarn.plannedSkeins > 0) {
      usage.source = 'pattern';
      usage.requiredSkeins = yarn.plannedSkeins;
      usage.requiredMeters = yarn.plannedSkeins * skeinLength;
    } else if (hasCalibratedSwatch) {
      const estimatedGrams = (stitchEvents.planned / sampleStitchCount) * (sampleWeightPerTenCentimeters ?? 0);
      usage.source = 'estimate';
      usage.requiredMeters = estimatedGrams * metersPerGram * 1.1;
      usage.requiredSkeins = Math.ceil(usage.requiredMeters / skeinLength);
    }

    if (!this.project.progress.startedAt) {
      usage.consumedMeters = 0;
      usage.consumptionSource = 'none';
    } else if (hasCalibratedSwatch) {
      const consumedGrams = (stitchEvents.completed / sampleStitchCount) * (sampleWeightPerTenCentimeters ?? 0);
      usage.consumedMeters = consumedGrams * metersPerGram;
      usage.consumptionSource = 'swatch';
    } else if (usage.source === 'pattern' && usage.requiredMeters !== null && stitchEvents.planned > 0) {
      const completedShare = Math.min(1, stitchEvents.completed / stitchEvents.planned);
      usage.consumedMeters = usage.requiredMeters * completedShare;
      usage.consumptionSource = 'pattern';
    }

    if (usage.consumedMeters !== null) {
      usage.consumedWholeSkeins = Math.floor(usage.consumedMeters / skeinLength);
      usage.openedSkein = usage.consumedMeters - usage.consumedWholeSkeins * skeinLength > 0.01;
    }
    if (usage.requiredSkeins !== null && usage.consumedWholeSkeins !== null && usage.openedSkein !== null) {
      usage.remainingSkeins = Math.max(0, usage.requiredSkeins - usage.consumedWholeSkeins - Number(usage.openedSkein));
    }
    return usage;
  }

  private yarnStitchEvents(yarnId: string): { planned: number; completed: number } {
    let planned = 0;
    let completed = 0;

    for (const section of this.project.sections) {
      const completedRows = Math.max(0, Math.floor(this.project.progress.completedRows[section.id] ?? 0));
      for (const entry of section.entries) {
        const totalRows = this.rowCount(entry.fromRow, entry.toRow);
        if (totalRows === 0) continue;

        if (entry.type === 'range') {
          if (materialId(this.project.yarns, entry.yarnId, section.yarnId) !== yarnId) continue;
          planned += totalRows * entry.stitchesPerRow;
          const completedInRange = Math.min(totalRows, Math.max(0, completedRows - entry.fromRow + 1));
          completed += completedInRange * entry.stitchesPerRow;
          continue;
        }

        if (!entry.repeatRows.length) continue;
        const cycleLength = entry.repeatRows.length;
        const completedInEntry = Math.min(totalRows, Math.max(0, completedRows - entry.fromRow + 1));
        for (const [repeatIndex, repeatRow] of entry.repeatRows.entries()) {
          if (materialId(this.project.yarns, repeatRow.yarnId, entry.yarnId, section.yarnId) !== yarnId) continue;
          const plannedOccurrences = Math.floor(totalRows / cycleLength) + Number(repeatIndex < totalRows % cycleLength);
          const completedOccurrences = Math.floor(completedInEntry / cycleLength) + Number(repeatIndex < completedInEntry % cycleLength);
          planned += plannedOccurrences * repeatRow.stitchesPerRow;
          completed += completedOccurrences * repeatRow.stitchesPerRow;
        }
      }
    }
    return { planned, completed };
  }

  protected formatMeters(meters: number): string {
    return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(meters);
  }

  protected sectionYarns(section: Project['sections'][number]): Project['yarns'] {
    const yarnIds = new Set<string>();
    const sectionYarnId = materialId(this.project.yarns, section.yarnId);
    if (sectionYarnId) yarnIds.add(sectionYarnId);
    for (const entry of section.entries) {
      if (entry.type === 'range') {
        yarnIds.add(materialId(this.project.yarns, entry.yarnId, section.yarnId) ?? '');
      } else {
        for (const row of entry.repeatRows) {
          yarnIds.add(materialId(this.project.yarns, row.yarnId, entry.yarnId, section.yarnId) ?? '');
        }
      }
    }
    yarnIds.delete('');
    return this.sortedProjectYarns.filter((yarn) => yarnIds.has(yarn.id));
  }
}
