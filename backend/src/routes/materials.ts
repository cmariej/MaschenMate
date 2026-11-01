import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from './auth.js';
import { materialStore } from '../storage.js';
import type { MaterialLibrary } from '../material-store.js';

const idSchema = z.string().min(1).max(80);
const yarnSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1).max(100),
  brand: z.string().trim().max(100),
  color: z.string().trim().max(100),
  colorCode: z.string().trim().max(40),
  needleSize: z.number().positive().max(100),
  length: z.number().positive().max(1_000_000),
  weight: z.number().positive().max(1_000_000),
  composition: z.array(z.object({
    material: z.string().trim().min(1).max(60),
    percentage: z.number().positive().max(100),
  })).max(20),
}).superRefine((yarn, context) => {
  const total = yarn.composition.reduce((sum, item) => sum + item.percentage, 0);
  if (yarn.composition.length > 0 && Math.round(total * 100) / 100 !== 100) {
    context.addIssue({ code: 'custom', path: ['composition'], message: 'Die Materialanteile müssen zusammen genau 100 % ergeben.' });
  }
  const materials = new Set<string>();
  for (const [index, item] of yarn.composition.entries()) {
    const material = item.material.toLocaleLowerCase();
    if (materials.has(material)) {
      context.addIssue({ code: 'custom', path: ['composition', index, 'material'], message: 'Jedes Material darf nur einmal ausgewählt werden.' });
    }
    materials.add(material);
  }
});
const librarySchema = z.object({
  yarns: z.array(yarnSchema).max(100),
  needles: z.array(z.object({
    id: idSchema,
    type: z.enum(['straight', 'circular', 'double-pointed', 'crochet-hook', 'other']),
    size: z.number().positive().max(100),
  })).max(100),
}).superRefine((materials, context) => {
  for (const [kind, items] of [['Garn', materials.yarns], ['Nadel', materials.needles]] as const) {
    const ids = new Set<string>();
    for (const [index, item] of items.entries()) {
      if (ids.has(item.id)) {
        context.addIssue({ code: 'custom', path: [kind === 'Garn' ? 'yarns' : 'needles', index, 'id'], message: `${kind}-IDs müssen eindeutig sein.` });
      }
      ids.add(item.id);
    }
  }
});

const router = Router();
router.use(requireAuth);

router.get('/', async (_req, res, next) => {
  try {
    const userId = res.locals.authUser.id as string;
    res.json({ materials: await materialStore.get(userId) });
  } catch (error) {
    next(error);
  }
});

router.put('/', async (req, res, next) => {
  const parsed = librarySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Ungültige Materialdaten.' });
    return;
  }
  try {
    const userId = res.locals.authUser.id as string;
    res.json({ materials: await materialStore.save(userId, parsed.data as MaterialLibrary) });
  } catch (error) {
    next(error);
  }
});

export default router;
