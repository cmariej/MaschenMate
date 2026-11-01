import { Router, type Response } from 'express';
import { activityStore, friendStore, userStore } from '../storage.js';
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
    const activities = await activityStore.listForUsers(userIds, 10);
    const users = await Promise.all([...new Set(activities.map((activity) => activity.userId))]
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
      activities: activities.flatMap((activity) => {
        const actor = usersById.get(activity.userId);
        return actor ? [{ ...activity, actor }] : [];
      }),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
