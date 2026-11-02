import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { faArrowLeft } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIconComponent } from './fontawesome-icon.component';

@Component({
  imports: [RouterLink, FontAwesomeIconComponent],
  selector: 'app-legal',
  styleUrl: './legal.component.css',
  templateUrl: './legal.component.html',
})
export class LegalComponent {
  protected readonly faArrowLeft = faArrowLeft;
}
