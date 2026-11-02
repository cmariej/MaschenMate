import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type ProjectKind = 'crochet' | 'knitting';
export type ProjectCategory = 'sweater' | 'hat' | 'scarf' | 'socks' | 'blanket' | 'bag' | 'accessory' | 'other';
export type YarnUnit = 'g' | 'm';
export type NeedleKind = 'straight' | 'circular' | 'double-pointed' | 'crochet-hook' | 'other';

export interface Gauge {
  stitches: number;
  rows: number;
}

export interface PatternYarn {
  amount: number;
  unit: YarnUnit;
}

export interface Yarn {
  id: string;
  name: string;
  brand: string;
  color: string;
  colorCode: string;
  needleSize: number;
  length: number;
  weight: number;
  composition: YarnComposition[];
}

export interface YarnComposition {
  material: string;
  percentage: number;
}

export interface ProjectYarn extends Yarn {
  gauge: Gauge;
}

export interface Needle {
  id: string;
  type: NeedleKind;
  size: number;
}

export interface InstructionRow {
  instructions: string;
  stitchesPerRow: number;
  yarnId?: string;
}

export interface InstructionRange extends InstructionRow {
  id: string;
  type: 'range';
  fromRow: number;
  toRow: number;
}

export interface InstructionRepeat {
  id: string;
  type: 'repeat';
  fromRow: number;
  toRow: number;
  repeatRows: InstructionRow[];
  yarnId?: string;
}

export type InstructionEntry = InstructionRange | InstructionRepeat;

export interface ProjectSection {
  id: string;
  name: string;
  entries: InstructionEntry[];
  needleId?: string;
}

export interface ProjectLogEntry {
  id: string;
  type: 'started' | 'section_changed' | 'row_completed' | 'row_reopened';
  timestamp: string;
  sectionId?: string;
  rowNumber?: number;
}

export interface ProjectProgress {
  startedAt: string | null;
  cancelledAt?: string | null;
  activeSectionId: string | null;
  pdfProgress: number;
  completedRows: Record<string, number>;
  changelog: ProjectLogEntry[];
}

export interface PdfSection {
  id: string;
  name: string;
  rowCount: number;
}

export interface ProjectInput {
  type: ProjectKind;
  category: ProjectCategory;
  name: string;
  image: string | null;
  gauge?: {
    pattern: Gauge;
    personal: Gauge;
  };
  patternYarn: PatternYarn | null;
  yarns: ProjectYarn[];
  needles: Needle[];
  instructionMode: 'manual' | 'pdf';
  instructionPdf: string | null;
  instructionPdfName: string | null;
  pdfSections: PdfSection[];
  sections: ProjectSection[];
  progress: ProjectProgress;
}

export interface Project extends ProjectInput {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectStore {
  initialize(): Promise<void>;
  list(userId: string): Promise<Project[]>;
  find(userId: string, projectId: string): Promise<Project | null>;
  create(userId: string, input: ProjectInput): Promise<Project>;
  update(userId: string, projectId: string, input: ProjectInput): Promise<Project | null>;
  delete(userId: string, projectId: string): Promise<boolean>;
  deleteAllForUser(userId: string): Promise<void>;
}

export function normalizeStoredProject(project: Project): Project {
  const legacy = project as Project & {
    progress?: Partial<ProjectProgress> | null;
    instructionMode?: ProjectInput['instructionMode'];
    instructionPdf?: string | null;
    instructionPdfName?: string | null;
    category?: ProjectCategory;
  };
  const progress = legacy.progress ?? {};
  return {
    ...legacy,
    category: legacy.category ?? 'other',
    instructionMode: legacy.instructionMode ?? 'manual',
    instructionPdf: legacy.instructionPdf ?? null,
    instructionPdfName: legacy.instructionPdfName ?? null,
    pdfSections: legacy.pdfSections ?? [],
    progress: {
      startedAt: progress.startedAt ?? null,
      cancelledAt: progress.cancelledAt ?? null,
      activeSectionId: progress.activeSectionId ?? null,
      pdfProgress: progress.pdfProgress ?? 0,
      completedRows: progress.completedRows ?? {},
      changelog: progress.changelog ?? [],
    },
  };
}

interface ProjectFile {
  version: 1;
  projects: Project[];
}

const defaultDataFile = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'projects.json');

export class LocalProjectStore implements ProjectStore {
  constructor(private readonly dataFile = defaultDataFile) {}

