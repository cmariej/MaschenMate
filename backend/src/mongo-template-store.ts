import { Schema, model } from 'mongoose';
import type { ProjectTemplate, TemplateStore, TemplateSummary } from './template-store.js';

const schema = new Schema<ProjectTemplate>({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true, index: true },
  shared: { type: Boolean, default: false },
  sharingRestricted: { type: Boolean, default: false },
  materialRefsLocal: { type: Boolean, default: false },
  name: { type: String, required: true },
  projectName: { type: String, required: true },
  size: { type: String, default: '' },
  designer: { type: String, default: '' },
  websiteUrl: { type: String, default: '' },
  type: { type: String, required: true },
  category: { type: String, required: true },
  image: { type: String, default: null },
  gauge: { type: Schema.Types.Mixed },
  patternYarn: { type: Schema.Types.Mixed, default: null },
  yarns: { type: Schema.Types.Mixed, default: [] },
  needles: { type: Schema.Types.Mixed, default: [] },
  instructionMode: { type: String, required: true },
  instructionPdf: { type: String, default: null },
  instructionPdfName: { type: String, default: null },
  pdfSections: { type: Schema.Types.Mixed, default: [] },
  sections: { type: Schema.Types.Mixed, default: [] },
  createdAt: { type: String, required: true },
}, { versionKey: false, collection: 'project_templates' });
const TemplateModel = model<ProjectTemplate>('ProjectTemplate', schema);

export class MongoTemplateStore implements TemplateStore {
  async initialize(): Promise<void> { await TemplateModel.init(); }
  async list(userId: string): Promise<TemplateSummary[]> {
    const items = await TemplateModel.aggregate<TemplateSummary>([
      { $match: { userId } },
      { $project: { _id: 0, id: 1, name: 1, size: { $ifNull: ['$size', ''] }, designer: { $ifNull: ['$designer', ''] }, shared: { $ifNull: ['$shared', false] }, type: 1, category: 1, instructionMode: 1, createdAt: 1, hasImage: { $ne: [{ $ifNull: ['$image', null] }, null] } } },
    ]);
    return items;
  }
  async listShared(userIds: string[]): Promise<(TemplateSummary & { userId: string })[]> {
    return TemplateModel.aggregate<TemplateSummary & { userId: string }>([
      { $match: { userId: { $in: userIds }, shared: true } },
      { $project: { _id: 0, id: 1, userId: 1, name: 1, size: { $ifNull: ['$size', ''] }, designer: { $ifNull: ['$designer', ''] }, shared: 1, type: 1, category: 1, instructionMode: 1, createdAt: 1, hasImage: { $ne: [{ $ifNull: ['$image', null] }, null] } } },
    ]);
  }
  async findShared(id: string, userIds: string[]): Promise<ProjectTemplate | null> { const item = await TemplateModel.findOne({ id, userId: { $in: userIds }, shared: true }).select('-_id').lean(); return item ? structuredClone(item) : null; }
  async setShared(userId: string, id: string, shared: boolean): Promise<boolean> { return (await TemplateModel.updateOne({ userId, id }, { $set: { shared } })).matchedCount > 0; }
  async find(userId: string, id: string): Promise<ProjectTemplate | null> { const item = await TemplateModel.findOne({ userId, id }).select('-_id').lean(); return item ? structuredClone(item) : null; }
  async findImage(userId: string, id: string): Promise<string | null> { const item = await TemplateModel.findOne({ userId, id }).select('image -_id').lean(); return item?.image ?? null; }
  async create(template: ProjectTemplate): Promise<ProjectTemplate> { await TemplateModel.create(template); return structuredClone(template); }
  async delete(userId: string, id: string): Promise<boolean> { return (await TemplateModel.deleteOne({ userId, id })).deletedCount > 0; }
  async deleteAllForUser(userId: string): Promise<void> { await TemplateModel.deleteMany({ userId }); }
}
