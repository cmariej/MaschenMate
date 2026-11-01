import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { faArrowLeft, faPlus } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIconComponent } from './fontawesome-icon.component';
import {
  InstructionRepeat,
  MaterialLibrary,
  Needle,
  NeedleKind,
  ProjectCategory,
  ProjectInput,
  ProjectSection,
  Yarn,
} from './project.service';

@Component({
  imports: [FormsModule, FontAwesomeIconComponent],
  selector: 'app-project-editor',
  styleUrl: './project-dashboard.css',
  template: `
    <section class="project-editor route-editor" aria-labelledby="editor-title">
      <header class="editor-heading">
        <button class="route-back-button icon-action-button" type="button" (click)="back.emit()" aria-label="Zurück" title="Zurück"><app-fa-icon [icon]="faArrowLeft" /></button>
        <div>
          <span class="eyebrow">{{ editing ? 'Projekt aktualisieren' : 'Deine Idee wird konkret' }}</span>
          <h2 id="editor-title">{{ editing ? 'Projekt bearbeiten' : 'Neues Projekt' }}</h2>
        </div>
      </header>

      <form class="editor-form" (ngSubmit)="save.emit()" #projectForm="ngForm">
        <section class="form-section">
          <h3>Projekt</h3>
          <div class="form-grid">
            <label class="field wide-field">Projektname
              <input name="projectName" type="text" [(ngModel)]="draft.name" required maxlength="100" placeholder="z. B. Kuscheldecke" />
            </label>
            <label class="field">Projektart
              <select name="projectType" [(ngModel)]="draft.type">
                <option value="knitting">Strickprojekt</option>
                <option value="crochet">Häkelprojekt</option>
              </select>
            </label>
            <label class="field">Kategorie
              <select name="projectCategory" [(ngModel)]="draft.category">
                @for (category of categories; track category.value) { <option [value]="category.value">{{ category.label }}</option> }
              </select>
            </label>
            <div class="field image-field">
              <span>Projektbild (optional)</span>
              @if (draft.image) {
                <div class="image-preview">
                  <img [src]="draft.image" alt="Projektvorschau" />
                  <button type="button" class="text-button" (click)="draft.image = null">Bild entfernen</button>
                </div>
              }
              <label class="file-picker">Bild auswählen
                <input type="file" accept="image/jpeg,image/png,image/webp" (change)="imageSelected.emit($event)" />
              </label>
              <small>JPG, PNG oder WebP · maximal 5 MB</small>
            </div>
          </div>
        </section>

        <section class="form-section">
          <div class="inline-heading">
            <div><h3>Verwendete Garne</h3><p class="form-hint">Wähle zuerst die Garne für dieses Projekt; danach kannst du die Maschenprobe je Garn hinterlegen. Für jede Anweisung wird das erste ausgewählte Garn automatisch vorbelegt.</p></div>
            <button class="secondary-button" type="button" (click)="openMaterials.emit()">Materialien verwalten</button>
          </div>
          @for (yarn of materials.yarns; track yarn.id) {
            <label class="library-option">
              <input type="checkbox" [checked]="draft.yarns.some(item => item.id === yarn.id)" (change)="yarnSelection.emit({ yarn, selected: checked($event) })" />
              <span>
                {{ yarn.name }} · {{ yarn.brand || 'ohne Marke' }} · {{ yarn.color || 'Farbe offen' }} · Farbnummer: {{ yarn.colorCode || '–' }}
                @if (yarn.composition.length) { · {{ compositionLabel(yarn) }} }
              </span>
            </label>
          } @empty { <p class="form-hint">Lege zuerst in der Materialverwaltung mindestens ein Garn an.</p> }
          @if (draft.yarns.length) {
            <div class="gauge-grid">
              @for (yarn of draft.yarns; track yarn.id; let yarnIndex = $index) {
                <div class="gauge-card">
                  <strong>{{ yarn.name }} · Maschenprobe je 10 × 10 cm</strong>
                  <label>Maschen
                    <input [name]="'project-yarn-stitches-' + yarnIndex" type="number" min="0.1" step="0.1" [(ngModel)]="yarn.gauge.stitches" required />
                  </label>
                  <label>Reihen
                    <input [name]="'project-yarn-rows-' + yarnIndex" type="number" min="0.1" step="0.1" [(ngModel)]="yarn.gauge.rows" required />
                  </label>
                </div>
              }
            </div>
          }
        </section>

        <section class="form-section">
          <div class="inline-heading">
            <h3>Verwendete Nadeln</h3>
            <button class="secondary-button" type="button" (click)="openMaterials.emit()">Materialien verwalten</button>
          </div>
          @for (needle of materials.needles; track needle.id) {
            <label class="library-option">
              <input type="checkbox" [checked]="draft.needles.some(item => item.id === needle.id)" (change)="needleSelection.emit({ needle, selected: checked($event) })" />
              <span>{{ needleName(needle) }}</span>
            </label>
          } @empty { <p class="form-hint">Lege zuerst in der Materialverwaltung mindestens eine Nadel an.</p> }
        </section>

        <section class="form-section">
          <h3>Anleitung</h3>
          <div class="instruction-mode-choice" role="radiogroup" aria-label="Anleitungsformat">
            <label class="library-option">
              <input type="radio" name="instructionMode" value="manual" [(ngModel)]="draft.instructionMode" />
              <span>Anleitung manuell eingeben</span>
            </label>
            <label class="library-option">
              <input type="radio" name="instructionMode" value="pdf" [(ngModel)]="draft.instructionMode" />
              <span>PDF-Anleitung hochladen</span>
            </label>
          </div>
          @if (draft.instructionMode === 'manual') {
          <p class="form-hint">Jeder Eintrag steht für eine Reihe oder einen zusammenhängenden Reihenbereich mit gleicher Maschenzahl und Anweisung. Teile den Abschnitt auf, wenn sich Maschenzahl, Text oder Garn ändert. Eine Wiederholung bildet einen wechselnden Reihenzyklus wie rechts/links ab.</p>
          @for (section of draft.sections; track section.id; let sectionIndex = $index) {
            <details class="section-editor">
              <summary class="section-editor-summary">
                <strong>{{ section.name || 'Abschnitt ' + (sectionIndex + 1) }}</strong>
                <span>{{ section.entries.length }} {{ section.entries.length === 1 ? 'Anweisung' : 'Anweisungen' }}</span>
              </summary>
              <div class="section-editor-body">
                <div class="inline-heading">
                  <label class="field">Abschnitt
                    <input [name]="'section-name-' + sectionIndex" [(ngModel)]="section.name" required maxlength="100" placeholder="z. B. Bündchen" />
                  </label>
                  <button class="remove-button" type="button" (click)="removeSection.emit(sectionIndex)">Abschnitt entfernen</button>
                </div>
                <label class="field">Nadel für diesen Abschnitt
                  <select [name]="'section-needle-' + sectionIndex" [(ngModel)]="section.needleId">
                    <option [ngValue]="undefined">Keine Nadel ausgewählt</option>
                    @for (needle of draft.needles; track needle.id) { <option [ngValue]="needle.id">{{ needleName(needle) }}</option> }
                  </select>
                </label>
              @for (entry of section.entries; track entry.id; let entryIndex = $index) {
                <div class="instruction-editor">
                  @if (entry.type === 'range') {
                    <strong>{{ entry.fromRow === entry.toRow ? 'Einzelreihe' : 'Anweisung · Reihenbereich' }}</strong>
                    <div class="row-number-grid">
                      <label>Von Reihe
                        <input [name]="'range-from-' + sectionIndex + '-' + entryIndex" type="number" min="1" [(ngModel)]="entry.fromRow" required />
                      </label>
                      <label>Bis Reihe
                        <input [name]="'range-to-' + sectionIndex + '-' + entryIndex" type="number" min="1" [(ngModel)]="entry.toRow" required />
                      </label>
                    </div>
                    <label class="field">Text
                      <textarea [name]="'range-instructions-' + sectionIndex + '-' + entryIndex" [(ngModel)]="entry.instructions" required maxlength="500" placeholder="z. B. 10 rechte Maschen, 1 Abnahme"></textarea>
                    </label>
                    <label class="field">Maschen
                      <input [name]="'range-count-' + sectionIndex + '-' + entryIndex" type="number" min="1" [(ngModel)]="entry.stitchesPerRow" required />
                    </label>
                    <label class="field">Garn für diesen Eintrag
                      <select [name]="'range-yarn-' + sectionIndex + '-' + entryIndex" [(ngModel)]="entry.yarnId">
                        @if (!entry.yarnId) { <option [ngValue]="undefined">Garn auswählen</option> }
                        @for (yarn of draft.yarns; track yarn.id) { <option [ngValue]="yarn.id">{{ yarn.name }}</option> }
                      </select>
                    </label>
                  } @else {
                    <strong>Wiederkehrender Reihenwechsel</strong>
                    <div class="row-number-grid">
                      <label>Von Reihe
                        <input [name]="'repeat-from-' + sectionIndex + '-' + entryIndex" type="number" min="1" [(ngModel)]="entry.fromRow" required />
                      </label>
                      <label>Bis Reihe
                        <input [name]="'repeat-to-' + sectionIndex + '-' + entryIndex" type="number" min="1" [(ngModel)]="entry.toRow" required />
                      </label>
                    </div>
                    @for (repeatRow of entry.repeatRows; track $index; let repeatIndex = $index) {
                      <div class="repeat-row">
                        <label class="field">Musterreihe {{ repeatIndex + 1 }} · Text
                          <input [name]="'repeat-instruction-' + sectionIndex + '-' + entryIndex + '-' + repeatIndex" [(ngModel)]="repeatRow.instructions" required maxlength="500" placeholder="z. B. linke Maschen" />
                        </label>
                        <label>Maschen
                          <input [name]="'repeat-count-' + sectionIndex + '-' + entryIndex + '-' + repeatIndex" type="number" min="1" [(ngModel)]="repeatRow.stitchesPerRow" required />
                        </label>
                        <label class="field">Garn
                          <select [name]="'repeat-yarn-' + sectionIndex + '-' + entryIndex + '-' + repeatIndex" [(ngModel)]="repeatRow.yarnId">
                            @if (!repeatRow.yarnId) { <option [ngValue]="undefined">Garn auswählen</option> }
                            @for (yarn of draft.yarns; track yarn.id) { <option [ngValue]="yarn.id">{{ yarn.name }}</option> }
                          </select>
                        </label>
                        @if (entry.repeatRows.length > 1) {
                          <button class="remove-button" type="button" (click)="entry.repeatRows.splice(repeatIndex, 1)">Entfernen</button>
                        }
                      </div>
                    }
                    <button class="subtle-button inline-icon-action" type="button" (click)="addRepeatRow.emit(entry)"><app-fa-icon [icon]="faPlus" /> Musterreihe ergänzen</button>
                  }
                  <button class="remove-button" type="button" (click)="section.entries.splice(entryIndex, 1)">Anweisung entfernen</button>
                </div>
              }
              <div class="add-instruction-actions">
                <button class="subtle-button inline-icon-action" type="button" (click)="addRange.emit(section)"><app-fa-icon [icon]="faPlus" /> Einzelreihe / Reihenbereich</button>
                <button class="subtle-button inline-icon-action" type="button" (click)="addRepeat.emit(section)"><app-fa-icon [icon]="faPlus" /> Reihenwechsel</button>
              </div>
              </div>
            </details>
          } @empty {
            <p class="form-hint">Füge Abschnitte hinzu, zum Beispiel „Bündchen“, „Vorderteil“ oder „Ärmel“.</p>
          }
          <button class="secondary-button inline-icon-action add-section-button" type="button" (click)="addSection.emit()"><app-fa-icon [icon]="faPlus" /> Neuer Abschnitt</button>
          } @else {
            <div class="instruction-pdf-upload">
              @if (draft.instructionPdfName) {
                <p class="form-hint">Ausgewählte PDF: <strong>{{ draft.instructionPdfName }}</strong></p>
              }
              <label class="file-picker">PDF auswählen
                <input type="file" accept="application/pdf,.pdf" (change)="instructionPdfSelected.emit($event)" />
              </label>
              <small>PDF-Datei, maximal 5 MB. Die PDF wird beim Projekt gespeichert.</small>
              @if (draft.instructionPdfName) {
                <button class="text-button" type="button" (click)="removeInstructionPdf()">PDF entfernen</button>
              }
              @if (!draft.instructionPdf) {
                <p class="form-hint">Lade eine PDF-Datei hoch, um die manuelle Eingabe zu ersetzen.</p>
              }
            </div>
          }
        </section>

        @if (editorError) {
          <p class="notice error-notice" role="alert">{{ editorError }}</p>
        }
        <footer class="editor-actions">
          <button class="secondary-button" type="button" [disabled]="saving" (click)="back.emit()">Abbrechen</button>
          <button class="primary-button" type="submit" [disabled]="saving || projectForm.invalid">
            {{ saving ? 'Wird gespeichert …' : editing ? 'Änderungen speichern' : 'Projekt anlegen' }}
          </button>
        </footer>
      </form>
    </section>
  `,
})
export class ProjectEditorComponent {
  protected readonly faArrowLeft = faArrowLeft;
  protected readonly faPlus = faPlus;

