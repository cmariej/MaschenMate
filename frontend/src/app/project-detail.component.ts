import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { faArrowLeft, faPen } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIconComponent } from './fontawesome-icon.component';
import { Project, Yarn } from './project.service';

export interface ProjectDetailRow {
  number: number;
  stitches: number;
  instructions: string;
  yarnId?: string;
}

interface YarnUsage {
  requiredMeters: number;
  consumedMeters: number;
  requiredSkeins: number;
  consumedSkeins: number;
  openedSkeins: number;
  remainingSkeins: number;
}

@Component({
  imports: [FormsModule, FontAwesomeIconComponent],
  selector: 'app-project-detail',
  styleUrl: './project-detail.component.css',
  template: `
    <section class="detail-page" aria-labelledby="detail-title">
      <header class="detail-page-heading">
        <button class="route-back-button icon-action-button" type="button" (click)="back.emit()" aria-label="Zurück" title="Zurück"><app-fa-icon [icon]="faArrowLeft" /></button>
        <div><span class="eyebrow">{{ project.type === 'knitting' ? 'Strickprojekt' : 'Häkelprojekt' }} · {{ category }}</span><h2 id="detail-title">{{ project.name }}</h2></div>
        <div class="detail-heading-actions">
          <button class="secondary-button icon-action-button" type="button" (click)="edit.emit()" aria-label="Projekt bearbeiten" title="Projekt bearbeiten"><app-fa-icon [icon]="faPen" /></button>
        </div>
      </header>
      @if (project.image) { <img class="detail-project-image" [src]="project.image" [alt]="'Bild für ' + project.name" /> }
      <div class="detail-content">
        <div class="detail-block">
          <h4>Fortschritt · {{ progress }}%</h4>
          <div class="progress-track"><span [style.width.%]="progress"></span></div>
          @if (project.progress.cancelledAt) {
            <p class="project-status cancelled-status">Projekt abgebrochen · {{ formatDate(project.progress.cancelledAt) }}</p>
          } @else if (completed) {
            <p class="project-status finished-status">Projekt fertiggestellt</p>
          } @else if (!project.progress.startedAt) {
            <button class="small-button" type="button" [disabled]="busy" (click)="start.emit()">Projekt starten</button>
          } @else {
            <label class="section-picker">Aktueller Abschnitt
              <select [name]="'detail-section-' + project.id" [(ngModel)]="project.progress.activeSectionId" (ngModelChange)="sectionChange.emit()" [disabled]="busy">
                @for (section of project.sections; track section.id) { <option [ngValue]="section.id">{{ section.name }}</option> }
              </select>
            </label>
            @if (nextRow; as row) {
              <div class="next-row"><div><strong>Nächste Reihe {{ row.number }}</strong><span>{{ row.stitches }} Maschen · {{ row.instructions }}</span></div>
                <button class="small-button" type="button" [disabled]="busy" (click)="completeRow.emit()">Reihe fertig</button>
              </div>
            }
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
        </div>
        @if (project.yarns.length) {
          <section class="detail-block yarn-usage-block" aria-labelledby="yarn-usage-title">
            <h4 id="yarn-usage-title">Garnverbrauch</h4>
            <p class="usage-explanation">Schätzung anhand der Anleitung, deiner Maschenprobe und des Verbrauchs für eine 10 × 10-cm-Probe.</p>
            <div class="yarn-usage-list">
              @for (yarn of project.yarns; track yarn.id) {
                @let usage = yarnUsage(yarn);
                <article class="yarn-usage-item">
                  <h5>{{ yarn.name }}</h5>
                  <div class="yarn-usage-metrics">
                    <span>Benötigt<strong>{{ usage.requiredSkeins }} Knäuel</strong><small>ca. {{ formatMeters(usage.requiredMeters) }} m insgesamt</small></span>
                    <span>Bisher verbraucht<strong>ca. {{ formatMeters(usage.consumedMeters) }} m</strong><small>{{ usage.consumedSkeins }} Knäuel vollständig · {{ usage.openedSkeins }} Knäuel angebrochen</small></span>
                    <span>Noch für das Projekt nötig<strong>{{ usage.remainingSkeins }} Knäuel</strong><small>Gesamtbedarf minus vollständig verbrauchte und angebrochene Knäuel</small></span>
                  </div>
                </article>
              }
            </div>
          </section>
        }
        <details class="instructions-accordion">
          <summary class="instructions-heading">
            <span>Anleitung</span>
            <small>{{ project.sections.length }} {{ project.sections.length === 1 ? 'Abschnitt' : 'Abschnitte' }}</small>
          </summary>
          <div class="instructions-content">
          @for (section of project.sections; track section.id) {
            <section class="detail-block pattern-section" [attr.aria-label]="'Abschnitt ' + section.name">
            <header class="pattern-section-heading">
              <h3>{{ section.name }}</h3>
              <span class="section-progress">{{ sectionProgress[section.id] ?? 0 }}%</span>
            </header>
            <div class="section-materials">
              <div class="section-needle">
                <span class="material-label">Nadel</span>
                <strong>{{ sectionNeedles[section.id] || 'Keine Nadel ausgewählt' }}</strong>
              </div>
              @if (sectionYarns(section).length) {
                <div class="section-yarns">
                  <span class="material-label">Verwendete Garne</span>
                  <div class="yarn-chip-list">
                    @for (yarn of sectionYarns(section); track yarn.id) {
                      <span class="yarn-chip">
                        <strong>{{ yarn.name }}</strong>
                        <span>{{ yarn.gauge.stitches }} M · {{ yarn.gauge.rows }} R / 10 × 10 cm</span>
                        @if (yarn.composition.length) { <small>{{ compositionLabel(yarn) }}</small> }
                      </span>
                    }
                  </div>
                </div>
              }
            </div>
            <div class="instruction-list">
            @for (entry of section.entries; track entry.id) {
              @if (entry.type === 'range') {
                <div class="instruction-item">
                  <strong class="instruction-range">{{ rowRangeLabel(entry.fromRow, entry.toRow) }}:</strong>
                  <span>{{ rowCount(entry.fromRow, entry.toRow) }} {{ rowUnit(entry.fromRow, entry.toRow) }} à {{ entry.stitchesPerRow }} Maschen · {{ entry.instructions }}</span>
                  <small>Garn: {{ yarnNameFor(entry.yarnId) }}</small>
                </div>
              } @else {
                <div class="repeat-pattern">
                  <strong class="instruction-range">Reihenwechsel · {{ rowRangeLabel(entry.fromRow, entry.toRow) }}</strong>
                  @for (repeatRow of entry.repeatRows; track $index; let repeatIndex = $index) {
                    <div class="instruction-item repeat-row">
                      <strong class="instruction-range">Musterreihe {{ $index + 1 }}:</strong>
                      <span>{{ repeatRowCount(entry, repeatIndex) }} {{ repeatRowUnit(entry, repeatIndex) }} à {{ repeatRow.stitchesPerRow }} Maschen · {{ repeatRow.instructions }}</span>
                      <small>Garn: {{ yarnNameFor(repeatRow.yarnId ?? entry.yarnId) }}</small>
                    </div>
                  }
                </div>
              }
            }
            </div>
            </section>
          }
          </div>
        </details>
        @if (project.progress.changelog.length) {
          <div class="detail-block"><h4>Verlauf</h4>
            @for (entry of project.progress.changelog.slice().reverse().slice(0, 8); track entry.id) {
              <p>{{ entry.type === 'started' ? 'Projekt gestartet' : entry.type === 'row_completed' ? 'Reihe ' + entry.rowNumber + ' abgeschlossen' : entry.type === 'row_reopened' ? 'Reihe ' + entry.rowNumber + ' zurückgesetzt' : 'Abschnitt gewechselt' }} · {{ formatDate(entry.timestamp) }}</p>
            }
          </div>
        }
        @if (deletePending) {
          <div class="delete-confirm"><span>Projekt wirklich löschen?</span><button type="button" (click)="remove.emit()">Ja, löschen</button><button type="button" (click)="deletePending = false">Abbrechen</button></div>
        } @else {
          <button class="delete-link" type="button" (click)="deletePending = true">Projekt löschen</button>
        }
      </div>
    </section>
  `,
})
export class ProjectDetailComponent {
  protected readonly faArrowLeft = faArrowLeft;
  protected readonly faPen = faPen;

