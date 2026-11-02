import { Schema, model } from 'mongoose';
import { reconcileProjectMaterials, type MaterialIdMappings, type MaterialLibrary, type MaterialStore } from './material-store.js';
import type { Needle, Yarn } from './project-store.js';

interface StoredMaterials {
  userId: string;
  materials: MaterialLibrary;
  revision?: number;
}

const materialSchema = new Schema<StoredMaterials>(
  {
    userId: { type: String, required: true, unique: true },
    materials: { type: Schema.Types.Mixed, required: true },
    revision: { type: Number },
  },
  { versionKey: false, collection: 'materials' },
);
const MaterialModel = model<StoredMaterials>('MaterialLibrary', materialSchema);

export class MongoMaterialStore implements MaterialStore {
  async initialize(): Promise<void> {
    await MaterialModel.init();
  }

  async get(userId: string): Promise<MaterialLibrary> {
    const stored = await MaterialModel.findOne({ userId }).lean();
    return stored ? structuredClone(stored.materials) : { yarns: [], needles: [] };
  }

  async save(userId: string, materials: MaterialLibrary): Promise<MaterialLibrary> {
    await MaterialModel.findOneAndUpdate(
      { userId },
      { $set: { materials }, $inc: { revision: 1 } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    return structuredClone(materials);
  }

  async mergeProjectMaterials(userId: string, yarns: Yarn[], needles: Needle[]): Promise<MaterialIdMappings> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const stored = await MaterialModel.findOne({ userId }).lean();
      const { materials, mappings, changed } = reconcileProjectMaterials(stored?.materials ?? { yarns: [], needles: [] }, yarns, needles);
      if (!changed) return mappings;
      if (!stored) {
        try {
          await MaterialModel.create({ userId, materials, revision: 1 });
          return mappings;
        } catch (error) {
          if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) continue;
          throw error;
        }
      }
      const revision = stored.revision === undefined ? { $exists: false } : stored.revision;
      const updated = await MaterialModel.findOneAndUpdate({ userId, revision }, { $set: { materials }, $inc: { revision: 1 } }, { new: true }).lean();
      if (updated) return mappings;
    }
    throw new Error('Die Materialsammlung wurde gleichzeitig geändert. Bitte versuche es erneut.');
  }

  async deleteAllForUser(userId: string): Promise<void> {
    await MaterialModel.deleteOne({ userId });
  }
}
