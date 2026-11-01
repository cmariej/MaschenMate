import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { UserModel } from './models/user.js';
import { DuplicateUsernameError, type PendingRegistration, type StoredUser, type UserStore } from './user-store.js';

export class MongoUserStore implements UserStore {
  constructor(private readonly connectionString: string) {}

  async initialize(): Promise<void> {
    await mongoose.connect(this.connectionString);
    await UserModel.init();
    await UserModel.updateMany(
      { approved: { $exists: false }, username: { $ne: 'clara' } },
      { $set: { approved: false } },
    );
    await UserModel.updateOne(
      { approved: { $exists: false }, username: 'clara' },
      { $set: { approved: true } },
    );
    console.log('MongoDB verbunden.');
  }

  async findById(id: string): Promise<StoredUser | null> {
    const user = await UserModel.findOne({ id }).select('+passwordHash').lean();
    return user ? mapUser(user) : null;
  }

  async findByUsername(username: string): Promise<StoredUser | null> {
    const user = await UserModel.findOne({ username }).select('+passwordHash').lean();
    return user ? mapUser(user) : null;
  }

  async listPendingRegistrations(): Promise<PendingRegistration[]> {
    const users = await UserModel.find({ approved: false })
      .select('id name username profileImage createdAt')
      .lean();
    return users.map(({ id, name, username, profileImage, createdAt }) => ({
      id, name, username, profileImage: profileImage ?? null, createdAt,
    }));
  }

  async countPendingRegistrations(): Promise<number> {
    return UserModel.countDocuments({ approved: false });
  }

  async setApproved(id: string, approved: boolean): Promise<boolean> {
    const user = await UserModel.findOneAndUpdate(
      { id, approved: false },
      { $set: { approved } },
      { new: true },
    ).lean();
    return user !== null;
  }

  async searchByUsername(
    query: string,
    exceptUserId: string,
  ): Promise<Array<Pick<StoredUser, 'id' | 'name' | 'username' | 'profileImage'>>> {
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const users = await UserModel.find({
      username: { $regex: escapedQuery },
      id: { $ne: exceptUserId },
      approved: true,
    })
      .select('id name username profileImage createdAt')
      .limit(20)
      .lean();
    return users.map(({ id, name, username, profileImage }) => ({
      id,
      name,
      username,
      profileImage: profileImage ?? null,
    }));
  }

  async isUsernameAvailable(username: string, exceptUserId?: string): Promise<boolean> {
    const filter = exceptUserId ? { username, id: { $ne: exceptUserId } } : { username };
    return (await UserModel.exists(filter)) === null;
  }

  async create(user: Omit<StoredUser, 'id' | 'createdAt'>): Promise<StoredUser> {
    try {
      const created = await UserModel.create({
        ...user,
        id: randomUUID(),
        createdAt: new Date().toISOString(),
      });
      return mapUser(created.toObject());
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new DuplicateUsernameError();
      }
      throw error;
    }
  }

  async updateProfile(
    id: string,
    changes: { username?: string; profileImage?: string | null },
  ): Promise<StoredUser | null> {
    try {
      const user = await UserModel.findOneAndUpdate(
        { id },
        { $set: changes },
        { new: true, runValidators: true },
      )
        .select('+passwordHash')
        .lean();
      return user ? mapUser(user) : null;
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new DuplicateUsernameError();
      }
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    const result = await UserModel.deleteOne({ id });
    return result.deletedCount === 1;
  }
}

function mapUser(user: StoredUser): StoredUser {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    passwordHash: user.passwordHash,
    profileImage: user.profileImage ?? null,
    approved: user.approved ?? user.username.toLowerCase() === 'clara',
    createdAt: user.createdAt,
  };
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  );
}
