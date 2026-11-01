import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Needle, Yarn } from './project-store.js';

export interface MaterialLibrary {
  yarns: Yarn[];
  needles: Needle[];
}

export interface MaterialStore {
  initialize(): Promise<void>;
  get(userId: string): Promise<MaterialLibrary>;
  save(userId: string, materials: MaterialLibrary): Promise<MaterialLibrary>;
  deleteAllForUser(userId: string): Promise<void>;
}

interface MaterialFile {
  version: 1;
  users: Record<string, MaterialLibrary>;
}

const defaultDataFile = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'materials.json');

export class LocalMaterialStore implements MaterialStore {
  constructor(private readonly dataFile = defaultDataFile) {}

  private data: MaterialFile | null = null;
  private loading: Promise<void> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  async initialize(): Promise<void> {
    await this.ensureLoaded();
  }

  async get(userId: string): Promise<MaterialLibrary> {
    await this.ensureLoaded();
    return structuredClone(this.data!.users[userId] ?? { yarns: [], needles: [] });
  }

  async save(userId: string, materials: MaterialLibrary): Promise<MaterialLibrary> {
    return this.mutate((data) => {
      const users = { ...data.users, [userId]: structuredClone(materials) };
      return { next: { version: 1, users }, result: structuredClone(materials) };
    });
  }

  async deleteAllForUser(userId: string): Promise<void> {
    await this.mutate((data) => {
      const users = { ...data.users };
      delete users[userId];
      return { next: { version: 1, users }, result: undefined };
    });
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
      this.data = { version: 1, users: {} };
      await this.persist(this.data);
      return;
    }
    let value: unknown;
    try {
      value = JSON.parse(contents);
    } catch (error) {
      throw new Error(`Die Materialdatenbank ist keine gültige JSON-Datei: ${this.dataFile}`, { cause: error });
    }
    if (typeof value !== 'object' || value === null || !('version' in value) || value.version !== 1 || !('users' in value) || typeof value.users !== 'object' || value.users === null) {
      throw new Error(`Die Materialdatenbank hat ein ungültiges Format: ${this.dataFile}`);
    }
    this.data = value as MaterialFile;
  }

  private async mutate<T>(operation: (data: MaterialFile) => { next: MaterialFile; result: T }): Promise<T> {
    await this.ensureLoaded();
    const queued = this.writeQueue.then(async () => {
      const { next, result } = operation(this.data!);
      await this.persist(next);
      this.data = next;
      return result;
    });
    this.writeQueue = queued.then(() => undefined, () => undefined);
    return queued;
  }

  private async persist(data: MaterialFile): Promise<void> {
    const temporaryFile = join(dirname(this.dataFile), `materials.${randomUUID()}.tmp`);
    await writeFile(temporaryFile, `${JSON.stringify(data, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    try {
      await rename(temporaryFile, this.dataFile);
    } catch (error) {
      try {
        await unlink(temporaryFile);
      } catch (cleanupError) {
        if (!isNodeError(cleanupError, 'ENOENT')) throw new AggregateError([error, cleanupError], 'Speichern der Materialien ist fehlgeschlagen.');
      }
      throw error;
    }
  }
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === code;
}