  private projects: Project[] | null = null;
  private loading: Promise<void> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  async initialize(): Promise<void> {
    await this.ensureLoaded();
  }

  async list(userId: string): Promise<Project[]> {
    await this.ensureLoaded();
    return (this.projects ?? [])
      .filter((project) => project.userId === userId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map(cloneProject);
  }

  async find(userId: string, projectId: string): Promise<Project | null> {
    await this.ensureLoaded();
    const project = this.projects?.find((candidate) => candidate.userId === userId && candidate.id === projectId);
    return project ? cloneProject(project) : null;
  }

  async create(userId: string, input: ProjectInput): Promise<Project> {
    return this.mutate((projects) => {
      const now = new Date().toISOString();
      const project: Project = {
        ...structuredClone(input),
        id: randomUUID(),
        userId,
        createdAt: now,
        updatedAt: now,
      };
      return { projects: [...projects, project], result: project };
    });
  }

  async update(userId: string, projectId: string, input: ProjectInput): Promise<Project | null> {
    return this.mutate((projects) => {
      const index = projects.findIndex((project) => project.userId === userId && project.id === projectId);
      if (index < 0) return { projects, result: null };
      const updated: Project = {
        ...structuredClone(input),
        id: projectId,
        userId,
        createdAt: projects[index].createdAt,
        updatedAt: new Date().toISOString(),
      };
      const next = [...projects];
      next[index] = updated;
      return { projects: next, result: updated };
    });
  }

  async delete(userId: string, projectId: string): Promise<boolean> {
    return this.mutate((projects) => {
      const next = projects.filter((project) => project.userId !== userId || project.id !== projectId);
      return { projects: next, result: next.length !== projects.length };
    });
  }

  async deleteAllForUser(userId: string): Promise<void> {
    await this.mutate((projects) => ({
      projects: projects.filter((project) => project.userId !== userId),
      result: undefined,
    }));
  }

  private async ensureLoaded(): Promise<void> {
    if (this.projects !== null) return;
    this.loading ??= this.loadFile();
    try {
      await this.loading;
    } finally {
      this.loading = null;
    }
  }

  private async loadFile(): Promise<void> {
    await mkdir(dirname(this.dataFile), { recursive: true });
    let contents: string;
    try {
      contents = await readFile(this.dataFile, 'utf8');
    } catch (error) {
      if (!isNodeError(error, 'ENOENT')) throw error;
      this.projects = [];
      await this.persist([]);
      console.log(`Lokale Projektdatenbank angelegt: ${this.dataFile}`);
      return;
    }

    let stored: unknown;
    try {
      stored = JSON.parse(contents);
    } catch (error) {
      throw new Error(`Die lokale Projektdatenbank ist keine gültige JSON-Datei: ${this.dataFile}`, { cause: error });
    }
    if (!isProjectFile(stored)) {
      throw new Error(`Die lokale Projektdatenbank hat ein ungültiges Format: ${this.dataFile}`);
    }
    this.projects = stored.projects;
  }

  private async mutate<T>(
    operation: (projects: Project[]) => { projects: Project[]; result: T },
  ): Promise<T> {
    await this.ensureLoaded();
    const queued = this.writeQueue.then(async () => {
      const { projects, result } = operation(this.projects ?? []);
      await this.persist(projects);
      this.projects = projects;
      return result;
    });
    this.writeQueue = queued.then(() => undefined, () => undefined);
    return queued;
  }

  private async persist(projects: Project[]): Promise<void> {
    const temporaryFile = join(dirname(this.dataFile), `projects.${randomUUID()}.tmp`);
    await writeFile(temporaryFile, `${JSON.stringify({ version: 1, projects }, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    try {
      await rename(temporaryFile, this.dataFile);
    } catch (error) {
      try {
        await unlink(temporaryFile);
      } catch (cleanupError) {
        if (!isNodeError(cleanupError, 'ENOENT')) {
          throw new AggregateError([error, cleanupError], 'Speichern der Projekte ist fehlgeschlagen.');
        }
      }
      throw error;
    }
  }
}

function cloneProject(project: Project): Project {
  return normalizeStoredProject(structuredClone(project));
}

function isProjectFile(value: unknown): value is ProjectFile {
  if (typeof value !== 'object' || value === null || !('version' in value) || !('projects' in value)) return false;
  return value.version === 1 && Array.isArray(value.projects);
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === code;
}
