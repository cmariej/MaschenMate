import { Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Needle, ProjectYarn } from './project.service';
import { materialId } from './material-selection';

@Component({
  selector: 'app-instruction-material',
  imports: [FormsModule],
  template: `
    @if (yarns.length > 1 || needles.length > 1) {
    <details class="material-picker">
      <summary><span>Material</span><span class="selection">{{ summary }}</span></summary>
      <div class="fields">
        @if (yarns.length > 1) {
        <label>Garn (optional)
          @if (readOnly) {
            <span>{{ yarnName }}</span>
          } @else {
          <select [(ngModel)]="target.yarnId" [ngModelOptions]="{ standalone: true }">
            <option [ngValue]="undefined">{{ inherit ? 'vom Abschnitt übernehmen' : 'Unbekannt' }}</option>
            @for (yarn of yarns; track yarn.id) { <option [ngValue]="yarn.id">{{ yarn.name }}</option> }
          </select>
          }
        </label>
        }
        @if (needles.length > 1) {
        <label>Nadel (optional)
          @if (readOnly) {
            <span>{{ selectedNeedleName }}</span>
          } @else {
          <select [(ngModel)]="target.needleId" [ngModelOptions]="{ standalone: true }">
            <option [ngValue]="undefined">{{ inherit ? 'vom Abschnitt übernehmen' : 'Unbekannt' }}</option>
            @for (needle of needles; track needle.id) { <option [ngValue]="needle.id">{{ needleLabel(needle) }}</option> }
          </select>
          }
        </label>
        }
        @if (!readOnly && !yarns.length && !needles.length) { <small>Wähle zuerst Material in den Projekteinstellungen aus.</small> }
      </div>
    </details>
    }
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .material-picker { margin: 8px 0; border: 1px solid #e8dde3; border-radius: 9px; background: #fffdfa; }
    summary { display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 8px 10px; color: #624c5e; cursor: pointer; font-size: 13px; }
    summary::before { content: '›'; font-size: 18px; }
    summary::-webkit-details-marker { display: none; }
    details[open] > summary::before { transform: rotate(90deg); }
    summary:focus-visible { outline: 2px solid #a67393; outline-offset: 2px; border-radius: 8px; }
    .selection { margin-left: auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #897d83; font-size: 12px; }
    .fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; padding: 0 10px 10px; }
    label { display: grid; gap: 5px; min-width: 0; color: #624c5e; font-size: 12px; }
    select { box-sizing: border-box; width: 100%; min-width: 0; min-height: 44px; padding: 8px; border: 1px solid #e8dde3; border-radius: 8px; background: #fff; color: #302925; font: inherit; font-size: 16px; }
    small { grid-column: 1 / -1; color: #897d83; }
    @media (max-width: 420px) { .fields { grid-template-columns: minmax(0, 1fr); } }
  `,
})
export class InstructionMaterialComponent {
  @Input({ required: true }) target!: { yarnId?: string; needleId?: string };
  @Input() yarns: ProjectYarn[] = [];
  @Input() needles: Needle[] = [];
  @Input() inherit = false;
  @Input() readOnly = false;
  @Input() inheritedYarnId?: string;
  @Input() inheritedNeedleId?: string;

  protected get yarnName(): string {
    return this.yarns.find(item => item.id === materialId(this.yarns, this.target.yarnId, this.inheritedYarnId))?.name ?? 'Unbekannt';
  }

  protected get selectedNeedleName(): string {
    const needle = this.needles.find(item => item.id === materialId(this.needles, this.target.needleId, this.inheritedNeedleId));
    return needle ? this.needleLabel(needle) : 'Unbekannt';
  }

  protected needleLabel(needle: Needle): string {
    const kinds = { straight: 'Gerade Nadeln', circular: 'Rundstricknadel', 'double-pointed': 'Nadelspiel', 'crochet-hook': 'Häkelnadel', other: 'Nadel' };
    return `${kinds[needle.type]} ${needle.size} mm`;
  }

  protected get summary(): string {
    const yarn = this.yarns.find(item => item.id === materialId(this.yarns, this.target.yarnId, this.inheritedYarnId));
    const needle = this.needles.find(item => item.id === materialId(this.needles, this.target.needleId, this.inheritedNeedleId));
    const parts = [
      this.yarns.length > 1 ? yarn?.name ?? 'Garn: unbekannt' : undefined,
      this.needles.length > 1 ? needle ? this.needleLabel(needle) : 'Nadel: unbekannt' : undefined,
    ].filter(Boolean);
    const inherited = this.inherit && !this.target.yarnId && !this.target.needleId && Boolean(yarn || needle);
    return `${parts.join(' · ')}${inherited ? ' · übernommen' : ''}`;
  }
}
