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
  mergeProjectMaterials(userId: string, yarns: Yarn[], needles: Needle[]): Promise<MaterialIdMappings>;
  deleteAllForUser(userId: string): Promise<void>;
}

export interface MaterialIdMappings {
  yarnIds: Map<string, string>;
  needleIds: Map<string, string>;
}

export class MaterialLimitError extends Error {
  constructor() { super('Deine Materialsammlung darf höchstens 100 Garne und 100 Nadeln enthalten. Bitte entferne zuerst nicht benötigte Materialien.'); }
}

function yarnKey(yarn: Yarn): string {
  const normalize = (value: string | undefined) => (value ?? '').trim().toLocaleLowerCase('de-DE');
  return JSON.stringify([
    normalize(yarn.name), normalize(yarn.brand), normalize(yarn.color), normalize(yarn.colorCode),
    yarn.needleSize, yarn.length, yarn.weight,
    (yarn.composition ?? []).map((part) => [normalize(part.material), part.percentage]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  ]);
}

export function reconcileProjectMaterials(library: MaterialLibrary, yarns: Yarn[], needles: Needle[]): { materials: MaterialLibrary; mappings: MaterialIdMappings; changed: boolean } {
  const merged = structuredClone(library);
  const yarnIds = new Map<string, string>();
  const needleIds = new Map<string, string>();
  const claimedYarns = new Set<string>();
  const claimedNeedles = new Set<string>();
  const reservedYarns = new Set(yarns.map((yarn) => yarn.id));
  const reservedNeedles = new Set(needles.map((needle) => needle.id));
  let changed = false;

  for (const yarn of yarns) {
    const existing = merged.yarns.find((item) => item.id === yarn.id && yarnKey(item) === yarnKey(yarn))
      ?? merged.yarns.find((item) => !claimedYarns.has(item.id) && !reservedYarns.has(item.id) && yarnKey(item) === yarnKey(yarn));
    const target = existing ?? { ...structuredClone(yarn), id: randomUUID() };
    if (!existing) { merged.yarns.push(target); changed = true; }
    yarnIds.set(yarn.id, target.id);
    claimedYarns.add(target.id);
  }
  for (const needle of needles) {
    const existing = merged.needles.find((item) => item.id === needle.id && item.type === needle.type && item.size === needle.size)
      ?? merged.needles.find((item) => !claimedNeedles.has(item.id) && !reservedNeedles.has(item.id) && item.type === needle.type && item.size === needle.size);
    const target = existing ?? { ...structuredClone(needle), id: randomUUID() };
    if (!existing) { merged.needles.push(target); changed = true; }
    needleIds.set(needle.id, target.id);
    claimedNeedles.add(target.id);
  }
  if (changed && (merged.yarns.length > 100 || merged.needles.length > 100)) throw new MaterialLimitError();
  return { materials: merged, mappings: { yarnIds, needleIds }, changed };
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

  async mergeProjectMaterials(userId: string, yarns: Yarn[], needles: Needle[]): Promise<MaterialIdMappings> {
    return this.mutate((data) => {
      const { materials, mappings, changed } = reconcileProjectMaterials(data.users[userId] ?? { yarns: [], needles: [] }, yarns, needles);
      return { next: changed ? { version: 1, users: { ...data.users, [userId]: materials } } : data, result: mappings };
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
      if (next !== this.data) {
        await this.persist(next);
        this.data = next;
      }
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
