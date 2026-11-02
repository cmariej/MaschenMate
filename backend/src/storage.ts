import { config } from './config.js';
import { MongoUserStore } from './mongo-user-store.js';
import { LocalProjectStore, type ProjectStore } from './project-store.js';
import { MongoProjectStore } from './mongo-project-store.js';
import { LocalMaterialStore, type MaterialStore } from './material-store.js';
import { MongoMaterialStore } from './mongo-material-store.js';
import { LocalUserStore, type UserStore } from './user-store.js';
import { LocalFriendStore, type FriendStore } from './friend-store.js';
import { MongoFriendStore } from './mongo-friend-store.js';
import { LocalActivityStore, type ActivityStore } from './activity-store.js';
import { MongoActivityStore } from './mongo-activity-store.js';
import { LocalTemplateStore, type TemplateStore } from './template-store.js';
import { MongoTemplateStore } from './mongo-template-store.js';

function createUserStore(): UserStore {
  if (config.STORAGE_DRIVER === 'file') {
    return new LocalUserStore();
  }
  if (!config.MONGODB_URI) {
    throw new Error('Für STORAGE_DRIVER=mongo muss MONGODB_URI gesetzt sein.');
  }
  return new MongoUserStore(config.MONGODB_URI);
}

export const userStore = createUserStore();

export const friendStore: FriendStore =
  config.STORAGE_DRIVER === 'mongo' ? new MongoFriendStore() : new LocalFriendStore();

export const activityStore: ActivityStore =
  config.STORAGE_DRIVER === 'mongo' ? new MongoActivityStore() : new LocalActivityStore();

export const projectStore: ProjectStore =
  config.STORAGE_DRIVER === 'mongo' ? new MongoProjectStore() : new LocalProjectStore();

export const materialStore: MaterialStore =
  config.STORAGE_DRIVER === 'mongo' ? new MongoMaterialStore() : new LocalMaterialStore();

export const templateStore: TemplateStore =
  config.STORAGE_DRIVER === 'mongo' ? new MongoTemplateStore() : new LocalTemplateStore();
