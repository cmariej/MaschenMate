import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface StoredUser {
  id: string;
  name: string;
  username: string;
  passwordHash: string;
  profileImage: string | null;
  approved: boolean;
  createdAt: string;
}

export type PendingRegistration = Pick<
  StoredUser,
  'id' | 'name' | 'username' | 'profileImage' | 'createdAt'
>;

export interface UserStore {
  initialize(): Promise<void>;
  findById(id: string): Promise<StoredUser | null>;
  findByUsername(username: string): Promise<StoredUser | null>;
  listPendingRegistrations(): Promise<PendingRegistration[]>;
  countPendingRegistrations(): Promise<number>;
  setApproved(id: string, approved: boolean): Promise<boolean>;
  searchByUsername(
    query: string,
    exceptUserId: string,
  ): Promise<Array<Pick<StoredUser, 'id' | 'name' | 'username' | 'profileImage'>>>;
  isUsernameAvailable(username: string, exceptUserId?: string): Promise<boolean>;
  create(user: Omit<StoredUser, 'id' | 'createdAt'>): Promise<StoredUser>;
  updateProfile(
    id: string,
    changes: { username?: string; profileImage?: string | null },
  ): Promise<StoredUser | null>;
  delete(id: string): Promise<boolean>;
}

interface StoreFile {
  version: 1;
  users: StoredUser[];
}

export class DuplicateUsernameError extends Error {
  constructor() {
    super('Dieser Benutzername ist bereits vergeben.');
    this.name = 'DuplicateUsernameError';
  }
}

const defaultDataFile = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'users.json');

export class LocalUserStore implements UserStore {
  constructor(private readonly dataFile = defaultDataFile) {}

  private users: StoredUser[] | null = null;
  private loading: Promise<void> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  async initialize(): Promise<void> {
    await this.ensureLoaded();
  }

  async findById(id: string): Promise<StoredUser | null> {
    await this.ensureLoaded();
    const user = this.users?.find((candidate) => candidate.id === id);
    return user ? { ...user } : null;
  }

  async findByUsername(username: string): Promise<StoredUser | null> {
    await this.ensureLoaded();
    const user = this.users?.find((candidate) => candidate.username === username);
    return user ? { ...user } : null;
  }

  async listPendingRegistrations(): Promise<PendingRegistration[]> {
    await this.ensureLoaded();
    return (this.users ?? []).filter((user) => !user.approved).map(({ id, name, username, profileImage, createdAt }) => ({
      id, name, username, profileImage, createdAt,
    }));
  }

  async countPendingRegistrations(): Promise<number> {
    await this.ensureLoaded();
    return (this.users ?? []).filter((user) => !user.approved).length;
  }

  async setApproved(id: string, approved: boolean): Promise<boolean> {
    return this.mutate((users) => {
      const current = users.find((user) => user.id === id);
      if (!current || current.approved) return { users, result: false };
      const updated = { ...current, approved };
      return {
        users: users.map((user) => user.id === id ? updated : user),
        result: true,
      };
    });
  }

  async searchByUsername(
    query: string,
    exceptUserId: string,
  ): Promise<Array<Pick<StoredUser, 'id' | 'name' | 'username' | 'profileImage'>>> {
    await this.ensureLoaded();
    return (this.users ?? [])
      .filter((user) => user.approved && user.id !== exceptUserId && user.username.includes(query))
      .slice(0, 20)
      .map(({ id, name, username, profileImage }) => ({ id, name, username, profileImage }));
  }

  async isUsernameAvailable(username: string, exceptUserId?: string): Promise<boolean> {
    await this.ensureLoaded();
    return !this.users?.some(
      (user) => user.username === username && user.id !== exceptUserId,
    );
  }

  async create(user: Omit<StoredUser, 'id' | 'createdAt'>): Promise<StoredUser> {
    return this.mutate((users) => {
      if (users.some((candidate) => candidate.username === user.username)) {
        throw new DuplicateUsernameError();
      }

      const created: StoredUser = {
        ...user,
        id: randomUUID(),
        createdAt: new Date().toISOString(),
      };
      return { users: [...users, created], result: created };
    });
  }

  async updateProfile(
    id: string,
    changes: { username?: string; profileImage?: string | null },
  ): Promise<StoredUser | null> {
    return this.mutate((users) => {
      const current = users.find((user) => user.id === id);
      if (!current) {
        return { users, result: null };
      }
      if (
        changes.username !== undefined &&
        users.some((user) => user.id !== id && user.username === changes.username)
      ) {
        throw new DuplicateUsernameError();
      }

      const updated = { ...current, ...changes };
      return {
        users: users.map((user) => (user.id === id ? updated : user)),
        result: updated,
      };
    });
  }

  async delete(id: string): Promise<boolean> {
    return this.mutate((users) => {
      const remaining = users.filter((user) => user.id !== id);
      return { users: remaining, result: remaining.length !== users.length };
    });
  }

  private async ensureLoaded(): Promise<void> {
    if (this.users !== null) {
      return;
    }

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
      if (!isNodeError(error, 'ENOENT')) {
        throw error;
      }
      this.users = [];
      await this.persist(this.users);
      console.log(`Lokale Benutzerdatenbank angelegt: ${this.dataFile}`);
      return;
    }

    let stored: unknown;
    try {
      stored = JSON.parse(contents);
    } catch (error) {
      throw new Error(`Die lokale Benutzerdatenbank ist keine gültige JSON-Datei: ${this.dataFile}`, {
        cause: error,
      });
    }

    if (!isStoreFile(stored)) {
      throw new Error(`Die lokale Benutzerdatenbank hat ein ungültiges Format: ${this.dataFile}`);
    }
    this.users = stored.users.map((user) => ({
      ...user,
      approved: user.approved ?? user.username.toLowerCase() === 'clara',
    }));
  }

  private async mutate<T>(
    operation: (users: StoredUser[]) => { users: StoredUser[]; result: T },
  ): Promise<T> {
    await this.ensureLoaded();
    const queued = this.writeQueue.then(async () => {
      const { users, result } = operation(this.users ?? []);
      await this.persist(users);
      this.users = users;
      return result;
    });
    this.writeQueue = queued.then(
      () => undefined,
      () => undefined,
    );
    return queued;
  }

  private async persist(users: StoredUser[]): Promise<void> {
    const contents: StoreFile = { version: 1, users };
    const temporaryFile = join(dirname(this.dataFile), `users.${randomUUID()}.tmp`);
    await writeFile(temporaryFile, `${JSON.stringify(contents, null, 2)}\n`, {
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
          throw new AggregateError([error, cleanupError], 'Speichern der Benutzerdaten ist fehlgeschlagen.');
        }
      }
      throw error;
    }
  }
}

function isStoreFile(value: unknown): value is StoreFile {
  if (typeof value !== 'object' || value === null || !('version' in value) || !('users' in value)) {
    return false;
  }

  const store = value as { version: unknown; users: unknown };
  return (
    store.version === 1 &&
    Array.isArray(store.users) &&
    store.users.every(
      (user) =>
        typeof user === 'object' &&
        user !== null &&
        'id' in user &&
        typeof user.id === 'string' &&
        'name' in user &&
        typeof user.name === 'string' &&
        'username' in user &&
        typeof user.username === 'string' &&
        'passwordHash' in user &&
        typeof user.passwordHash === 'string' &&
        'profileImage' in user &&
        (typeof user.profileImage === 'string' || user.profileImage === null) &&
        (!('approved' in user) || typeof user.approved === 'boolean') &&
        'createdAt' in user &&
        typeof user.createdAt === 'string',
    )
  );
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === code;
}
