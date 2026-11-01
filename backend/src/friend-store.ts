import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Friendship {
  id: string;
  firstUserId: string;
  secondUserId: string;
  requesterId: string;
  status: 'pending' | 'accepted';
  createdAt: string;
}

export interface FriendStore {
  initialize(): Promise<void>;
  listForUser(userId: string): Promise<Friendship[]>;
  addRequest(requesterId: string, recipientId: string): Promise<'created' | 'exists'>;
  respond(userId: string, requesterId: string, accept: boolean): Promise<boolean>;
  removeFriend(userId: string, friendId: string): Promise<boolean>;
  deleteAllForUser(userId: string): Promise<void>;
}

interface FriendshipFile {
  version: 1;
  friendships: Friendship[];
}

const defaultDataFile = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'friendships.json');

export class LocalFriendStore implements FriendStore {
  constructor(private readonly dataFile = defaultDataFile) {}

  private data: FriendshipFile | null = null;
  private loading: Promise<void> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  async initialize(): Promise<void> {
    await this.ensureLoaded();
  }

  async listForUser(userId: string): Promise<Friendship[]> {
    await this.ensureLoaded();
    return this.data!.friendships.filter(
      (friendship) => friendship.firstUserId === userId || friendship.secondUserId === userId,
    ).map((friendship) => ({ ...friendship }));
  }

  async addRequest(requesterId: string, recipientId: string): Promise<'created' | 'exists'> {
    const [firstUserId, secondUserId] = sortIds(requesterId, recipientId);
    return this.mutate((friendships) => {
      if (friendships.some((friendship) =>
        friendship.firstUserId === firstUserId && friendship.secondUserId === secondUserId,
      )) {
        return { friendships, result: 'exists' };
      }

      const request: Friendship = {
        id: randomUUID(),
        firstUserId,
        secondUserId,
        requesterId,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      return { friendships: [...friendships, request], result: 'created' };
    });
  }

  async respond(userId: string, requesterId: string, accept: boolean): Promise<boolean> {
    const [firstUserId, secondUserId] = sortIds(userId, requesterId);
    return this.mutate((friendships) => {
      const friendship = friendships.find((item) =>
        item.firstUserId === firstUserId &&
        item.secondUserId === secondUserId &&
        item.requesterId === requesterId &&
        item.status === 'pending',
      );
      if (!friendship) return { friendships, result: false };
      const updated = accept
        ? friendships.map((item) => item.id === friendship.id ? { ...item, status: 'accepted' as const } : item)
        : friendships.filter((item) => item.id !== friendship.id);
      return { friendships: updated, result: true };
    });
  }

  async removeFriend(userId: string, friendId: string): Promise<boolean> {
    const [firstUserId, secondUserId] = sortIds(userId, friendId);
    return this.mutate((friendships) => {
      const remaining = friendships.filter((item) =>
        !(item.firstUserId === firstUserId &&
          item.secondUserId === secondUserId &&
          item.status === 'accepted'),
      );
      return { friendships: remaining, result: remaining.length !== friendships.length };
    });
  }

  async deleteAllForUser(userId: string): Promise<void> {
    await this.mutate((friendships) => ({
      friendships: friendships.filter(
        (friendship) => friendship.firstUserId !== userId && friendship.secondUserId !== userId,
      ),
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
      this.data = { version: 1, friendships: [] };
      await this.persist(this.data);
      return;
    }

    let stored: unknown;
    try {
      stored = JSON.parse(contents);
    } catch (error) {
      throw new Error(`Die lokale Freundesdatenbank ist keine gültige JSON-Datei: ${this.dataFile}`, { cause: error });
    }
    if (!isFriendshipFile(stored)) {
      throw new Error(`Die lokale Freundesdatenbank hat ein ungültiges Format: ${this.dataFile}`);
    }
    this.data = stored;
  }

  private async mutate<T>(operation: (friendships: Friendship[]) => { friendships: Friendship[]; result: T }): Promise<T> {
    await this.ensureLoaded();
    const queued = this.writeQueue.then(async () => {
      const { friendships, result } = operation(this.data!.friendships);
      const next = { version: 1 as const, friendships };
      await this.persist(next);
      this.data = next;
      return result;
    });
    this.writeQueue = queued.then(() => undefined, () => undefined);
    return queued;
  }

  private async persist(data: FriendshipFile): Promise<void> {
    const temporaryFile = join(dirname(this.dataFile), `friendships.${randomUUID()}.tmp`);
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
          throw new AggregateError([error, cleanupError], 'Speichern der Freundesdaten ist fehlgeschlagen.');
        }
      }
      throw error;
    }
  }
}

export function sortIds(firstId: string, secondId: string): [string, string] {
  return firstId < secondId ? [firstId, secondId] : [secondId, firstId];
}

function isFriendshipFile(value: unknown): value is FriendshipFile {
  if (typeof value !== 'object' || value === null || !('version' in value) || !('friendships' in value)) {
    return false;
  }
  const file = value as { version: unknown; friendships: unknown };
  return file.version === 1 && Array.isArray(file.friendships) &&
    file.friendships.every((item) =>
      typeof item === 'object' && item !== null &&
      'id' in item && typeof item.id === 'string' &&
      'firstUserId' in item && typeof item.firstUserId === 'string' &&
      'secondUserId' in item && typeof item.secondUserId === 'string' &&
      'requesterId' in item && typeof item.requesterId === 'string' &&
      'status' in item && (item.status === 'pending' || item.status === 'accepted') &&
      'createdAt' in item && typeof item.createdAt === 'string',
    );
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === code;
}
