import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FeedActivity } from './project.service';

@Component({
  selector: 'app-activity-feed',
  styleUrl: './activity-feed.component.css',
  templateUrl: './activity-feed.component.html',
})
export class ActivityFeedComponent {
  @Input() activities: FeedActivity[] = [];
  @Input() loading = false;
  @Input() error = '';
  @Input() currentUserId: string | null = null;
  @Output() refresh = new EventEmitter<void>();

  protected message(activity: FeedActivity): string {
    switch (activity.type) {
      case 'started':
        return 'hat ein neues Projekt gestartet';
      case 'section_completed':
        return `hat den Abschnitt „${activity.sectionName ?? 'Unbenannter Abschnitt'}“ abgeschlossen`;
      case 'finished':
        return 'hat ein Projekt fertiggestellt';
      case 'cancelled':
        return 'hat ein Projekt abgebrochen';
    }
  }

  protected categoryName(category: FeedActivity['projectCategory']): string {
    const labels: Record<FeedActivity['projectCategory'], string> = {
      sweater: 'Pullover',
      hat: 'Mütze',
      scarf: 'Schal',
      socks: 'Socken',
      blanket: 'Decke',
      bag: 'Tasche',
      accessory: 'Accessoire',
      other: 'Sonstiges',
    };
    return labels[category];
  }

  protected activityTime(value: string): string {
    return new Intl.DateTimeFormat('de-DE', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  }
}
