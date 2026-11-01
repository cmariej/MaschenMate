import { randomUUID } from 'node:crypto';
import { Schema, model } from 'mongoose';
import type { Activity, ActivityStore } from './activity-store.js';

const activitySchema = new Schema<Activity>(
  {
    id: { type: String, required: true },
    eventKey: { type: String, required: true, unique: true },
    userId: { type: String, required: true, index: true },
    projectId: { type: String, required: true },
    projectName: { type: String, required: true },
    projectImage: { type: String, default: null },
    projectType: { type: String, enum: ['crochet', 'knitting'], required: true },
    projectCategory: { type: String, required: true },
    type: { type: String, enum: ['started', 'section_completed', 'finished', 'cancelled'], required: true },
    sectionName: { type: String, default: null },
    createdAt: { type: String, required: true },
  },
  { versionKey: false, collection: 'activities' },
);
activitySchema.index({ userId:  1, createdAt: -1 });
const ActivityModel = model<Activity>('Activity', activitySchema);

export class MongoActivityStore implements ActivityStore {
  async initialize(): Promise<void> {
    await ActivityModel.init();
  }

  async add(activity: Omit<Activity, 'id' | 'createdAt'>): Promise<void> {
    try {
      await ActivityModel.create({
        ...activity,
        id: randomUUID(),
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) return;
      throw error;
    }
  }

  async listForUsers(userIds: string[], limit: number): Promise<Activity[]> {
    const activities = await ActivityModel.find({ userId: { $in: userIds } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return activities.map((activity) => ({ ...activity }));
  }

  async deleteAllForUser(userId: string): Promise<void> {
    await ActivityModel.deleteMany({ userId });
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}
