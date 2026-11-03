import { InstructionMaterialComponent } from './instruction-material.component';
import { repeatRowLabel } from './repeat-row-label';
import { Component, ElementRef, EventEmitter, HostListener, Injector, Input, Output, afterNextRender, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { faArrowLeft, faCalculator, faCopy, faGripVertical, faPlus, faTrashCan, faXmark } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIconComponent } from './fontawesome-icon.component';
import { needleOptions, yarnOptions } from './material-options';
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
  imports: [FormsModule, FontAwesomeIconComponent, InstructionMaterialComponent],
  selector: 'app-project-editor',
  styleUrl: './project-dashboard.css',
  template: `
    <section class="project-editor route-editor" aria-labelledby="editor-title">
      <header class="editor-heading">
        <button class="route-back-button icon-action-button back-navigation-button" type="button" (click)="back.emit()" aria-label="Zurück" title="Zurück"><app-fa-icon [icon]="faArrowLeft" /></button>
        <div>
          <span class="eyebrow">{{ instructionOnly ? 'Anleitung aktualisieren' : editing ? 'Projekt aktualisieren' : 'Deine Idee wird konkret' }}</span>
          <h2 id="editor-title">{{ instructionOnly ? 'Anleitung bearbeiten' : editing ? 'Projekt bearbeiten' : 'Neues Projekt' }}</h2>
        </div>
      </header>

      <form class="editor-form" (ngSubmit)="save.emit()" #projectForm="ngForm">
        @if (!instructionOnly) {
        <section class="form-section">
          <h3>Projekt</h3>
          <div class="form-grid">
            <label class="field wide-field">Projektname
              <input name="projectName" type="text" [(ngModel)]="draft.name" required maxlength="100" placeholder="z. B. Kuscheldecke" />
            </label>
            <label class="field">Art
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
            <label class="field">Größe (optional)
              <input name="projectSize" type="text" [(ngModel)]="draft.size" maxlength="50" placeholder="z. B. M, 38/40 oder 0–3 Monate" />
            </label>
            <label class="field">Designer/in der Anleitung (optional)
              <input name="designer" type="text" [(ngModel)]="draft.designer" maxlength="100" placeholder="Name der Designerin oder des Designers" />
            </label>
            <label class="field">Webseite (optional)
              <input name="websiteUrl" type="url" [(ngModel)]="draft.websiteUrl" maxlength="2048" placeholder="https://…" />
            </label>
            <div class="field image-field">
              <span>Projektbild (optional)</span>
              @if (draft.image) {
                <div class="image-preview">
                  <img [src]="draft.image" alt="Projektvorschau" />
                  <button type="button" class="text-button" [disabled]="processingImage" (click)="draft.image = null">Bild entfernen</button>
                </div>
              }
              <label class="file-picker">Bild auswählen
                <input type="file" accept="image/jpeg,image/png,image/webp" [disabled]="processingImage" (change)="imageSelected.emit($event)" />
              </label>
              @if (processingImage) { <small role="status">Bild wird vorbereitet …</small> }
              <small>JPG, PNG oder WebP · maximal 5 MB</small>
            </div>
          </div>
        </section>

        <section class="form-section">
          <div class="inline-heading">
            <div><h3>Verwendete Garne</h3><p class="form-hint">Wähle zuerst die Garne für dieses Projekt; danach kannst du die Maschenprobe je Garn hinterlegen. Für jede Anweisung wird das erste ausgewählte Garn automatisch vorbelegt.</p></div>
            <button class="secondary-button" type="button" (click)="openMaterials.emit()">Materialien verwalten</button>
          </div>
          @for (option of projectYarnOptions; track option.key) {
            <label class="library-option">
              <input type="checkbox" [checked]="option.selected" (change)="yarnSelection.emit({ yarn: option.item, selected: checked($event) })" />
              <span>
                {{ option.item.name }} · {{ option.item.brand || 'ohne Marke' }} · {{ option.item.color || 'Farbe offen' }} · Farbnummer: {{ option.item.colorCode || '–' }}
                · {{ option.item.length }} m / {{ option.item.weight }} g · {{ option.item.needleSize }} mm
                @if (option.item.composition.length) { · {{ compositionLabel(option.item) }} }
                @if (option.selected) { · Im Projekt }
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
                  <div class="project-yarn-need-settings">
                    <div class="swatch-known-toggle" role="group" aria-label="Garnverbrauch bekannt?">
                      <span class="swatch-known-label">Garnverbrauch bekannt?</span>
                      <div class="swatch-known-options">
                        <button type="button" [class.active]="!yarn.needUnknown" [attr.aria-pressed]="!yarn.needUnknown" (click)="setYarnNeedKnown(yarn, true)">Ja</button>
                        <button type="button" [class.active]="yarn.needUnknown" [attr.aria-pressed]="yarn.needUnknown" (click)="setYarnNeedKnown(yarn, false)">Nein</button>
                      </div>
                    </div>
                    @if (!yarn.needUnknown) {
                      <label>Benötigte Knäuel laut Anleitung
                        <input [name]="'project-yarn-required-skeins-' + yarnIndex" type="number" min="1" max="500" step="1" [(ngModel)]="yarn.plannedSkeins" required />
                      </label>
                    } @else {
                    <div class="swatch-weight-entry">
                      <label>Garnverbrauch je 10 × 10 cm (g)
                        <input [name]="'project-yarn-swatch-weight-' + yarnIndex" type="number" min="0.1" max="1000" step="0.01" [(ngModel)]="yarn.swatchWeightGrams" />
                      </label>
                      <button class="swatch-calculator-trigger" type="button" aria-label="Maschenproben-Rechner öffnen" title="Maschenproben-Rechner öffnen" (click)="openSwatchCalculator(yarn)"><app-fa-icon [icon]="faCalculator" /></button>
                    </div>
                    <small>Mit dem Rechner kannst du eine beliebig große gewogene Probe auf 10 × 10 cm umrechnen.</small>
                    }
                  </div>
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
          @for (option of projectNeedleOptions; track option.key) {
            <label class="library-option">
              <input type="checkbox" [checked]="option.selected" (change)="needleSelection.emit({ needle: option.item, selected: checked($event) })" />
              <span>{{ needleName(option.item) }}@if (option.selected) { · Im Projekt }</span>
            </label>
          } @empty { <p class="form-hint">Lege zuerst in der Materialverwaltung mindestens eine Nadel an.</p> }
        </section>
        }

        @if (instructionOnly) {
        <section class="form-section">
          <h3>Anleitung</h3>
          <p class="form-hint">Lege deine Abschnitte an und ergänze bei Bedarf eine Anweisung, Notiz oder detaillierte Reihenanweisungen. Alle Inhalte sind optional. Mit einer Reihenanzahl kannst du den Fortschritt auch ohne Reihenanweisungen verfolgen.</p>
          @for (section of draft.sections; track section.id; let sectionIndex = $index) {
            <details class="section-editor" [open]="openManualSectionId === section.id" (toggle)="onManualSectionToggle($event, section.id)" [attr.data-section-id]="section.id" [attr.data-sortable-kind]="'manual'" [attr.data-sortable-index]="sectionIndex" [class.section-insert-before]="isSectionInsert(sectionIndex, 'manual', 'before')" [class.section-insert-after]="isSectionInsert(sectionIndex, 'manual', 'after')">
              <summary class="disclosure-summary section-editor-summary">
                <span class="section-drag-handle" [class.drag-disabled]="openManualSectionId === section.id" role="button" tabindex="0" [attr.aria-disabled]="openManualSectionId === section.id" aria-label="Abschnitt verschieben. Mit Pfeiltasten sortieren." [title]="openManualSectionId === section.id ? 'Zum Sortieren erst Abschnitt zuklappen' : 'Zum Verschieben ziehen'" (click)="$event.stopPropagation()" (pointerdown)="startSectionDrag($event, sectionIndex, 'manual')" (keydown)="moveSectionWithKeyboard($event, sectionIndex, 'manual')"><app-fa-icon [icon]="faGripVertical" /></span>
                <strong>{{ section.name || 'Abschnitt ' + (sectionIndex + 1) }}</strong>
                <span>{{ section.entries.length }} {{ section.entries.length === 1 ? 'Anweisung' : 'Anweisungen' }}</span>
              </summary>
              <div class="section-editor-body">
                <div class="inline-heading">
                  <label class="field">Abschnitt
                    <input [name]="'section-name-' + sectionIndex" [(ngModel)]="section.name" required maxlength="100" placeholder="z. B. Bündchen" />
                  </label>
                  <div class="editor-item-actions">
                    <button class="editor-action-button duplicate" type="button" (click)="duplicateManualSectionAndScroll(sectionIndex)"><app-fa-icon [icon]="faCopy" /> Abschnitt duplizieren</button>
                    <button class="editor-action-button remove" type="button" (click)="removeSection.emit(sectionIndex)"><app-fa-icon [icon]="faTrashCan" /> Entfernen</button>
                  </div>
                </div>
                <app-instruction-material [target]="section" [yarns]="draft.yarns" [needles]="draft.needles" />
                <label class="field">Notiz (optional)
                  <textarea [name]="'section-notes-' + sectionIndex" [(ngModel)]="section.notes" maxlength="5000"></textarea>
                </label>
                @if (!section.entries.length) {
                  <label class="field">Reihenanzahl (optional)
                    <input [name]="'section-rows-' + sectionIndex" type="number" min="1" max="10000" [(ngModel)]="section.rowCount" />
                  </label>
                }
              @for (entry of section.entries; track entry.id; let entryIndex = $index) {
                <div class="instruction-editor" [attr.data-entry-id]="entry.id">
                  <app-instruction-material [target]="entry" [inherit]="true" [yarns]="draft.yarns" [needles]="draft.needles" [inheritedYarnId]="section.yarnId" [inheritedNeedleId]="section.needleId" />
                  @if (entry.type === 'range') {
                    <strong>{{ entry.fromRow === entry.toRow ? 'Einzelreihe' : 'Anweisung · Reihenabschnitt' }}</strong>
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
                  } @else {
                    <strong>Musterwiederholung</strong>
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
                        <label class="field">{{ repeatRowLabel(repeatIndex) }} · Text
                          <input [name]="'repeat-instruction-' + sectionIndex + '-' + entryIndex + '-' + repeatIndex" [(ngModel)]="repeatRow.instructions" required maxlength="500" placeholder="z. B. linke Maschen" />
                        </label>
                        <label>Maschen
                          <input [name]="'repeat-count-' + sectionIndex + '-' + entryIndex + '-' + repeatIndex" type="number" min="1" [(ngModel)]="repeatRow.stitchesPerRow" required />
                        </label>
                        <app-instruction-material [target]="repeatRow" [inherit]="true" [yarns]="draft.yarns" [needles]="draft.needles" [inheritedYarnId]="entry.yarnId ?? section.yarnId" [inheritedNeedleId]="entry.needleId ?? section.needleId" />
                        @if (entry.repeatRows.length > 1) {
                          <button class="remove-button" type="button" (click)="entry.repeatRows.splice(repeatIndex, 1)">Entfernen</button>
                        }
                      </div>
                    }
                    <button class="subtle-button inline-icon-action" type="button" (click)="addRepeatRow.emit(entry)"><app-fa-icon [icon]="faPlus" /> Musterreihe ergänzen</button>
                  }
                  <div class="editor-item-actions">
                    <button class="editor-action-button duplicate" type="button" (click)="duplicateEntryAndScroll(sectionIndex, entryIndex)"><app-fa-icon [icon]="faCopy" /> Anweisung duplizieren</button>
                    <button class="editor-action-button remove" type="button" (click)="section.entries.splice(entryIndex, 1)"><app-fa-icon [icon]="faTrashCan" /> Entfernen</button>
                  </div>
                </div>
              }
              <div class="add-instruction-actions">
                <button class="subtle-button inline-icon-action" type="button" (click)="addRange.emit(section)"><app-fa-icon [icon]="faPlus" /> Einzelreihe / Reihenabschnitt</button>
                <button class="subtle-button inline-icon-action" type="button" (click)="addRepeat.emit(section)"><app-fa-icon [icon]="faPlus" /> Musterwiederholung</button>
              </div>
              </div>
            </details>
          } @empty {
            <p class="form-hint">Füge Abschnitte hinzu, zum Beispiel „Bündchen“, „Vorderteil“ oder „Ärmel“.</p>
          }
          <button class="secondary-button inline-icon-action add-section-button" type="button" (click)="addSection.emit()"><app-fa-icon [icon]="faPlus" /> Neuer Abschnitt</button>
            <div class="instruction-pdf-upload">
              @if (draft.instructionPdfName) {
                <p class="form-hint">Ausgewählte PDF: <strong>{{ draft.instructionPdfName }}</strong></p>
              }
              <label class="file-picker">PDF auswählen
                <input type="file" accept="application/pdf,.pdf" [disabled]="processingPdf" (change)="instructionPdfSelected.emit($event)" />
              </label>
              <small>PDF-Datei, maximal 5 MB. Die PDF wird beim Projekt gespeichert.</small>
              @if (processingPdf) { <small role="status">PDF wird geprüft …</small> }
              @if (draft.instructionPdfName) {
                <button class="text-button" type="button" [disabled]="processingPdf" (click)="removeInstructionPdf()">PDF entfernen</button>
              }
              @if (!draft.instructionPdf && !draft.instructionPdfName) {
                <p class="form-hint">Optional kannst du eine PDF ergänzen und manuelle Anweisungen eintragen.</p>
              }
            </div>

        </section>
        } @else if (!editing) {
          <p class="form-hint editor-workflow-hint">{{ draft.sections.length || draft.instructionPdfName ? 'Die Anleitung aus der Vorlage wird übernommen und kann nach dem Anlegen bearbeitet werden.' : 'Die Anleitung kannst du nach dem Anlegen des Projekts in den Projektdetails hinzufügen.' }}</p>
        }

        @if (editorError) {
          <p class="notice error-notice" role="alert">{{ editorError }}</p>
        }
        <footer class="editor-actions">
          <button class="secondary-button" type="button" [disabled]="saving" (click)="back.emit()">Abbrechen</button>
          <button class="primary-button" type="submit" [disabled]="saving || processingImage || processingPdf || !!pdfError || projectForm.invalid">
            {{ saving ? 'Wird gespeichert …' : instructionOnly ? 'Anleitung speichern' : editing ? 'Änderungen speichern' : 'Projekt anlegen' }}
          </button>
        </footer>
      </form>
    </section>
    @if (swatchCalculator; as calculator) {
      <div class="swatch-calculator-backdrop" (click)="closeSwatchCalculator()">
        <section class="swatch-calculator-dialog" role="dialog" aria-modal="true" aria-labelledby="swatch-calculator-heading" (click)="$event.stopPropagation()">
          <header>
            <div><span class="eyebrow">Maschenprobe</span><h2 id="swatch-calculator-heading">Verbrauch berechnen</h2></div>
            <button class="swatch-calculator-close" type="button" aria-label="Rechner schließen" (click)="closeSwatchCalculator()"><app-fa-icon [icon]="faXmark" /></button>
          </header>
          <p>Gib die Maße und das Gewicht der gewaschenen und getrockneten Probe ein.</p>
          <div class="swatch-calculator-fields">
            <label>Breite (cm)<input type="number" min="0.1" max="100" step="0.1" [ngModelOptions]="{ standalone: true }" [(ngModel)]="calculator.width" /></label>
            <label>Höhe (cm)<input type="number" min="0.1" max="100" step="0.1" [ngModelOptions]="{ standalone: true }" [(ngModel)]="calculator.height" /></label>
            <label>Gewicht (g)<input type="number" min="0.1" max="1000" step="0.1" [ngModelOptions]="{ standalone: true }" [(ngModel)]="calculator.weight" /></label>
          </div>
          @if (calculatedSwatchWeight(calculator); as normalizedWeight) {
            <div class="swatch-calculator-result"><span>Verbrauch je 10 × 10 cm</span><strong>{{ formatSwatchWeight(normalizedWeight) }} g</strong></div>
          } @else {
            <p class="swatch-calculator-invalid">Gib gültige Maße und ein Gewicht größer als 0 ein.</p>
          }
          <footer>
            <button class="secondary-button" type="button" (click)="closeSwatchCalculator()">Abbrechen</button>
            <button class="primary-button" type="button" [disabled]="calculatedSwatchWeight(calculator) === null" (click)="applySwatchWeight()">Ergebnis übernehmen</button>
          </footer>
        </section>
      </div>
    }
  `,
})
export class ProjectEditorComponent {
  protected readonly repeatRowLabel = repeatRowLabel;
  private readonly hostElement: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly injector = inject(Injector);
  protected readonly faArrowLeft = faArrowLeft;
  protected readonly faCalculator = faCalculator;
  protected readonly faPlus = faPlus;
  protected readonly faCopy = faCopy;
  protected readonly faGripVertical = faGripVertical;
  protected readonly faTrashCan = faTrashCan;
  protected draggedSection: { index: number; kind: 'manual' | 'pdf'; pointerId: number; element: HTMLElement; placeholder: HTMLElement; styleAttribute: string | null; offsetX: number; offsetY: number } | null = null;
  protected sectionInsert: { index: number; kind: 'manual' | 'pdf' } | null = null;
  protected openManualSectionId: string | null = null;
  protected readonly faXmark = faXmark;
  protected swatchCalculator: { yarnId: string; width: number; height: number; weight: number | null } | null = null;