  @Input({ required: true }) project!: Project;
  @Input() category = '';
  @Input() progress = 0;
  @Input() completed = false;
  @Input() busy = false;
  @Input() nextRow: ProjectDetailRow | null = null;
  @Input() sectionProgress: Record<string, number> = {};
  @Input() sectionNeedles: Record<string, string> = {};
  @Input() yarnInventory: Yarn[] = [];
  @Input() formatDate: (date: string) => string = (date) => date;
  @Output() edit = new EventEmitter<void>();
  @Output() back = new EventEmitter<void>();
  @Output() start = new EventEmitter<void>();
  @Output() sectionChange = new EventEmitter<void>();
  @Output() completeRow = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();
  @Output() remove = new EventEmitter<void>();
  protected deletePending = false;
  protected cancelPending = false;

  protected yarnNameFor(yarnId?: string): string {
    return this.project.yarns.find((yarn) => yarn.id === (yarnId ?? this.project.yarns[0]?.id))?.name ?? 'Kein Garn ausgewählt';
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
    const inventoryYarn = this.yarnInventory.find((item) => item.id === yarn.id) ?? yarn;
    const skeinLength = inventoryYarn.length;
    const stitchesPerTenCentimeters = yarn.gauge.stitches;
    if (skeinLength <= 0 || stitchesPerTenCentimeters <= 0) {
      return { requiredMeters: 0, consumedMeters: 0, requiredSkeins: 0, consumedSkeins: 0, openedSkeins: 0, remainingSkeins: 0 };
    }

    let plannedStitchRows = 0;
    let completedStitchRows = 0;
    const defaultYarnId = this.project.yarns[0]?.id;

    for (const section of this.project.sections) {
      const completedRows = Math.max(0, Math.floor(this.project.progress.completedRows[section.id] ?? 0));
      for (const entry of section.entries) {
        const totalRows = this.rowCount(entry.fromRow, entry.toRow);
        if (totalRows === 0) continue;

        if (entry.type === 'range') {
          if ((entry.yarnId ?? defaultYarnId) !== yarn.id) continue;
          plannedStitchRows += totalRows * entry.stitchesPerRow;
          const completedInRange = Math.min(totalRows, Math.max(0, completedRows - entry.fromRow + 1));
          completedStitchRows += completedInRange * entry.stitchesPerRow;
          continue;
        }

        if (!entry.repeatRows.length) continue;
        const cycleLength = entry.repeatRows.length;
        const completedInEntry = Math.min(totalRows, Math.max(0, completedRows - entry.fromRow + 1));
        for (const [repeatIndex, repeatRow] of entry.repeatRows.entries()) {
          if ((repeatRow.yarnId ?? entry.yarnId ?? defaultYarnId) !== yarn.id) continue;
          const plannedOccurrences = Math.floor(totalRows / cycleLength) + Number(repeatIndex < totalRows % cycleLength);
          const completedOccurrences = Math.floor(completedInEntry / cycleLength) + Number(repeatIndex < completedInEntry % cycleLength);
          plannedStitchRows += plannedOccurrences * repeatRow.stitchesPerRow;
          completedStitchRows += completedOccurrences * repeatRow.stitchesPerRow;
        }
      }
    }

    const requiredMeters = plannedStitchRows * 0.1 / stitchesPerTenCentimeters;
    const consumedMeters = completedStitchRows * 0.1 / stitchesPerTenCentimeters;
    const requiredSkeins = Math.ceil(requiredMeters / skeinLength);
    const consumedSkeins = Math.floor(consumedMeters / skeinLength);
    const partialSkeinMeters = consumedMeters - consumedSkeins * skeinLength;
    const openedSkeins = partialSkeinMeters > 0.000001 ? 1 : 0;
    return {
      requiredMeters,
      consumedMeters,
      requiredSkeins,
      consumedSkeins,
      openedSkeins,
      remainingSkeins: Math.max(0, requiredSkeins - consumedSkeins - openedSkeins),
    };
  }

  protected formatMeters(meters: number): string {
    return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(meters);
  }

  protected sectionYarns(section: Project['sections'][number]): Project['yarns'] {
    const yarnIds = new Set<string>();
    for (const entry of section.entries) {
      if (entry.type === 'range') {
        yarnIds.add(entry.yarnId ?? this.project.yarns[0]?.id ?? '');
      } else {
        for (const row of entry.repeatRows) {
          yarnIds.add(row.yarnId ?? entry.yarnId ?? this.project.yarns[0]?.id ?? '');
        }
      }
    }
    yarnIds.delete('');
    return this.project.yarns.filter((yarn) => yarnIds.has(yarn.id));
  }
}
