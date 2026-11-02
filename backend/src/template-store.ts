import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PdfSection, ProjectCategory, ProjectInput, ProjectKind, ProjectSection } from './project-store.js';

export interface ProjectTemplate {
  id: string;
  userId: string;
  shared?: boolean;
  sharedAt?: string | null;
  sharingRestricted?: boolean;
  materialRefsLocal?: boolean;
  name: string;
  projectName: string;
  size: string;
  designer?: string;
  websiteUrl?: string;
  type: ProjectKind;
  category: ProjectCategory;
  image: ProjectInput['image'];
  gauge: ProjectInput['gauge'];
  patternYarn: ProjectInput['patternYarn'];
  yarns: ProjectInput['yarns'];
  needles: ProjectInput['needles'];
  instructionMode: 'manual' | 'pdf';
  instructionPdf: string | null;
  instructionPdfName: string | null;
  pdfSections: PdfSection[];
  sections: ProjectSection[];
  createdAt: string;
}

export type TemplateSummary = Pick<ProjectTemplate, 'id' | 'name' | 'size' | 'type' | 'category' | 'instructionMode' | 'createdAt' | 'designer' | 'shared' | 'sharedAt'> & { hasImage: boolean };

export interface TemplateStore {
  initialize(): Promise<void>;
  list(userId: string): Promise<TemplateSummary[]>;
  listShared(userIds: string[]): Promise<(TemplateSummary & { userId: string })[]>;
  findShared(id: string, userIds: string[]): Promise<ProjectTemplate | null>;
  setShared(userId: string, id: string, shared: boolean): Promise<boolean>;
  find(userId: string, id: string): Promise<ProjectTemplate | null>;
  findImage(userId: string, id: string): Promise<string | null>;
  create(template: ProjectTemplate): Promise<ProjectTemplate>;
  delete(userId: string, id: string): Promise<boolean>;
  deleteAllForUser(userId: string): Promise<void>;
}

interface TemplateFile { version: 1; templates: ProjectTemplate[]; }
const defaultFile = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'project-templates.json');

export class LocalTemplateStore implements TemplateStore {
  constructor(private readonly dataFile = defaultFile) {}
  private data: TemplateFile | null = null;
  private loading: Promise<void> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  async initialize(): Promise<void> {
    if (this.data) return;
    this.loading ??= this.load();
    try { await this.loading; } finally { this.loading = null; }
  }

  async list(userId: string): Promise<TemplateSummary[]> {
    await this.initialize();
    return this.data!.templates.filter((item) => item.userId === userId).map(({ id, name, size, type, category, instructionMode, createdAt, image, designer, shared, sharedAt }) => ({ id, name, size: size ?? '', type, category, instructionMode, createdAt, designer: designer ?? '', shared: !!shared, sharedAt, hasImage: Boolean(image) }));
  }

  async listShared(userIds: string[]): Promise<(TemplateSummary & { userId: string })[]> {
    await this.initialize();
    return this.data!.templates.filter((item) => item.shared && userIds.includes(item.userId)).map(({ id, userId, name, size, type, category, instructionMode, createdAt, image, designer, sharedAt }) => ({ id, userId, name, size: size ?? '', type, category, instructionMode, createdAt, designer: designer ?? '', shared: true, sharedAt, hasImage: Boolean(image) }));
  }

  async findShared(id: string, userIds: string[]): Promise<ProjectTemplate | null> {
    await this.initialize();
    const item = this.data!.templates.find((template) => template.id === id && template.shared && userIds.includes(template.userId));
    return item ? structuredClone(item) : null;
  }

  async setShared(userId: string, id: string, shared: boolean): Promise<boolean> {
    return this.mutate((items) => ({ items: items.map((item) => item.userId === userId && item.id === id ? { ...item, shared, sharedAt: shared ? (item.shared && item.sharedAt || new Date().toISOString()) : null } : item), result: items.some((item) => item.userId === userId && item.id === id) }));
  }

  async find(userId: string, id: string): Promise<ProjectTemplate | null> {
    await this.initialize();
    const found = this.data!.templates.find((item) => item.userId === userId && item.id === id);
    return found ? structuredClone(found) : null;
  }

  async findImage(userId: string, id: string): Promise<string | null> {
    await this.initialize();
    return this.data!.templates.find((item) => item.userId === userId && item.id === id)?.image ?? null;
  }

  async create(template: ProjectTemplate): Promise<ProjectTemplate> {
    return this.mutate((items) => ({ items: [...items, structuredClone(template)], result: structuredClone(template) }));
  }

  async delete(userId: string, id: string): Promise<boolean> {
    return this.mutate((items) => {
      const remaining = items.filter((item) => item.userId !== userId || item.id !== id);
      return { items: remaining, result: remaining.length !== items.length };
    });
  }

  async deleteAllForUser(userId: string): Promise<void> {
    await this.mutate((items) => ({ items: items.filter((item) => item.userId !== userId), result: undefined }));
  }

  private async load(): Promise<void> {
    await mkdir(dirname(this.dataFile), { recursive: true });
    try {
      const value: unknown = JSON.parse(await readFile(this.dataFile, 'utf8'));
      if (typeof value !== 'object' || value === null || !('version' in value) || value.version !== 1 || !('templates' in value) || !Array.isArray(value.templates)) throw new Error('Ungültiges Format');
      this.data = value as TemplateFile;
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      this.data = { version: 1, templates: [] };
    }
  }

  private async mutate<T>(operation: (items: ProjectTemplate[]) => { items: ProjectTemplate[]; result: T }): Promise<T> {
    await this.initialize();
    const task = this.writeQueue.then(async () => {
      const { items, result } = operation(this.data!.templates);
      const next: TemplateFile = { version: 1, templates: items };
      const temporary = join(dirname(this.dataFile), `project-templates.${randomUUID()}.tmp`);
      await writeFile(temporary, `${JSON.stringify(next)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
      try { await rename(temporary, this.dataFile); } catch (error) { await unlink(temporary).catch(() => undefined); throw error; }
      this.data = next;
      return result;
    });
    this.writeQueue = task.then(() => undefined, () => undefined);
    return task;
  }
}
