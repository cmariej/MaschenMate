import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ProjectCategory, ProjectKind } from './project-store.js';

export type ActivityType = 'started' | 'section_completed' | 'finished' | 'cancelled';

export interface Activity {
  id: string;
  eventKey: string;
  userId: string;
  projectId: string;
  projectName: string;
  projectImage: string | null;
  projectType: ProjectKind;
  projectCategory: ProjectCategory;
  type: ActivityType;
  sectionName: string | null;
  createdAt: string;
}

export interface ActivityStore {
  initialize(): Promise<void>;
  add(activity: Omit<Activity, 'id' | 'createdAt'>): Promise<void>;
  listForUsers(userIds: string[], limit: number): Promise<Activity[]>;
  deleteAllForUser(userId: string): Promise<void>;
}

interface ActivityFile {
  version: 1;
  activities: Activity[];
}

const defaultDataFile = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'activities.json');

export class LocalActivityStore implements ActivityStore {
  constructor(private readonly dataFile = defaultDataFile) {}

  private data: ActivityFile | null = null;
  private loading: Promise<void> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  async initialize(): Promise<void> {
    await this.ensureLoaded();
  }

  async add(activity: Omit<Activity, 'id' | 'createdAt'>): Promise<void> {
    await this.mutate((activities) => {
      if (activities.some((item) => item.eventKey === activity.eventKey)) {
        return { activities, result: undefined };
      }
      const created: Activity = { ...activity, id: randomUUID(), createdAt: new Date().toISOString() };
      return { activities: [...activities, created], result: undefined };
    });
  }

  async listForUsers(userIds: string[], limit: number): Promise<Activity[]> {
    await this.ensureLoaded();
    const included = new Set(userIds);
    return this.data!.activities
      .filter((activity) => included.has(activity.userId))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit)
      .map((activity) => ({ ...activity }));
  }

  async deleteAllForUser(userId: string): Promise<void> {
    await this.mutate((activities) => ({
      activities: activities.filter((activity) => activity.userId !== userId),
      result: undefined,
    }));
  }

  private async ensureLoaded(): Promise<void> {
    if (this.data) return;
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
      this.data = { version: 1, activities: [] };
      await this.persist(this.data);
      return;
    }
    let stored: unknown;
    try {
      stored = JSON.parse(contents);
    } catch (error) {
      throw new Error(`Der lokale Aktivitätsfeed ist keine gültige JSON-Datei: ${this.dataFile}`, { cause: error });
    }
    if (!isActivityFile(stored)) {
      throw new Error(`Der lokale Aktivitätsfeed hat ein ungültiges Format: ${this.dataFile}`);
    }
    this.data = stored;
  }

  private async mutate<T>(
    operation: (activities: Activity[]) => { activities: Activity[]; result: T },
  ): Promise<T> {
    await this.ensureLoaded();
    const queued = this.writeQueue.then(async () => {
      const { activities, result } = operation(this.data!.activities);
      const next = { version: 1 as const, activities };
      await this.persist(next);
      this.data = next;
      return result;
    });
    this.writeQueue = queued.then(() => undefined, () => undefined);
    return queued;
  }

  private async persist(data: ActivityFile): Promise<void> {
    const temporaryFile = join(dirname(this.dataFile), `activities.${randomUUID()}.tmp`);
    await writeFile(temporaryFile, `${JSON.stringify(data, null, 2)}\n`, {
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
          throw new AggregateError([error, cleanupError], 'Speichern des Aktivitätsfeeds ist fehlgeschlagen.');
        }
      }
      throw error;
    }
  }
}

function isActivityFile(value: unknown): value is ActivityFile {
  if (typeof value !== 'object' || value === null || !('version' in value) || !('activities' in value)) return false;
  const file = value as { version: unknown; activities: unknown };
  return file.version === 1 && Array.isArray(file.activities) && file.activities.every((activity) =>
    typeof activity === 'object' && activity !== null &&
    'id' in activity && typeof activity.id === 'string' &&
    'eventKey' in activity && typeof activity.eventKey === 'string' &&
    'userId' in activity && typeof activity.userId === 'string' &&
    'projectId' in activity && typeof activity.projectId === 'string' &&
    'projectName' in activity && typeof activity.projectName === 'string' &&
    'projectImage' in activity && (typeof activity.projectImage === 'string' || activity.projectImage === null) &&
    'projectType' in activity && (activity.projectType === 'crochet' || activity.projectType === 'knitting') &&
    'projectCategory' in activity &&
      ['sweater', 'hat', 'scarf', 'socks', 'blanket', 'bag', 'accessory', 'other'].includes(activity.projectCategory as string) &&
    'type' in activity && ['started', 'section_completed', 'finished', 'cancelled'].includes(activity.type as string) &&
    'sectionName' in activity && (typeof activity.sectionName === 'string' || activity.sectionName === null) &&
    'createdAt' in activity && typeof activity.createdAt === 'string',
  );
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === code;
}
