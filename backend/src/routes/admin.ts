import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { activityStore, friendStore, materialStore, projectStore, templateStore, userStore } from '../storage.js';
import { requireAuth } from './auth.js';
import type { StoredUser } from '../user-store.js';

const router = Router();
const decisionSchema = z.object({ accept: z.boolean() });
const userIdSchema = z.string().uuid();

function requireAdmin(req: Request, res: Response, next: (error?: unknown) => void): void {
  const user = res.locals.authUser as StoredUser;
  if (user.username.toLowerCase() !== 'clara') {
    res.status(403).json({ message: 'Nur Clara darf Registrierungen verwalten.' });
    return;
  }
  next();
}

router.use(requireAuth, requireAdmin);

router.get('/registrations', async (_req, res, next) => {
  try {
    const registrations = await userStore.listPendingRegistrations();
    res.json({
      registrations: registrations.map((user) => ({
        id: user.id,
        name: user.name,
        username: user.username,
        profileImage: user.profileImage,
        createdAt: user.createdAt,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/registrations/count', async (_req, res, next) => {
  try {
    res.json({ count: await userStore.countPendingRegistrations() });
  } catch (error) {
    next(error);
  }
});

router.patch('/registrations/:userId', async (req, res, next) => {
  const userId = userIdSchema.safeParse(req.params['userId']);
  const decision = decisionSchema.safeParse(req.body);
  if (!userId.success || !decision.success) {
    res.status(400).json({ message: 'Ungültige Registrierungsentscheidung.' });
    return;
  }

  try {
    if (decision.data.accept) {
      const approved = await userStore.setApproved(userId.data, true);
      if (!approved) {
        res.status(404).json({ message: 'Die Registrierungsanfrage wurde nicht gefunden.' });
        return;
      }
    } else {
      const pending = (await userStore.listPendingRegistrations()).some((user) => user.id === userId.data);
      if (!pending) {
        res.status(404).json({ message: 'Die Registrierungsanfrage wurde nicht gefunden.' });
        return;
      }
      await userStore.delete(userId.data);
      await projectStore.deleteAllForUser(userId.data);
      await materialStore.deleteAllForUser(userId.data);
      await templateStore.deleteAllForUser(userId.data);
      await friendStore.deleteAllForUser(userId.data);
      await activityStore.deleteAllForUser(userId.data);
    }
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
