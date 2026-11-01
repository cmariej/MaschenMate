import { Schema, model } from 'mongoose';
import type { MaterialLibrary, MaterialStore } from './material-store.js';

interface StoredMaterials {
  userId: string;
  materials: MaterialLibrary;
}

const materialSchema = new Schema<StoredMaterials>(
  {
    userId: { type: String, required: true, unique: true },
    materials: { type: Schema.Types.Mixed, required: true },
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
      { $set: { materials } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    return structuredClone(materials);
  }

  async deleteAllForUser(userId: string): Promise<void> {
    await MaterialModel.deleteOne({ userId });
  }
}
