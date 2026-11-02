import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { faArrowLeft, faPlus } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIconComponent } from './fontawesome-icon.component';
import { Yarn, YarnComposition } from './project.service';

export type MaterialViewMode = 'preview' | 'edit';

@Component({
  imports: [FormsModule, FontAwesomeIconComponent],
  selector: 'app-yarn',
  styleUrl: './material.component.css',
  template: `
    @if (mode === 'preview') {
      <button class="material-card" type="button" (click)="open.emit()" [attr.aria-label]="'Garn bearbeiten: ' + yarn.name">
        <span class="material-title">{{ yarn.name }}</span>
        <span class="material-summary">
          {{ yarn.brand || 'Ohne Marke' }} · {{ yarn.color || 'Farbe offen' }} · Nr. {{ yarn.colorCode || '–' }}<br />
          {{ yarn.needleSize }} mm · {{ yarn.length }} m / {{ yarn.weight }} g<br />
          {{ compositionLabel }}
        </span>
      </button>
    } @else {
      <section class="project-editor route-editor" aria-labelledby="material-editor-title">
        <header class="editor-heading"><button class="route-back-button icon-action-button back-navigation-button" type="button" (click)="back.emit()" aria-label="Zurück" title="Zurück"><app-fa-icon [icon]="faArrowLeft" /></button><div><span class="eyebrow">Materialverwaltung</span><h2 id="material-editor-title">{{ isNew ? 'Garn hinzufügen' : 'Garn bearbeiten' }}</h2></div></header>
        <form class="editor-form" (ngSubmit)="save.emit()" #yarnForm="ngForm">
          <div class="form-grid">
            <label class="field">Name<input name="yarnName" [(ngModel)]="yarn.name" required maxlength="100" /></label>
            <label class="field">Marke<input name="yarnBrand" [(ngModel)]="yarn.brand" maxlength="100" /></label>
            <label class="field">Farbe<input name="yarnColor" [(ngModel)]="yarn.color" maxlength="100" /></label>
            <label class="field">Farbnummer<input name="yarnColorCode" [(ngModel)]="yarn.colorCode" maxlength="40" placeholder="z. B. 1234" /></label>
            <label class="field">Nadelgröße (mm)<input name="yarnNeedleSize" type="number" min="0.1" step="0.1" [(ngModel)]="yarn.needleSize" required /></label>
            <label class="field">Lauflänge (m)<input name="yarnLength" type="number" min="1" [(ngModel)]="yarn.length" required /></label>
            <label class="field">Knäuelgewicht (g)<input name="yarnWeight" type="number" min="1" [(ngModel)]="yarn.weight" required /></label>
          </div>
          <fieldset class="composition-fieldset">
            <legend>Materialzusammensetzung</legend>
            <div class="composition-options">
              @for (material of commonMaterials; track material) {
                <label class="composition-option">
                  <input type="checkbox" [checked]="hasMaterial(material)" (change)="toggleMaterial(material, checked($event))" />
                  {{ material }}
                </label>
              }
            </div>
            @for (item of yarn.composition; track item.material; let index = $index) {
              <label class="composition-percentage">
                <span>{{ item.material }}</span>
                <span class="percentage-input"><input [name]="'composition-' + index" type="number" min="0.01" max="100" step="0.01" [(ngModel)]="item.percentage" required /> %</span>
                @if (!isCommonMaterial(item.material)) {
                  <button class="remove-material" type="button" [attr.aria-label]="'Material ' + item.material + ' entfernen'" (click)="removeMaterial(index)">Entfernen</button>
                }
              </label>
            }
            <div class="custom-material-entry">
              <label class="field">Eigenes Material
                <input name="customMaterial" [(ngModel)]="customMaterial" maxlength="60" placeholder="z. B. Kaschmir" />
              </label>
              <button class="secondary-button icon-action-button" type="button" [disabled]="!canAddCustomMaterial" (click)="addCustomMaterial()" aria-label="Eigenes Material hinzufügen" title="Eigenes Material hinzufügen"><app-fa-icon [icon]="faPlus" /></button>
            </div>
            <p class="composition-total" [class.composition-invalid]="!compositionValid">
              Anteil gesamt: {{ compositionTotal }} % · Bei eingetragenen Materialien muss die Summe 100 % ergeben.
            </p>
          </fieldset>
          @if (error) { <p class="notice error-notice" role="alert">{{ error }}</p> }
          @if (deletePending) {
            <div class="confirmation-box" role="alert"><strong>Dieses Garn wirklich löschen?</strong><div class="confirmation-actions"><button class="confirmation-cancel" type="button" [disabled]="saving" (click)="deletePending = false">Abbrechen</button><button class="confirmation-delete" type="button" [disabled]="saving" (click)="remove.emit()">Garn löschen</button></div></div>
          }
          <footer class="editor-actions">
            @if (!isNew && !deletePending) { <button class="delete-link" type="button" [disabled]="saving" (click)="deletePending = true">Garn löschen</button> }
            <button class="secondary-button" type="button" (click)="back.emit()">Abbrechen</button>
            <button class="primary-button" type="submit" [disabled]="yarnForm.invalid || saving || !compositionValid">{{ saving ? 'Wird gespeichert …' : 'Speichern' }}</button>
          </footer>
        </form>
      </section>
    }
  `,
})
export class YarnComponent {
  protected readonly faArrowLeft = faArrowLeft;
  protected readonly faPlus = faPlus;

