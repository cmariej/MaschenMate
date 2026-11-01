import { Component, Input } from '@angular/core';

interface FontAwesomeIconDefinition {
  icon: [number, number, string[], string, string | string[]];
}

@Component({
  selector: 'app-fa-icon',
  template: `
    <svg [attr.viewBox]="'0 0 ' + icon.icon[0] + ' ' + icon.icon[1]" focusable="false">
      @for (path of paths; track $index) {
        <path [attr.d]="path" />
      }
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      width: 1em;
      height: 1em;
      align-items: center;
      justify-content: center;
      vertical-align: middle;
    }

    svg {
      display: block;
      width: 100%;
      height: 100%;
      fill: currentColor;
    }
  `,
})
export class FontAwesomeIconComponent {
  @Input({ required: true }) icon!: FontAwesomeIconDefinition;

  protected get paths(): string[] {
    const pathData = this.icon.icon[4];
    return Array.isArray(pathData) ? pathData : [pathData];
  }
}
