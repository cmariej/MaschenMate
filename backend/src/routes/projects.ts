import express, { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requireAuth } from './auth.js';
import { projectStore } from '../storage.js';
import { activityStore } from '../storage.js';
import { DuplicateProjectNameError, type ProjectInput } from '../project-store.js';
import type { ActivityType } from '../activity-store.js';

const idSchema = z.string().min(1).max(80);
const gaugeSchema = z.object({
  stitches: z.number().positive().max(1000),
  rows: z.number().positive().max(1000),
});
const instructionRowSchema = z.object({
  instructions: z.string().trim().min(1).max(500),
  stitchesPerRow: z.number().int().positive().max(100_000),
  yarnId: idSchema.optional(),
  needleId: idSchema.optional(),
});
const instructionEntrySchema = z.discriminatedUnion('type', [
  z.object({
    id: idSchema,
    type: z.literal('range'),
    fromRow: z.number().int().positive().max(100_000),
    toRow: z.number().int().positive().max(100_000),
    instructions: z.string().trim().min(1).max(500),
    stitchesPerRow: z.number().int().positive().max(100_000),
    yarnId: idSchema.optional(),
    needleId: idSchema.optional(),
  }),
  z.object({
    id: idSchema,
    type: z.literal('repeat'),
    fromRow: z.number().int().positive().max(100_000),
    toRow: z.number().int().positive().max(100_000),
    repeatRows: z.array(instructionRowSchema).min(1).max(100),
    yarnId: idSchema.optional(),
    needleId: idSchema.optional(),
  }),
]);
const projectYarnSchema = z.object({
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
  gauge: gaugeSchema,
  needUnknown: z.boolean().default(true),
  plannedSkeins: z.number().int().positive().max(500).nullable().default(null),
  swatchWeightKnown: z.boolean().default(false),
  swatchWeightGrams: z.number().positive().max(1000).nullable().default(null),
}).superRefine((yarn, context) => {
  if (!yarn.needUnknown && yarn.plannedSkeins === null) {
    context.addIssue({ code: 'custom', path: ['plannedSkeins'], message: 'Bitte gib den bekannten Knäuelbedarf an oder markiere ihn als unbekannt.' });
  }
  if (yarn.swatchWeightKnown && yarn.swatchWeightGrams === null) {
    context.addIssue({ code: 'custom', path: ['swatchWeightGrams'], message: 'Bitte gib den Verbrauch deiner Maschenprobe an oder wähle „Nein“.' });
  }
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
export const projectInputSchema = z.object({
  type: z.enum(['crochet', 'knitting']),
  category: z.enum(['sweater', 'hat', 'scarf', 'socks', 'blanket', 'bag', 'accessory', 'other']),
  name: z.string().trim().min(1).max(100),
  size: z.string().trim().max(50).default(''),
  designer: z.string().trim().max(100).default(''),
  websiteUrl: z.string().trim().max(2048).refine((value) => {
    if (!value) return true;
    try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
  }, 'Bitte gib eine gültige Webseite mit http:// oder https:// ein.').default(''),
  sharedSource: z.boolean().default(false),
  image: z
    .string()
    .max(7_000_000)
    .regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/)
    .refine((image) => Buffer.from(image.slice(image.indexOf(',') + 1), 'base64').length <= 5 * 1024 * 1024)
    .nullable(),
  gauge: z.object({
    pattern: gaugeSchema,
    personal: gaugeSchema,
  }).optional(),
  patternYarn: z.object({
    amount: z.number().positive().max(1_000_000),
    unit: z.enum(['g', 'm']),
  }).nullable(),
  yarns: z.array(projectYarnSchema).max(30),
  needles: z.array(z.object({
    id: idSchema,
    type: z.enum(['straight', 'circular', 'double-pointed', 'crochet-hook', 'other']),
    size: z.number().positive().max(100),
  })).max(30),
  instructionMode: z.enum(['manual', 'pdf']).default('manual'),
  instructionPdf: z.string()
    .max(7_000_000)
    .regex(/^data:application\/pdf;base64,[A-Za-z0-9+/]+={0,2}$/)
    .refine((pdf) => {
      const bytes = Buffer.from(pdf.slice(pdf.indexOf(',') + 1), 'base64');
      return bytes.length <= 5 * 1024 * 1024 && bytes.subarray(0, 1024).includes(Buffer.from('%PDF-'));
    })
    .nullable()
    .default(null),
  instructionPdfName: z.string().trim().min(1).max(255).nullable().default(null),
  pdfSections: z.array(z.object({
    id: idSchema,
    name: z.string().trim().min(1).max(100),
    rowCount: z.number().int().positive().max(10_000),
  })).max(50).default([]),
  sections: z.array(z.object({
    id: idSchema,
    name: z.string().trim().min(1).max(100),
    entries: z.array(instructionEntrySchema).max(300),
    notes: z.string().trim().max(5000).optional(),
    rowCount: z.number().int().positive().max(10000).nullish(),
    needleId: idSchema.nullable().optional(),
    yarnId: idSchema.optional(),
  })).max(50),
  progress: z.object({
    startedAt: z.string().datetime().nullable(),
    cancelledAt: z.string().datetime().nullable().optional(),
    activeSectionId: idSchema.nullable(),
    pdfProgress: z.number().int().min(0).max(100).refine((value) => value % 10 === 0, 'Der PDF-Fortschritt muss in 10-%-Schritten angegeben werden.').default(0),
    completedRows: z.record(z.string(), z.number().int().nonnegative().max(100_000)),
    changelog: z.array(z.object({
      id: idSchema,
      type: z.enum(['started', 'section_changed', 'row_completed', 'row_reopened']),
      timestamp: z.string().datetime(),
      sectionId: idSchema.optional(),
      rowNumber: z.number().int().positive().optional(),
    })).max(500),
  }),
}).superRefine((project, context) => {
  const sectionIds = new Set<string>();
  const yarnIds = new Set(project.yarns.map((yarn) => yarn.id));
  const needleIds = new Set(project.needles.map((needle) => needle.id));
  if (yarnIds.size !== project.yarns.length) {
    context.addIssue({ code: 'custom', path: ['yarns'], message: 'Garn-IDs müssen eindeutig sein.' });
  }
  if (needleIds.size !== project.needles.length) {
    context.addIssue({ code: 'custom', path: ['needles'], message: 'Nadel-IDs müssen eindeutig sein.' });
  }
  for (const [sectionIndex, section] of project.sections.entries()) {
    if (sectionIds.has(section.id)) {
      context.addIssue({ code: 'custom', path: ['sections', sectionIndex, 'id'], message: 'Abschnitts-IDs müssen eindeutig sein.' });
    }
    sectionIds.add(section.id);
    if (section.needleId && !needleIds.has(section.needleId)) {
      context.addIssue({ code: 'custom', path: ['sections', sectionIndex, 'needleId'], message: 'Die Abschnittsnadel muss aus den ausgewählten Nadeln stammen.' });
    }
    if (section.yarnId && !yarnIds.has(section.yarnId)) context.addIssue({ code: 'custom', path: ['sections', sectionIndex, 'yarnId'], message: 'Unbekanntes Abschnittsgarn.' });
    section.entries.sort((left, right) => left.fromRow - right.fromRow);
    let expectedRow = 1;
    for (const [entryIndex, entry] of section.entries.entries()) {
      if (entry.toRow < entry.fromRow) {
        context.addIssue({
          code: 'custom',
          path: ['sections', sectionIndex, 'entries', entryIndex, 'toRow'],
          message: 'Die Endreihe muss gleich oder größer als die Startreihe sein.',
        });
      }
      if (entry.needleId && !needleIds.has(entry.needleId)) context.addIssue({ code: 'custom', path: ['sections', sectionIndex, 'entries', entryIndex, 'needleId'], message: 'Unbekannte Anweisungsnadel.' });
      if (entry.yarnId && !yarnIds.has(entry.yarnId)) {
        context.addIssue({ code: 'custom', path: ['sections', sectionIndex, 'entries', entryIndex, 'yarnId'], message: 'Das Reihengarn muss aus den ausgewählten Garnen stammen.' });
      }
      if (entry.type === 'repeat') {
        for (const [rowIndex, row] of entry.repeatRows.entries()) {
          if (row.needleId && !needleIds.has(row.needleId)) context.addIssue({ code: 'custom', path: ['sections', sectionIndex, 'entries', entryIndex, 'repeatRows', rowIndex, 'needleId'], message: 'Unbekannte Reihennadel.' });
          if (row.yarnId && !yarnIds.has(row.yarnId)) {
            context.addIssue({ code: 'custom', path: ['sections', sectionIndex, 'entries', entryIndex, 'repeatRows', rowIndex, 'yarnId'], message: 'Das Reihengarn muss aus den ausgewählten Garnen stammen.' });
          }
        }
      }
      if (entry.fromRow !== expectedRow) {
        context.addIssue({
          code: 'custom',
          path: ['sections', sectionIndex, 'entries', entryIndex, 'fromRow'],
          message: 'Reihenbereiche müssen lückenlos und ohne Überschneidungen ab Reihe 1 eingetragen werden.',
        });
      }
      expectedRow = entry.toRow + 1;
      if (expectedRow > 10_001) {
        context.addIssue({
          code: 'custom',
          path: ['sections', sectionIndex, 'entries', entryIndex, 'toRow'],
          message: 'Ein Abschnitt darf höchstens 10.000 Reihen enthalten.',
        });
        break;
      }
    }
  }
  const activeIds = project.instructionMode === 'pdf'
    ? new Set(project.pdfSections.map((section) => section.id))
    : sectionIds;
  if (project.progress.activeSectionId && !activeIds.has(project.progress.activeSectionId)) {
    context.addIssue({ code: 'custom', path: ['progress', 'activeSectionId'], message: 'Der aktive Abschnitt existiert nicht.' });
  }
  const pdfSectionIds = new Set<string>();
  for (const [index, section] of project.pdfSections.entries()) {
    if (pdfSectionIds.has(section.id)) {
      context.addIssue({ code: 'custom', path: ['pdfSections', index, 'id'], message: 'PDF-Abschnitts-IDs mÃ¼ssen eindeutig sein.' });
    }
    pdfSectionIds.add(section.id);
  }
});

const router = Router();
router.use(requireAuth);

function isSectionComplete(project: ProjectInput, sectionId: string): boolean {
  const section = project.sections.find((item) => item.id === sectionId);
  if (!section) return false;
  const lastRow = section.entries.reduce((last, entry) => Math.max(last, entry.toRow), section.entries.length ? 0 : section.rowCount ?? 0);
  if (!lastRow) return false;
  return (project.progress.completedRows[sectionId] ?? 0) >= lastRow;
}

function isProjectComplete(project: ProjectInput): boolean {
  if (!project.sections.length) return (project.progress.pdfProgress ?? 0) >= 100;
  return project.sections.length > 0 && project.sections.every((section) => isSectionComplete(project, section.id));
}

function completionEventKey(project: ProjectInput, projectId: string, suffix: string, sectionId?: string): string {
  const completedRows = project.progress.changelog.filter((entry) =>
    entry.type === 'row_completed' && (!sectionId || entry.sectionId === sectionId),
  );
  const latestCompletion = completedRows.reduce(
    (latest, entry) => entry.timestamp > latest ? entry.timestamp : latest,
    '',
  );
  return `${projectId}:${suffix}:${latestCompletion || Date.now()}`;
}

async function recordActivity(
  userId: string,
  project: { id: string; name: string; image: string | null; type: ProjectInput['type']; category: ProjectInput['category'] },
  type: ActivityType,
  eventKey: string,
  sectionName: string | null = null,
): Promise<void> {
  await activityStore.add({
    eventKey,
    userId,
    projectId: project.id,
    projectName: project.name,
    projectImage: project.image,
    projectType: project.type,
    projectCategory: project.category,
    type,
    sectionName,
  });
}

router.get('/', async (_req, res, next) => {
  try {
    const userId = res.locals.authUser.id as string;
    const projects = await projectStore.list(userId);
    res.json({ projects: projects.map((project) => ({ ...project, instructionPdf: null })) });
  } catch (error) {
    next(error);
  }
});

router.get('/:projectId/instruction-pdf', async (req, res, next) => {
  try {
    const userId = res.locals.authUser.id as string;
    const project = await projectStore.find(userId, req.params.projectId);
    if (!project?.instructionPdf) {
      res.status(404).json({ message: 'PDF-Anleitung nicht gefunden.' });
      return;
    }

    const pdf = Buffer.from(project.instructionPdf.slice(project.instructionPdf.indexOf(',') + 1), 'base64');
    const filename = encodeURIComponent(project.instructionPdfName ?? 'Anleitung.pdf');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${filename}`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(pdf);
  } catch (error) {
    next(error);
  }
});

router.put('/:projectId/instruction-pdf', express.raw({ type: 'application/pdf', limit: '5mb' }), async (req, res, next) => {
  try {
    const userId = res.locals.authUser.id as string;
    const project = await projectStore.find(userId, req.params.projectId);
    if (!project) {
      res.status(404).json({ message: 'Projekt nicht gefunden.' });
      return;
    }
    if (!Buffer.isBuffer(req.body) || !req.body.subarray(0, 1024).includes(Buffer.from('%PDF-'))) {
      res.status(400).json({ message: 'Die ausgewählte Datei ist keine gültige PDF-Datei.' });
      return;
    }
    const name = z.string().trim().min(1).max(255).safeParse(req.query.name);
    if (!name.success) {
      res.status(400).json({ message: 'Der Dateiname der PDF-Anleitung ist ungültig.' });
      return;
    }

    const updated = await projectStore.update(userId, project.id, {
      ...project,
      instructionPdf: `data:application/pdf;base64,${req.body.toString('base64')}`,
      instructionPdfName: name.data,
    });
    if (!updated) {
      res.status(404).json({ message: 'Projekt nicht gefunden.' });
      return;
    }
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  const parsed = projectInputSchema.safeParse(req.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    res.status(400).json({ message: issue?.message ?? 'Ungültige Projektdaten.', field: issue?.path.join('.') ?? null });
    return;
  }
  try {
    const userId = res.locals.authUser.id as string;
    const input = parsed.data as ProjectInput;
    if (Boolean(input.instructionPdf) !== Boolean(input.instructionPdfName)) {
      res.status(400).json({ message: 'Bitte wähle eine gültige PDF-Datei mit Dateinamen aus.' });
      return;
    }
    const project = await projectStore.create(userId, input);
    if (project.progress.startedAt) {
      await recordActivity(userId, project, 'started', `${project.id}:started`);
    }
    res.status(201).json({ project: { ...project, instructionPdf: null } });
  } catch (error) {
    if (error instanceof DuplicateProjectNameError) {
      res.status(409).json({ message: error.message });
      return;
    }
    next(error);
  }
});

router.put('/:projectId', async (req, res, next) => {
  try {
    const userId = res.locals.authUser.id as string;
    const previous = await projectStore.find(userId, req.params.projectId);
    if (!previous) {
      res.status(404).json({ message: 'Projekt nicht gefunden.' });
      return;
    }

    // Keep stored progress when older clients omit progress fields.
    const submittedProgress = req.body?.progress;
    const body = {
      ...req.body,
      size: req.body?.size ?? previous.size ?? '',
      designer: req.body?.designer ?? previous.designer ?? '',
      websiteUrl: req.body?.websiteUrl ?? previous.websiteUrl ?? '',
      sharedSource: previous.sharedSource ?? false,
      image: req.body?.image !== undefined ? req.body.image : previous.image,
      pdfSections: req.body?.pdfSections ?? previous.pdfSections ?? [],
      progress: {
        ...previous.progress,
        ...(submittedProgress && typeof submittedProgress === 'object' ? submittedProgress : {}),
        startedAt: submittedProgress?.startedAt !== undefined ? submittedProgress.startedAt : previous.progress.startedAt,
        cancelledAt: submittedProgress?.cancelledAt ?? previous.progress.cancelledAt ?? null,
        activeSectionId: submittedProgress?.activeSectionId !== undefined
          ? submittedProgress.activeSectionId
          : previous.progress.activeSectionId,
        completedRows: submittedProgress?.completedRows ?? previous.progress.completedRows ?? {},
        changelog: submittedProgress?.changelog ?? previous.progress.changelog ?? [],
      },
    };
    const parsed = projectInputSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      res.status(400).json({ message: issue?.message ?? 'Ungültige Projektdaten.', field: issue?.path.join('.') ?? null });
      return;
    }

    const input = parsed.data as ProjectInput;
    if (input.instructionPdfName && !input.instructionPdf) input.instructionPdf = previous.instructionPdf;
    if (!input.instructionPdfName) input.instructionPdf = null;
    if (input.instructionPdfName && !input.instructionPdf) {
      res.status(400).json({ message: 'Bitte wähle eine gültige PDF-Datei aus.' });
      return;
    }
    input.progress.cancelledAt = previous.progress.cancelledAt ?? null;
    const project = await projectStore.update(userId, req.params.projectId, input);
    if (!project) {
      res.status(404).json({ message: 'Projekt nicht gefunden.' });
      return;
    }
    if (!previous.progress.startedAt && project.progress.startedAt) {
      await recordActivity(userId, project, 'started', `${project.id}:started`);
    }
    const progressSections = project.sections;
    for (const section of progressSections) {
      if (!isSectionComplete(previous, section.id) && isSectionComplete(project, section.id)) {
        await recordActivity(
          userId,
          project,
          'section_completed',
          completionEventKey(project, project.id, `section:${section.id}`, section.id),
          section.name,
        );
      }
    }
    if (!isProjectComplete(previous) && isProjectComplete(project)) {
      await recordActivity(userId, project, 'finished', completionEventKey(project, project.id, 'finished'));
    }
    res.json({ project: { ...project, image: req.body?.image !== undefined ? project.image : null, instructionPdf: null } });
  } catch (error) {
    if (error instanceof DuplicateProjectNameError) {
      res.status(409).json({ message: error.message });
      return;
    }
    next(error);
  }
});

router.post('/:projectId/cancel', async (req, res, next) => {
  try {
    const userId = res.locals.authUser.id as string;
    const project = await projectStore.find(userId, req.params.projectId);
    if (!project) {
      res.status(404).json({ message: 'Projekt nicht gefunden.' });
      return;
    }
    if (!project.progress.startedAt || project.progress.cancelledAt || isProjectComplete(project)) {
      res.status(409).json({ message: 'Dieses Projekt kann nicht mehr abgebrochen werden.' });
      return;
    }
    const cancelledAt = new Date().toISOString();
    const updated = await projectStore.update(userId, project.id, {
      ...project,
      progress: { ...project.progress, cancelledAt },
    });
    if (!updated) {
      res.status(404).json({ message: 'Projekt nicht gefunden.' });
      return;
    }
    await recordActivity(userId, updated, 'cancelled', `${updated.id}:cancelled:${randomUUID()}`);
    res.json({ project: updated });
  } catch (error) {
    next(error);
  }
});

router.post('/:projectId/restart', async (req, res, next) => {
  try {
    const userId = res.locals.authUser.id as string;
    const project = await projectStore.find(userId, req.params.projectId);
    if (!project) { res.status(404).json({ message: 'Projekt nicht gefunden.' }); return; }
    if (!project.progress.cancelledAt) { res.status(409).json({ message: 'Nur abgebrochene Projekte können neu gestartet werden.' }); return; }
    const timestamp = new Date().toISOString();
    const firstSectionId = project.sections[0]?.id ?? null;
    const updated = await projectStore.update(userId, project.id, {
      ...project,
      progress: {
        startedAt: timestamp, cancelledAt: null, activeSectionId: firstSectionId,
        pdfProgress: 0, completedRows: {},
        changelog: [{ id: randomUUID(), type: 'started', timestamp, ...(firstSectionId ? { sectionId: firstSectionId } : {}) }],
      },
    });
    if (!updated) { res.status(404).json({ message: 'Projekt nicht gefunden.' }); return; }
    await recordActivity(userId, updated, 'started', `${updated.id}:restart:${randomUUID()}`);
    res.json({ project: { ...updated, instructionPdf: null } });
  } catch (error) { next(error); }
});

router.delete('/:projectId', async (req, res, next) => {
  try {
    const userId = res.locals.authUser.id as string;
    const deleted = await projectStore.delete(userId, req.params.projectId);
    if (!deleted) {
      res.status(404).json({ message: 'Projekt nicht gefunden.' });
      return;
    }
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
