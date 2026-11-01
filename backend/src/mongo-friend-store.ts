import { randomUUID } from 'node:crypto';
import { Schema, model } from 'mongoose';
import type { FriendStore, Friendship } from './friend-store.js';
import { sortIds } from './friend-store.js';

const friendshipSchema = new Schema<Friendship>(
  {
    id: { type: String, required: true },
    firstUserId: { type: String, required: true },
    secondUserId: { type: String, required: true },
    requesterId: { type: String, required: true },
    status: { type: String, enum: ['pending', 'accepted'], required: true },
    createdAt: { type: String, required: true },
  },
  { versionKey: false, collection: 'friendships' },
);
friendshipSchema.index({ firstUserId: 1, secondUserId: 1 }, { unique: true });
const FriendshipModel = model<Friendship>('Friendship', friendshipSchema);

export class MongoFriendStore implements FriendStore {
  async initialize(): Promise<void> {
    await FriendshipModel.init();
  }

  async listForUser(userId: string): Promise<Friendship[]> {
    const records = await FriendshipModel.find({
      $or: [{ firstUserId: userId }, { secondUserId: userId }],
    }).lean();
    return records.map((record) => ({ ...record }));
  }

  async addRequest(requesterId: string, recipientId: string): Promise<'created' | 'exists'> {
    const [firstUserId, secondUserId] = sortIds(requesterId, recipientId);
    try {
      await FriendshipModel.create({
        id: randomUUID(),
        firstUserId,
        secondUserId,
        requesterId,
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
      return 'created';
    } catch (error) {
      if (isDuplicateKeyError(error)) return 'exists';
      throw error;
    }
  }

  async respond(userId: string, requesterId: string, accept: boolean): Promise<boolean> {
    const [firstUserId, secondUserId] = sortIds(userId, requesterId);
    if (accept) {
      const updated = await FriendshipModel.findOneAndUpdate(
        { firstUserId, secondUserId, requesterId, status: 'pending' },
        { $set: { status: 'accepted' } },
        { new: true },
      );
      return updated !== null;
    }
    const removed = await FriendshipModel.deleteOne({
      firstUserId, secondUserId, requesterId, status: 'pending',
    });
    return removed.deletedCount === 1;
  }

  async removeFriend(userId: string, friendId: string): Promise<boolean> {
    const [firstUserId, secondUserId] = sortIds(userId, friendId);
    const removed = await FriendshipModel.deleteOne({
      firstUserId, secondUserId, status: 'accepted',
    });
    return removed.deletedCount === 1;
  }

  async deleteAllForUser(userId: string): Promise<void> {
    await FriendshipModel.deleteMany({ $or: [{ firstUserId: userId }, { secondUserId: userId }] });
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}
