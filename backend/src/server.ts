import express, { type ErrorRequestHandler } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { config } from './config.js';
import authRouter from './routes/auth.js';
import projectRouter from './routes/projects.js';
import materialsRouter from './routes/materials.js';
import projectTemplatesRouter from './routes/project-templates.js';
import friendsRouter from './routes/friends.js';
import feedRouter from './routes/feed.js';
import adminRouter from './routes/admin.js';
import { activityStore, friendStore, materialStore, projectStore, templateStore, userStore } from './storage.js';

const app = express();

app.set('trust proxy', config.isProduction ? 1 : false);
app.use(helmet());
app.use(cors({ origin: config.FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: '16mb' }));
app.use(cookieParser(config.COOKIE_SECRET));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Zu viele Anmeldeversuche. Bitte versuche es später erneut.' },
});
const usernameAvailabilityLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Zu viele Benutzernamen-Prüfungen. Bitte versuche es später erneut.' },
});
const friendSearchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Zu viele Benutzersuchen. Bitte versuche es später erneut.' },
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', storage: config.STORAGE_DRIVER });
});
app.use('/api/auth', (req, res, next) => {
  if (
    (req.method === 'POST' && ['/register', '/login'].includes(req.path))
  ) {
    return authLimiter(req, res, next);
  }
  if (req.method === 'GET' && req.path === '/username-availability') {
    return usernameAvailabilityLimiter(req, res, next);
  }
  next();
}, authRouter);
app.use('/api/projects', projectRouter);
app.use('/api/materials', materialsRouter);
app.use('/api/project-templates', projectTemplatesRouter);
app.use('/api/friends/search', friendSearchLimiter);
app.use('/api/friends', friendsRouter);
app.use('/api/feed', feedRouter);
app.use('/api/admin', adminRouter);

app.use((_req, res) => {
  res.status(404).json({ message: 'Endpunkt nicht gefunden.' });
});

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  console.error('Unerwarteter Serverfehler:', error);
  res.status(500).json({ message: 'Ein Serverfehler ist aufgetreten. Bitte versuche es erneut.' });
};
app.use(errorHandler);

try {
  await userStore.initialize();
  await friendStore.initialize();
  await activityStore.initialize();
  await projectStore.initialize();
  await materialStore.initialize();
  await templateStore.initialize();
  app.listen(config.PORT, () => {
    console.log(`MaschenMate API läuft auf http://localhost:${config.PORT}`);
  });
} catch (error) {
  console.error('Lokale Benutzerdatenbank konnte nicht geladen werden:', error);
  process.exitCode = 1;
}