  protected readonly commonMaterials = [
    'Baumwolle',
    'Merinowolle',
    'Wolle',
    'Alpaka',
    'Seide',
    'Acryl',
    'Polyamid',
    'Leinen',
    'Viskose',
  ];
  @Input({ required: true }) yarn!: Yarn;
  @Input({ required: true }) mode!: MaterialViewMode;
  @Input() isNew = false;
  @Input() saving = false;
  @Input() error = '';
  @Output() open = new EventEmitter<void>();
  @Output() back = new EventEmitter<void>();
  @Output() save = new EventEmitter<void>();
  @Output() remove = new EventEmitter<void>();
  protected deletePending = false;
  protected customMaterial = '';

  protected get compositionTotal(): number {
    return Math.round(this.yarn.composition.reduce((total, item) => total + (Number(item.percentage) || 0), 0) * 100) / 100;
  }

  protected get compositionValid(): boolean {
    return this.yarn.composition.length === 0 || (
      this.yarn.composition.every((item) => item.material.trim() && item.percentage > 0 && item.percentage <= 100)
      && new Set(this.yarn.composition.map((item) => item.material.trim().toLocaleLowerCase())).size === this.yarn.composition.length
      && this.compositionTotal === 100
    );
  }

  protected get canAddCustomMaterial(): boolean {
    const name = this.customMaterial.trim().toLocaleLowerCase();
    return !!name && !this.yarn.composition.some((item) => item.material.trim().toLocaleLowerCase() === name);
  }

  protected get compositionLabel(): string {
    return this.yarn.composition.length
      ? this.yarn.composition.map((item) => `${item.material} ${item.percentage}%`).join(', ')
      : 'Material nicht angegeben';
  }

  protected hasMaterial(material: string): boolean {
    return this.yarn.composition.some((item) => item.material === material);
  }

  protected isCommonMaterial(material: string): boolean {
    return this.commonMaterials.includes(material);
  }

  protected toggleMaterial(material: string, selected: boolean): void {
    if (selected && !this.hasMaterial(material)) this.yarn.composition.push({ material, percentage: 0 });
    if (!selected) this.yarn.composition = this.yarn.composition.filter((item) => item.material !== material);
  }

  protected addCustomMaterial(): void {
    if (!this.canAddCustomMaterial) return;
    this.yarn.composition.push({ material: this.customMaterial.trim(), percentage: 0 });
    this.customMaterial = '';
  }

  protected removeMaterial(index: number): void {
    this.yarn.composition.splice(index, 1);
  }

  protected checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }
}
