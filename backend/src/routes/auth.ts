import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { config } from '../config.js';
import { activityStore, friendStore, materialStore, projectStore, userStore } from '../storage.js';
import { DuplicateUsernameError, type StoredUser } from '../user-store.js';

const router = Router();
const cookieName = 'maschenmate_token';
const cookieOptions = {
  httpOnly: true,
  secure: config.isProduction,
  sameSite: 'lax' as const,
  path: '/api',
};
const legacyCookieOptions = { ...cookieOptions, path: '/api/auth' };
const passwordSchema = z
  .string()
  .min(8, 'Das Passwort muss mindestens 8 Zeichen lang sein.')
  .regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\p{P}\p{S}]).+$/u,
    'Das Passwort muss Groß- und Kleinbuchstaben, eine Zahl und ein Sonderzeichen enthalten.',
  )
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Das Passwort ist zu lang.');
const loginPasswordSchema = z
  .string()
  .min(8, 'Das Passwort muss mindestens 8 Zeichen lang sein.')
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Das Passwort ist zu lang.');
const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(5, 'Der Benutzername muss mindestens 5 Zeichen lang sein.')
  .max(20, 'Der Benutzername darf höchstens 20 Zeichen lang sein.')
  .regex(
    /^[a-z0-9._-]+$/,
    'Der Benutzername darf nur Buchstaben, Zahlen, Punkt, Bindestrich und Unterstrich enthalten.',
  );
const loginUsernameSchema = z.string().trim().toLowerCase().min(1).max(20);
const profileImageSchema = z
  .string()
  .max(7_000_000)
  .regex(
    /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/,
    'Bitte lade ein gültiges JPG-, PNG- oder WebP-Bild hoch.',
  )
  .refine(
    (image) => Buffer.from(image.slice(image.indexOf(',') + 1), 'base64').length <= 5 * 1024 * 1024,
    'Das Bild darf höchstens 5 MB groß sein.',
  );
const registerSchema = z.object({
  name: z.string().trim().min(1, 'Bitte gib deinen Namen ein.').max(80),
  username: usernameSchema,
  password: passwordSchema,
  profileImage: profileImageSchema.nullable().optional(),
});
const loginSchema = z.object({
  username: loginUsernameSchema,
  password: loginPasswordSchema,
});
const profileSchema = z
  .object({
    username: usernameSchema.optional(),
    profileImage: profileImageSchema.nullable().optional(),
  })
  .refine(
    (profile) => profile.username !== undefined || profile.profileImage !== undefined,
    'Es wurden keine Profiländerungen angegeben.',
  );

function publicUser(user: StoredUser) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    profileImage: user.profileImage,
  };
}

async function authenticatedUser(req: Request): Promise<StoredUser | null> {
  const token = req.cookies[cookieName] as string | undefined;
  if (!token) {
    return null;
  }

  try {
    const payload = jwt.verify(token, config.JWT_SECRET, {
      audience: 'maschenmate-web',
      issuer: 'maschenmate-api',
    });
    if (typeof payload === 'string' || typeof payload.sub !== 'string') {
      return null;
    }
    const user = await userStore.findById(payload.sub);
    return user?.approved ? user : null;
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      return null;
    }
    throw error;
  }
}

export async function requireAuth(req: Request, res: Response, next: (error?: unknown) => void) {
  try {
    const user = await authenticatedUser(req);
    if (!user) {
      res.status(401).json({ message: 'Bitte melde dich erneut an.' });
      return;
    }

    res.locals.authUser = user;
    next();
  } catch (error) {
    next(error);
  }
}

function issueToken(userId: string): string {
  return jwt.sign({ sub: userId }, config.JWT_SECRET, {
    audience: 'maschenmate-web',
    expiresIn: '7d',
    issuer: 'maschenmate-api',
  });
}

