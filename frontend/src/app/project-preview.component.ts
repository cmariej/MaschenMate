import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Project } from './project.service';

@Component({
  selector: 'app-project-preview',
  styleUrl: './project-preview.component.css',
  template: `
    <button class="project-card" type="button" (click)="open.emit()">
      <span class="project-cover">
        @if (project.image) {
          <img [src]="project.image" [alt]="'Bild für ' + project.name" />
        } @else {
          <span class="project-icon" aria-hidden="true">{{ project.type === 'knitting' ? '🧶' : '🌼' }}</span>
        }
        <span class="badges">
          <span class="badge">{{ project.type === 'knitting' ? 'Stricken' : 'Häkeln' }}</span>
          <span class="badge">{{ category }}</span>
        </span>
      </span>
      <span class="card-content">
        <span class="title-line"><strong>{{ project.name }}</strong><span aria-hidden="true">→</span></span>
        <span class="meta">
          @if (project.size) { <span>Größe {{ project.size }}</span> }
          <span>{{ project.sections.length }} {{ project.sections.length === 1 ? 'Abschnitt' : 'Abschnitte' }}</span>
          <span>Bearbeitet {{ editedAt }}</span>
        </span>
        @if (project.progress.startedAt) {
          <span class="progress-label"><span>Gesamtfortschritt</span><strong>{{ progress }}%</strong></span>
          <span class="progress-track"><span [style.width.%]="progress"></span></span>
        } @else {
          <span class="not-started">Noch nicht gestartet</span>
        }
      </span>
    </button>
  `,
})
export class ProjectPreviewComponent {
  @Input({ required: true }) project!: Project;
  @Input() category = '';
  @Input() editedAt = '';
  @Input() progress = 0;
  @Output() open = new EventEmitter<void>();
}