  protected addPdfSection(): void {
    this.draft.pdfSections ??= [];
    this.draft.pdfSections.push({ id: crypto.randomUUID(), name: '', rowCount: 1 });
  }

  protected removePdfSection(index: number): void {
    this.draft.pdfSections.splice(index, 1);
  }

  @Input({ required: true }) draft!: ProjectInput;
  @Input({ required: true }) materials!: MaterialLibrary;
  @Input({ required: true }) categories: { value: ProjectCategory; label: string }[] = [];
  @Input({ required: true }) needleKinds: { value: NeedleKind; label: string }[] = [];
  @Input() editing = false;
  @Input() instructionOnly = false;
  @Input() saving = false;
  @Input() processingImage = false;
  @Input() processingPdf = false;
  @Input() pdfError = '';
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
  @Output() duplicateSection = new EventEmitter<number>();
  @Output() duplicatePdfSection = new EventEmitter<number>();
  @Output() duplicateEntry = new EventEmitter<{ sectionIndex: number; entryIndex: number }>();
  protected checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  protected get projectYarnOptions() {
    return yarnOptions(this.draft.yarns, this.materials.yarns);
  }

  protected get projectNeedleOptions() {
    return needleOptions(this.draft.needles, this.materials.needles, (needle) => this.needleName(needle));
  }