  @Input({ required: true }) draft!: ProjectInput;
  @Input({ required: true }) materials!: MaterialLibrary;
  @Input({ required: true }) categories: { value: ProjectCategory; label: string }[] = [];
  @Input({ required: true }) needleKinds: { value: NeedleKind; label: string }[] = [];
  @Input() editing = false;
  @Input() saving = false;
  @Input() editorError = '';
  @Output() back = new EventEmitter<void>();
  @Output() save = new EventEmitter<void>();
  @Output() openMaterials = new EventEmitter<void>();
  @Output() imageSelected = new EventEmitter<Event>();
  @Output() instructionPdfSelected = new EventEmitter<Event>();
  @Output() yarnSelection = new EventEmitter<{ yarn: Yarn; selected: boolean }>();
  @Output() needleSelection = new EventEmitter<{ needle: Needle; selected: boolean }>();
  @Output() removeSection = new EventEmitter<number>();
  @Output() addRepeatRow = new EventEmitter<InstructionRepeat>();
  @Output() addRange = new EventEmitter<ProjectSection>();
  @Output() addRepeat = new EventEmitter<ProjectSection>();
  @Output() addSection = new EventEmitter<void>();

  protected checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  protected needleName(needle: Needle): string {
    const type = this.needleKinds.find((item) => item.value === needle.type)?.label ?? 'Nadel';
    return `${type} ${needle.size} mm`;
  }

  protected compositionLabel(yarn: Yarn): string {
    return yarn.composition.map((item) => `${item.material} ${item.percentage}%`).join(', ');
  }

  protected removeInstructionPdf(): void {
    this.draft.instructionPdf = null;
    this.draft.instructionPdfName = null;
    this.draft.instructionMode = 'manual';
  }

}
