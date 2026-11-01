import { Schema, model } from 'mongoose';
import type { StoredUser } from '../user-store.js';

const userSchema = new Schema<StoredUser>(
  {
    id: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    username: { type: String, required: true, unique: true, lowercase: true, trim: true, minlength: 5, maxlength: 20 },
    passwordHash: { type: String, required: true, select: false },
    profileImage: { type: String, default: null },
    approved: { type: Boolean, required: true, default: true },
    createdAt: { type: String, required: true },
  },
  {
    versionKey: false,
    collection: 'users',
  },
);

export const UserModel = model<StoredUser>('User', userSchema);
