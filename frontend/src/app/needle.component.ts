import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { faArrowLeft } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIconComponent } from './fontawesome-icon.component';
import { Needle, NeedleKind } from './project.service';
import { MaterialViewMode } from './yarn.component';

@Component({
  imports: [FormsModule, FontAwesomeIconComponent],
  selector: 'app-needle',
  styleUrl: './material.component.css',
  template: `
    @if (mode === 'preview') {
      <button class="material-card" type="button" (click)="open.emit()" [attr.aria-label]="'Nadel bearbeiten: ' + needleName">
        <span class="material-title">{{ needleKindName }}</span>
        <span>{{ needle.size }} mm</span>
      </button>
    } @else {
      <section class="project-editor route-editor" aria-labelledby="material-editor-title">
        <header class="editor-heading"><button class="route-back-button icon-action-button" type="button" (click)="back.emit()" aria-label="Zurück" title="Zurück"><app-fa-icon [icon]="faArrowLeft" /></button><div><span class="eyebrow">Materialverwaltung</span><h2 id="material-editor-title">{{ isNew ? 'Nadel hinzufügen' : 'Nadel bearbeiten' }}</h2></div></header>
        <form class="editor-form" (ngSubmit)="save.emit()" #needleForm="ngForm">
          <label class="field">Typ<select name="needleType" [(ngModel)]="needle.type">@for (kind of kinds; track kind.value) { <option [value]="kind.value">{{ kind.label }}</option> }</select></label>
          <label class="field">Größe (mm)<input name="needleSize" type="number" min="0.1" step="0.1" [(ngModel)]="needle.size" required /></label>
          @if (error) { <p class="notice error-notice" role="alert">{{ error }}</p> }
          @if (deletePending) {
            <p class="delete-confirmation" role="alert">Diese Nadel wirklich löschen? <button class="delete-link" type="button" (click)="remove.emit()">Nadel löschen</button><button class="secondary-button" type="button" (click)="deletePending = false">Abbrechen</button></p>
          }
          <footer class="editor-actions">
            @if (!isNew) { <button class="delete-link" type="button" (click)="deletePending = true">Nadel löschen</button> }
            <button class="secondary-button" type="button" (click)="back.emit()">Abbrechen</button>
            <button class="primary-button" type="submit" [disabled]="needleForm.invalid || saving">{{ saving ? 'Wird gespeichert …' : 'Speichern' }}</button>
          </footer>
        </form>
      </section>
    }
  `,
})
export class NeedleComponent {
  protected readonly faArrowLeft = faArrowLeft;

  @Input({ required: true }) needle!: Needle;
  @Input({ required: true }) kinds: { value: NeedleKind; label: string }[] = [];
  @Input({ required: true }) mode!: MaterialViewMode;
  @Input() isNew = false;
  @Input() saving = false;
  @Input() error = '';
  @Output() open = new EventEmitter<void>();
  @Output() back = new EventEmitter<void>();
  @Output() save = new EventEmitter<void>();
  @Output() remove = new EventEmitter<void>();
  protected deletePending = false;

  get needleName(): string {
    return `${this.needleKindName} · ${this.needle.size} mm`;
  }

  get needleKindName(): string {
    return this.kinds.find((kind) => kind.value === this.needle.type)?.label ?? this.needle.type;
  }
}
