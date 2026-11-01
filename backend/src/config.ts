import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  STORAGE_DRIVER: z.enum(['file', 'mongo']).default('file'),
  MONGODB_URI: z.string().min(1).optional(),
  JWT_SECRET: z.string().min(32).optional(),
  COOKIE_SECRET: z.string().min(32).optional(),
  FRONTEND_URL: z.url().default('http://localhost:4200'),
});

const parsed = configSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Ungültige Server-Konfiguration:', parsed.error.flatten().fieldErrors);
  throw new Error('Bitte prüfe die Umgebungsvariablen in backend/.env.');
}

if (parsed.data.NODE_ENV === 'production' && (!parsed.data.JWT_SECRET || !parsed.data.COOKIE_SECRET)) {
  throw new Error('In Produktion müssen JWT_SECRET und COOKIE_SECRET gesetzt sein.');
}

if (parsed.data.STORAGE_DRIVER === 'mongo' && !parsed.data.MONGODB_URI) {
  throw new Error('Für STORAGE_DRIVER=mongo muss MONGODB_URI gesetzt sein.');
}

export const config = {
  ...parsed.data,
  JWT_SECRET: parsed.data.JWT_SECRET ?? randomBytes(32).toString('hex'),
  COOKIE_SECRET: parsed.data.COOKIE_SECRET ?? randomBytes(32).toString('hex'),
  isProduction: parsed.data.NODE_ENV === 'production',
};
