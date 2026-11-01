import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { friendStore, userStore } from '../storage.js';
import { requireAuth } from './auth.js';
import type { StoredUser } from '../user-store.js';

const router = Router();
const searchSchema = z.string().trim().toLowerCase().min(2).max(20);
const userIdSchema = z.string().uuid();

function publicFriend(user: Pick<StoredUser, 'id' | 'name' | 'username' | 'profileImage'>) {
  return { id: user.id, username: user.username, name: user.name, profileImage: user.profileImage };
}

function currentUser(res: Response): StoredUser {
  return res.locals.authUser as StoredUser;
}

async function usersFromIds(ids: string[]) {
  const users = await Promise.all(ids.map((id) => userStore.findById(id)));
  return users.filter((user): user is StoredUser => user !== null).map(publicFriend);
}

router.use(requireAuth);

router.get('/search', async (req, res, next) => {
  try {
    const parsed = searchSchema.safeParse(req.query['q']);
    if (!parsed.success) {
      res.status(400).json({ message: 'Gib mindestens 2 Zeichen des Benutzernamens ein.' });
      return;
    }
    const user = currentUser(res);
    const results = await userStore.searchByUsername(parsed.data, user.id);
    const friendships = await friendStore.listForUser(user.id);
    const states = new Map(
      friendships.map((friendship) => {
        const otherId = friendship.firstUserId === user.id ? friendship.secondUserId : friendship.firstUserId;
        const state = friendship.status === 'accepted'
          ? 'friend'
          : friendship.requesterId === user.id ? 'sent' : 'received';
        return [otherId, state];
      }),
    );
    res.json({
      users: results.map((result) => ({ ...publicFriend(result), relationship: states.get(result.id) ?? 'none' })),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/', async (_req, res, next) => {
  try {
    const user = currentUser(res);
    const friendships = await friendStore.listForUser(user.id);
    const friends = friendships.filter((item) => item.status === 'accepted');
    const incoming = friendships.filter((item) => item.status === 'pending' && item.requesterId !== user.id);
    const outgoing = friendships.filter((item) => item.status === 'pending' && item.requesterId === user.id);
    res.json({
      friends: await usersFromIds(friends.map((item) => item.firstUserId === user.id ? item.secondUserId : item.firstUserId)),
      incoming: await usersFromIds(incoming.map((item) => item.requesterId)),
      outgoing: await usersFromIds(outgoing.map((item) => item.firstUserId === user.id ? item.secondUserId : item.firstUserId)),
    });
  } catch (error) {
    next(error);
  }
});

router.post('/requests/:userId', async (req, res, next) => {
  try {
    const parsed = userIdSchema.safeParse(req.params['userId']);
    if (!parsed.success) {
      res.status(400).json({ message: 'Ungültiger Benutzer.' });
      return;
    }
    const sender = currentUser(res);
    if (sender.id === parsed.data) {
      res.status(400).json({ message: 'Du kannst dir selbst keine Anfrage senden.' });
      return;
    }
    const recipient = await userStore.findById(parsed.data);
    if (!recipient) {
      res.status(404).json({ message: 'Benutzer nicht gefunden.' });
      return;
    }
    const result = await friendStore.addRequest(sender.id, recipient.id);
    if (result === 'exists') {
      res.status(409).json({ message: 'Es besteht bereits eine Anfrage oder Freundschaft.' });
      return;
    }
    res.status(201).json({ message: 'Freundschaftsanfrage gesendet.' });
  } catch (error) {
    next(error);
  }
});

router.patch('/requests/:userId', async (req, res, next) => {
  try {
    const parsed = userIdSchema.safeParse(req.params['userId']);
    const body = z.object({ accept: z.boolean() }).safeParse(req.body);
    if (!parsed.success || !body.success) {
      res.status(400).json({ message: 'Ungültige Anfrage.' });
      return;
    }
    const changed = await friendStore.respond(currentUser(res).id, parsed.data, body.data.accept);
    if (!changed) {
      res.status(404).json({ message: 'Die Freundschaftsanfrage wurde nicht gefunden.' });
      return;
    }
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.delete('/:userId', async (req: Request, res: Response, next) => {
  try {
    const parsed = userIdSchema.safeParse(req.params['userId']);
    if (!parsed.success) {
      res.status(400).json({ message: 'Ungültiger Benutzer.' });
      return;
    }
    const removed = await friendStore.removeFriend(currentUser(res).id, parsed.data);
    if (!removed) {
      res.status(404).json({ message: 'Freundschaft nicht gefunden.' });
      return;
    }
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
