import { Routes } from '@angular/router';

const loadDashboard = () => import('./project-dashboard').then((module) => module.ProjectDashboard);

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: 'dashboard', loadComponent: loadDashboard, title: 'Dashboard · MaschenMate' },
  { path: 'projects', loadComponent: loadDashboard, title: 'Projekte · MaschenMate' },
  { path: 'projects/new', loadComponent: loadDashboard, title: 'Neues Projekt · MaschenMate' },
  { path: 'projects/:projectId/edit', loadComponent: loadDashboard, title: 'Projekt bearbeiten · MaschenMate' },
  { path: 'projects/:projectId', loadComponent: loadDashboard, title: 'Projektdetails · MaschenMate' },
  { path: 'yarns', loadComponent: loadDashboard, title: 'Garne · MaschenMate' },
  { path: 'yarns/new', loadComponent: loadDashboard, title: 'Garn hinzufügen · MaschenMate' },
  { path: 'yarns/:yarnId/edit', loadComponent: loadDashboard, title: 'Garn bearbeiten · MaschenMate' },
  { path: 'needles', loadComponent: loadDashboard, title: 'Nadeln · MaschenMate' },
  { path: 'needles/new', loadComponent: loadDashboard, title: 'Nadel hinzufügen · MaschenMate' },
  { path: 'needles/:needleId/edit', loadComponent: loadDashboard, title: 'Nadel bearbeiten · MaschenMate' },
  {
    path: 'friends',
    loadComponent: () => import('./friends.component').then((module) => module.FriendsComponent),
    title: 'Freunde · MaschenMate',
  },
  {
    path: 'datenschutz-impressum',
    loadComponent: () => import('./legal.component').then((module) => module.LegalComponent),
    title: 'Datenschutz & Impressum · MaschenMate',
  },
  {
    path: 'admin/registrations',
    loadComponent: () => import('./admin-registrations.component').then((module) => module.AdminRegistrationsComponent),
    title: 'Registrierungsanfragen · MaschenMate',
  },
  { path: '**', loadComponent: loadDashboard },
];