  protected duplicateManualSectionAndScroll(index: number): void {
    const previousCount = this.draft.sections.length;
    this.duplicateSection.emit(index);
    if (this.draft.sections.length === previousCount) return;
    this.openManualSectionId = null;
    this.scrollToCopy('section', this.draft.sections[this.draft.sections.length - 1].id);
  }

  protected duplicatePdfSectionAndScroll(index: number): void {
    const previousCount = this.draft.pdfSections.length;
    this.duplicatePdfSection.emit(index);
    if (this.draft.pdfSections.length === previousCount) return;
    this.scrollToCopy('section', this.draft.pdfSections[this.draft.pdfSections.length - 1].id);
  }

  protected duplicateEntryAndScroll(sectionIndex: number, entryIndex: number): void {
    const section = this.draft.sections[sectionIndex];
    if (!section) return;
    const previousCount = section.entries.length;
    this.duplicateEntry.emit({ sectionIndex, entryIndex });
    if (section.entries.length === previousCount) return;
    this.scrollToCopy('entry', section.entries[entryIndex + 1].id);
  }

  private scrollToCopy(kind: 'section' | 'entry', id: string): void {
    afterNextRender(() => {
      const attribute = kind === 'section' ? 'data-section-id' : 'data-entry-id';
      const target = Array.from(this.hostElement.nativeElement.querySelectorAll<HTMLElement>(`[${attribute}]`))
        .find((element) => element.getAttribute(attribute) === id);
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, { injector: this.injector });
  }

  protected onManualSectionToggle(event: Event, sectionId: string): void {
    const details = event.currentTarget as HTMLDetailsElement;
    if (details.open) {
      this.openManualSectionId = sectionId;
      requestAnimationFrame(() => details.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
    else if (this.openManualSectionId === sectionId) this.openManualSectionId = null;
  }

  protected startSectionDrag(event: PointerEvent, index: number, kind: 'manual' | 'pdf'): void {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const element = (event.currentTarget as HTMLElement).closest<HTMLElement>('[data-sortable-kind][data-sortable-index]');
    if (!element) return;
    if (kind === 'manual' && (element as HTMLDetailsElement).open) return;
    const bounds = element.getBoundingClientRect();
    const placeholder = document.createElement('div');
    placeholder.className = 'section-drag-placeholder';
    placeholder.setAttribute('aria-hidden', 'true');
    placeholder.style.height = `${bounds.height}px`;
    placeholder.style.margin = getComputedStyle(element).margin;
    placeholder.style.width = `${bounds.width}px`;
    element.parentElement?.insertBefore(placeholder, element);
    this.draggedSection = {
      index,
      kind,
      pointerId: event.pointerId,
      element,
      placeholder,
      styleAttribute: element.getAttribute('style'),
      offsetX: event.clientX - bounds.left,
      offsetY: event.clientY - bounds.top,
    };
    this.sectionInsert = null;
    element.classList.add('section-being-dragged');
    element.style.position = 'fixed';
    element.style.zIndex = '1001';
    element.style.boxSizing = 'border-box';
    element.style.width = `${bounds.width}px`;
    element.style.margin = '0';
    element.style.pointerEvents = 'none';
    this.positionDraggedSection(event.clientX, event.clientY);
  }

  @HostListener('document:pointermove', ['$event'])
  protected moveSectionDrag(event: PointerEvent): void {
    if (!this.draggedSection || this.draggedSection.pointerId !== event.pointerId) return;
    event.preventDefault();
    this.positionDraggedSection(event.clientX, event.clientY);
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-sortable-kind][data-sortable-index]');
    const kind = target?.dataset['sortableKind'];
    const index = Number(target?.dataset['sortableIndex']);
    if (!target || kind !== this.draggedSection.kind || !Number.isInteger(index)) return;
    const bounds = target.getBoundingClientRect();
    this.sectionInsert = { index: index + (event.clientY >= bounds.top + bounds.height / 2 ? 1 : 0), kind: this.draggedSection.kind };
  }

  protected isSectionInsert(index: number, kind: 'manual' | 'pdf', edge: 'before' | 'after'): boolean {
    const expectedIndex = edge === 'before' ? index : index + 1;
    return this.sectionInsert?.index === expectedIndex && this.sectionInsert?.kind === kind && this.draggedSection?.kind === kind;
  }

  @HostListener('document:pointerup', ['$event'])
  protected finishSectionDrag(event: PointerEvent): void {
    if (!this.draggedSection || this.draggedSection.pointerId !== event.pointerId) return;
    const { index, kind } = this.draggedSection;
    if (this.sectionInsert?.kind === kind) this.insertSectionAt(index, this.sectionInsert.index, kind);
    this.endSectionDrag();
  }

  @HostListener('document:pointercancel')
  protected endSectionDrag(): void {
    const draggedSection = this.draggedSection;
    if (draggedSection) {
      draggedSection.element.classList.remove('section-being-dragged');
      if (draggedSection.styleAttribute === null) draggedSection.element.removeAttribute('style');
      else draggedSection.element.setAttribute('style', draggedSection.styleAttribute);
      draggedSection.placeholder.remove();
    }
    this.draggedSection = null;
    this.sectionInsert = null;
  }

  private positionDraggedSection(clientX: number, clientY: number): void {
    const draggedSection = this.draggedSection;
    if (!draggedSection) return;
    const { element, offsetX, offsetY } = draggedSection;
    const left = Math.max(8, Math.min(clientX - offsetX, window.innerWidth - element.offsetWidth - 8));
    const top = Math.max(8, Math.min(clientY - offsetY, window.innerHeight - element.offsetHeight - 8));
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
  }

  protected moveSectionWithKeyboard(event: KeyboardEvent, index: number, kind: 'manual' | 'pdf'): void {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    if (kind === 'manual' && this.draft.sections[index]?.id === this.openManualSectionId) return;
    event.preventDefault();
    const targetIndex = index + (event.key === 'ArrowUp' ? -1 : 1);
    this.moveSection(index, targetIndex, kind);
  }

  private insertSectionAt(fromIndex: number, insertionIndex: number, kind: 'manual' | 'pdf'): void {
    const finalIndex = insertionIndex > fromIndex ? insertionIndex - 1 : insertionIndex;
    this.moveSection(fromIndex, finalIndex, kind);
  }

  private moveSection(fromIndex: number, toIndex: number, kind: 'manual' | 'pdf'): void {
    if (kind === 'manual') {
      if (fromIndex === toIndex || toIndex < 0 || toIndex >= this.draft.sections.length) return;
      const [section] = this.draft.sections.splice(fromIndex, 1);
      this.draft.sections.splice(toIndex, 0, section);
      return;
    }
    if (fromIndex === toIndex || toIndex < 0 || toIndex >= this.draft.pdfSections.length) return;
    const [section] = this.draft.pdfSections.splice(fromIndex, 1);
    this.draft.pdfSections.splice(toIndex, 0, section);
  }

  protected needleName(needle: Needle): string {
    const type = this.needleKinds.find((item) => item.value === needle.type)?.label ?? 'Nadel';
    return `${type} ${needle.size} mm`;
  }

  protected compositionLabel(yarn: Yarn): string {
    return yarn.composition.map((item) => `${item.material} ${item.percentage}%`).join(', ');
  }

  protected openSwatchCalculator(yarn: ProjectInput['yarns'][number]): void {
    this.swatchCalculator = { yarnId: yarn.id, width: 10, height: 10, weight: yarn.swatchWeightGrams };
  }

  protected setSwatchWeightKnown(yarn: ProjectInput['yarns'][number], known: boolean): void {
    yarn.swatchWeightKnown = known;
    if (!known) yarn.swatchWeightGrams = null;
  }

  protected setYarnNeedKnown(yarn: ProjectInput['yarns'][number], known: boolean): void {
    yarn.needUnknown = !known;
  }

  protected closeSwatchCalculator(): void {
    this.swatchCalculator = null;
  }

  protected calculatedSwatchWeight(calculator: { width: number; height: number; weight: number | null }): number | null {
    const { width, height, weight } = calculator;
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0 || !Number.isFinite(weight) || weight === null || weight <= 0) return null;
    return Math.round((weight * 100 / (width * height)) * 100) / 100;
  }

  protected applySwatchWeight(): void {
    const calculator = this.swatchCalculator;
    if (!calculator) return;
    const normalizedWeight = this.calculatedSwatchWeight(calculator);
    const yarn = this.draft.yarns.find((item) => item.id === calculator.yarnId);
    if (!yarn || normalizedWeight === null) return;
    yarn.swatchWeightGrams = normalizedWeight;
    this.closeSwatchCalculator();
  }

  protected formatSwatchWeight(weight: number): string {
    return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(weight);
  }

  protected removeInstructionPdf(): void {
    this.draft.instructionPdf = null;
    this.draft.instructionPdfName = null;
    this.draft.instructionMode = 'manual';
  }

}
