import { randomUUID } from 'node:crypto';
import mongoose, { Schema, model } from 'mongoose';
import type { Project, ProjectInput, ProjectStore } from './project-store.js';

interface StoredProject {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  data: ProjectInput;
}

const projectSchema = new Schema<StoredProject>(
  {
    id: { type: String, required: true, unique: true },
    userId: { type: String, required: true, index: true },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
    data: { type: Schema.Types.Mixed, required: true },
  },
  { versionKey: false, collection: 'projects' },
);
const ProjectModel = model<StoredProject>('Project', projectSchema);

export class MongoProjectStore implements ProjectStore {
  async initialize(): Promise<void> {
    await ProjectModel.init();
  }

  async list(userId: string): Promise<Project[]> {
    const documents = await ProjectModel.find({ userId }).sort({ updatedAt: -1 }).lean();
    return documents.map(mapProject);
  }

  async find(userId: string, projectId: string): Promise<Project | null> {
    const document = await ProjectModel.findOne({ id: projectId, userId }).lean();
    return document ? mapProject(document) : null;
  }

  async create(userId: string, input: ProjectInput): Promise<Project> {
    const now = new Date().toISOString();
    const document = await ProjectModel.create({
      id: randomUUID(),
      userId,
      createdAt: now,
      updatedAt: now,
      data: input,
    });
    return mapProject(document.toObject());
  }

  async update(userId: string, projectId: string, input: ProjectInput): Promise<Project | null> {
    const document = await ProjectModel.findOneAndUpdate(
      { id: projectId, userId },
      { $set: { data: input, updatedAt: new Date().toISOString() } },
      { new: true },
    ).lean();
    return document ? mapProject(document) : null;
  }

  async delete(userId: string, projectId: string): Promise<boolean> {
    const result = await ProjectModel.deleteOne({ id: projectId, userId });
    return result.deletedCount === 1;
  }

  async deleteAllForUser(userId: string): Promise<void> {
    await ProjectModel.deleteMany({ userId });
  }
}

function mapProject(document: StoredProject): Project {
  return {
    ...structuredClone(document.data),
    id: document.id,
    userId: document.userId,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}
