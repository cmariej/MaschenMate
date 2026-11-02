import { Router, type Response } from 'express';
import { activityStore, friendStore, templateStore, userStore } from '../storage.js';
import { requireAuth } from './auth.js';
import type { StoredUser } from '../user-store.js';

const router = Router();

router.get('/', requireAuth, async (_req, res: Response, next) => {
  try {
    const user = res.locals.authUser as StoredUser;
    const friendships = await friendStore.listForUser(user.id);
    const userIds = [
      user.id,
      ...friendships
        .filter((friendship) => friendship.status === 'accepted')
        .map((friendship) => friendship.firstUserId === user.id ? friendship.secondUserId : friendship.firstUserId),
    ];
    const [activities, ownTemplates, friendTemplates] = await Promise.all([
      activityStore.listForUsers(userIds, 10), templateStore.list(user.id), templateStore.listShared(userIds.filter((id) => id !== user.id)),
    ]);
    const sharedTemplates = [
      ...ownTemplates.filter((template) => template.shared).map((template) => ({ ...template, userId: user.id })),
      ...friendTemplates,
    ];
    const users = await Promise.all([...new Set([...activities.map((activity) => activity.userId), ...sharedTemplates.map((template) => template.userId)])]
      .map((userId) => userStore.findById(userId)));
    const usersById = new Map(
      users.filter((item): item is StoredUser => item !== null)
        .map((item) => [item.id, {
          id: item.id,
          name: item.name,
          username: item.username,
          profileImage: item.profileImage,
        }]),
    );
    res.json({
      activities: [...activities.flatMap((activity) => {
        const actor = usersById.get(activity.userId);
        return actor ? [{ ...activity, actor }] : [];
      }), ...sharedTemplates.flatMap((template) => {
        const actor = usersById.get(template.userId);
        return actor ? [{ id: `template:${template.id}`, userId: template.userId, projectId: template.id, projectName: template.name, projectImage: null, templateHasImage: template.hasImage, projectType: template.type, projectCategory: template.category, type: 'template_shared' as const, sectionName: null, createdAt: template.sharedAt ?? template.createdAt, actor }] : [];
      })].sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, 10),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