function setAuthCookie(res: Response, userId: string): void {
  res.cookie(cookieName, issueToken(userId), {
    ...cookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function clearAuthCookie(res: Response): void {
  res.clearCookie(cookieName, cookieOptions);
  res.clearCookie(cookieName, legacyCookieOptions);
}

router.post('/register', async (req, res, next) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Ungültige Eingaben.' });
    return;
  }

  try {
    const { name, username, password, profileImage } = parsed.data;
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await userStore.create({
      name,
      username,
      passwordHash,
      profileImage: profileImage ?? null,
      approved: username === 'clara',
    });
    if (user.approved) {
      setAuthCookie(res, user.id);
      res.status(201).json({ user: publicUser(user) });
      return;
    }
    res.status(202).json({
      pendingApproval: true,
      message: 'Deine Registrierung wurde übermittelt. Du kannst dich anmelden, sobald Clara dein Konto freigeschaltet hat.',
    });
  } catch (error) {
    if (error instanceof DuplicateUsernameError) {
      res.status(409).json({ message: error.message });
      return;
    }
    next(error);
  }
});

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Ungültige Eingaben.' });
    return;
  }

  const user = await userStore.findByUsername(parsed.data.username);
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    res.status(401).json({ message: 'Benutzername oder Passwort ist nicht korrekt.' });
    return;
  }
  if (!user.approved) {
    res.status(403).json({ message: 'Dein Konto wartet noch auf die Freigabe durch Clara.' });
    return;
  }

  setAuthCookie(res, user.id);
  res.json({ user: publicUser(user) });
});

router.get('/me', async (req, res) => {
  const token = req.cookies[cookieName] as string | undefined;
  if (!token) {
    res.status(401).json({ message: 'Nicht angemeldet.' });
    return;
  }

  let payload: string | JwtPayload;
  try {
    payload = jwt.verify(token, config.JWT_SECRET, {
      audience: 'maschenmate-web',
      issuer: 'maschenmate-api',
    });
  } catch {
    clearAuthCookie(res);
    res.status(401).json({ message: 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.' });
    return;
  }

  if (typeof payload === 'string' || typeof payload.sub !== 'string') {
    clearAuthCookie(res);
    res.status(401).json({ message: 'Ungültige Sitzung.' });
    return;
  }

  const user = await userStore.findById(payload.sub);
  if (!user) {
    clearAuthCookie(res);
    res.status(401).json({ message: 'Konto nicht gefunden.' });
    return;
  }

  setAuthCookie(res, user.id);
  res.clearCookie(cookieName, legacyCookieOptions);
  res.json({ user: publicUser(user) });
});

router.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.status(204).end();
});

router.get('/username-availability', async (req, res, next) => {
  const parsed = usernameSchema.safeParse(req.query.username);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Ungültiger Benutzername.' });
    return;
  }

  try {
    const currentUser = await authenticatedUser(req);
    const available = await userStore.isUsernameAvailable(parsed.data, currentUser?.id);
    res.json({ available });
  } catch (error) {
    next(error);
  }
});

router.use(requireAuth);

router.patch('/profile', async (req, res, next) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Ungültige Profileinstellungen.' });
    return;
  }

  try {
    const currentUser = res.locals.authUser as StoredUser;
    if (parsed.data.username === 'clara' && currentUser.username !== 'clara') {
      res.status(403).json({ message: 'Der Administrator-Benutzername ist reserviert.' });
      return;
    }
    const user = await userStore.updateProfile(currentUser.id, parsed.data);
    if (!user) {
      res.status(401).json({ message: 'Konto nicht gefunden.' });
      return;
    }
    res.json({ user: publicUser(user) });
  } catch (error) {
    if (error instanceof DuplicateUsernameError) {
      res.status(409).json({ message: error.message });
      return;
    }
    next(error);
  }
});

router.delete('/account', async (req, res, next) => {
  try {
    const currentUser = res.locals.authUser as StoredUser;
    await userStore.delete(currentUser.id);
    await friendStore.deleteAllForUser(currentUser.id);
    await activityStore.deleteAllForUser(currentUser.id);
    await projectStore.deleteAllForUser(currentUser.id);
    await materialStore.deleteAllForUser(currentUser.id);
    clearAuthCookie(res);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
