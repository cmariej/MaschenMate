import { createHash, randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from './auth.js';
import { friendStore, materialStore, projectStore, templateStore, userStore } from '../storage.js';
import { DuplicateProjectNameError, type ProjectInput } from '../project-store.js';
import { MaterialLimitError } from '../material-store.js';
import { projectInputSchema } from './projects.js';
import type { ProjectTemplate } from '../template-store.js';

const router = Router();
router.use(requireAuth);
const createSchema = z.object({ projectId: z.string().min(1).max(80), name: z.string().trim().min(1).max(100) });
const projectNameSchema = z.object({ name: z.string().trim().min(1).max(100) });

async function friendIds(userId: string): Promise<string[]> {
  return (await friendStore.listForUser(userId)).filter((friendship) => friendship.status === 'accepted')
    .map((friendship) => friendship.firstUserId === userId ? friendship.secondUserId : friendship.firstUserId);
}

async function accessibleTemplate(userId: string, id: string): Promise<ProjectTemplate | null> {
  return await templateStore.find(userId, id) ?? await templateStore.findShared(id, await friendIds(userId));
}

function detachTemplateMaterials(template: ProjectTemplate): ProjectTemplate {
  const sections = template.sections ?? [];
  const legacySections = template.instructionMode === 'pdf' ? template.pdfSections ?? [] : [];
  template = {
    ...template,
    instructionMode: 'manual',
    instructionPdf: template.instructionPdf ?? null,
    instructionPdfName: template.instructionPdf ? template.instructionPdfName ?? 'Anleitung.pdf' : null,
    sections: [
      ...sections,
      ...legacySections
        .filter(pdf => !sections.some(section => section.id === pdf.id))
        .map(section => ({ ...section, entries: [] })),
    ],
    pdfSections: [],
  };
  if (template.materialRefsLocal) return template;
  const localId = (kind: 'yarn' | 'needle', sourceId: string) =>
    `template-${createHash('sha256').update(JSON.stringify([template.id, kind, sourceId])).digest('hex').slice(0, 32)}`;
  const yarnIds = new Map(template.yarns.map((yarn) => [yarn.id, localId('yarn', yarn.id)]));
  const needleIds = new Map(template.needles.map((needle) => [needle.id, localId('needle', needle.id)]));
  const yarnId = (id?: string) => id ? yarnIds.get(id) : undefined;
  const needleId = (id?: string | null) => id ? needleIds.get(id) : undefined;
  return {
    ...template,
    materialRefsLocal: true,
    yarns: template.yarns.map((yarn) => ({ ...yarn, id: yarnIds.get(yarn.id)! })),
    needles: template.needles.map((needle) => ({ ...needle, id: needleIds.get(needle.id)! })),
    sections: template.sections.map((section) => ({
      ...section, yarnId: yarnId(section.yarnId), needleId: needleId(section.needleId),
      entries: section.entries.map((entry) => entry.type === 'range'
        ? { ...entry, needleId: needleId(entry.needleId), yarnId: yarnId(entry.yarnId) }
        : { ...entry, needleId: needleId(entry.needleId), yarnId: yarnId(entry.yarnId), repeatRows: entry.repeatRows.map((row) => ({ ...row, needleId: needleId(row.needleId), yarnId: yarnId(row.yarnId) })) }),
    })),
  };
}

router.get('/', async (_req, res, next) => {
  try {
    const userId = res.locals.authUser.id as string;
    const ids = await friendIds(userId);
    const [own, shared, friends] = await Promise.all([templateStore.list(userId), templateStore.listShared(ids), Promise.all(ids.map((id) => userStore.findById(id)))]);
    const usernames = new Map(friends.filter((user) => user !== null).map((user) => [user.id, user.username]));
    res.json({ templates: [
      ...own.map((template) => ({ ...template, shared: !!template.shared, isOwner: true, creatorUsername: res.locals.authUser.username })),
      ...shared.filter((template) => usernames.has(template.userId)).map(({ userId: ownerId, ...template }) => ({ ...template, isOwner: false, creatorUsername: usernames.get(ownerId) })),
    ] });
  } catch (error) { next(error); }
});

router.post('/', async (req, res, next) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: 'Bitte gib einen gültigen Vorlagennamen an.' }); return; }
  try {
    const userId = res.locals.authUser.id as string;
    const project = await projectStore.find(userId, parsed.data.projectId);
    if (!project) { res.status(404).json({ message: 'Projekt nicht gefunden.' }); return; }
    if (project.instructionPdfName && !project.instructionPdf) {
      res.status(400).json({ message: 'Die PDF-Datei fehlt. Bitte lade sie im Projekt erneut hoch, bevor du die Vorlage speicherst.' }); return;
    }
    const template = await templateStore.create(detachTemplateMaterials({
      id: randomUUID(), userId, sharingRestricted: !!project.sharedSource, name: parsed.data.name, projectName: project.name, size: project.size ?? '', designer: project.designer ?? '', websiteUrl: project.websiteUrl ?? '', type: project.type, category: project.category,
      image: project.image, gauge: structuredClone(project.gauge), patternYarn: structuredClone(project.patternYarn),
      yarns: structuredClone(project.yarns), needles: structuredClone(project.needles),
      instructionMode: project.instructionMode, instructionPdf: project.instructionPdf,
      instructionPdfName: project.instructionPdfName,
      pdfSections: structuredClone(project.pdfSections),
      sections: structuredClone(project.sections), createdAt: new Date().toISOString(),
    }));
    const { id, name, size, designer, type, category, instructionMode, createdAt } = template;
    res.status(201).json({ template: { id, name, size, designer, type, category, instructionMode, createdAt, shared: false, isOwner: true, creatorUsername: res.locals.authUser.username, hasImage: Boolean(template.image) } });
  } catch (error) { next(error); }
});

router.get('/:templateId', async (req, res, next) => {
  try {
    const stored = await accessibleTemplate(res.locals.authUser.id, req.params.templateId);
    if (!stored) { res.status(404).json({ message: 'Vorlage nicht gefunden.' }); return; }
    const { instructionPdf, userId, materialRefsLocal, ...result } = detachTemplateMaterials(stored);
    const isOwner = userId === res.locals.authUser.id;
    const owner = isOwner ? res.locals.authUser : await userStore.findById(userId);
    if (!owner) { res.status(404).json({ message: 'Vorlage nicht gefunden.' }); return; }
    res.json({ template: { ...result, shared: !!result.shared, isOwner, creatorUsername: owner.username, hasImage: Boolean(result.image) } });
  } catch (error) { next(error); }
});

router.get('/:templateId/instruction-pdf', async (req, res, next) => {
  try {
    const template = await accessibleTemplate(res.locals.authUser.id, req.params.templateId);
    if (!template?.instructionPdf) { res.status(404).json({ message: 'PDF-Anleitung nicht gefunden.' }); return; }
    const bytes = Buffer.from(template.instructionPdf.slice(template.instructionPdf.indexOf(',') + 1), 'base64');
    res.type('application/pdf').send(bytes);
  } catch (error) { next(error); }
});

router.get('/:templateId/image', async (req, res, next) => {
  try {
    const userId = res.locals.authUser.id as string;
    let image = await templateStore.findImage(userId, req.params.templateId);
    if (!image) image = (await templateStore.findShared(req.params.templateId, await friendIds(userId)))?.image ?? null;
    const match = image?.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
    if (!match) { res.status(404).json({ message: 'Vorlagenbild nicht gefunden.' }); return; }
    res.set('Cache-Control', 'private, no-store');
    res.type(match[1]).send(Buffer.from(match[2], 'base64'));
  } catch (error) { next(error); }
});

router.post('/:templateId/projects', async (req, res, next) => {
  const parsedName = projectNameSchema.safeParse(req.body);
  if (!parsedName.success) { res.status(400).json({ message: 'Bitte gib einen Projektnamen mit höchstens 100 Zeichen ein.' }); return; }
  try {
    const userId = res.locals.authUser.id as string;
    const stored = await accessibleTemplate(userId, req.params.templateId);
    if (!stored) { res.status(404).json({ message: 'Vorlage nicht gefunden.' }); return; }
    const template = detachTemplateMaterials(stored);
    const projectYarnIds = new Map(template.yarns.map((yarn) => [yarn.id, randomUUID()]));
    const projectNeedleIds = new Map(template.needles.map((needle) => [needle.id, randomUUID()]));
    const projectYarnId = (id?: string) => id ? projectYarnIds.get(id) : undefined;
    const projectNeedleId = (id?: string | null) => id ? projectNeedleIds.get(id) : undefined;
    const input = projectInputSchema.safeParse({
      name: parsedName.data.name, size: template.size ?? '', designer: template.designer ?? '', websiteUrl: template.websiteUrl ?? '', sharedSource: template.userId !== userId || !!template.sharingRestricted, type: template.type, category: template.category,
      image: template.image, gauge: template.gauge, patternYarn: template.patternYarn,
      yarns: template.yarns.map((yarn) => ({ ...yarn, id: projectYarnIds.get(yarn.id)! })),
      needles: template.needles.map((needle) => ({ ...needle, id: projectNeedleIds.get(needle.id)! })),
      instructionMode: template.instructionMode,
      instructionPdf: template.instructionPdf, instructionPdfName: template.instructionPdfName,
      sections: template.sections.map((section) => ({
        ...section, id: randomUUID(), yarnId: projectYarnId(section.yarnId), needleId: projectNeedleId(section.needleId),
        entries: section.entries.map((entry) => entry.type === 'range'
          ? { ...entry, id: randomUUID(), needleId: projectNeedleId(entry.needleId), yarnId: projectYarnId(entry.yarnId) }
          : { ...entry, id: randomUUID(), needleId: projectNeedleId(entry.needleId), yarnId: projectYarnId(entry.yarnId), repeatRows: entry.repeatRows.map((row) => ({ ...row, needleId: projectNeedleId(row.needleId), yarnId: projectYarnId(row.yarnId) })) }),
      })),
      pdfSections: template.pdfSections.map((section) => ({ ...section, id: randomUUID() })),
      progress: { startedAt: null, activeSectionId: null, pdfProgress: 0, completedRows: {}, changelog: [] },
    });
    if (!input.success) { res.status(400).json({ message: `Die Vorlage enthält ungültige Angaben: ${input.error.issues[0]?.message ?? 'Bitte prüfe die Vorlage.'}` }); return; }
    const projectInput = input.data as ProjectInput;
    const existingProjects = await projectStore.list(userId);
    if (existingProjects.some((item) => item.name.trim().toLocaleLowerCase() === projectInput.name.toLocaleLowerCase())) throw new DuplicateProjectNameError();
    const project = await projectStore.create(userId, projectInput);
    try {
      const libraryYarns = template.yarns.map(({ id, name, brand, color, colorCode, needleSize, length, weight, composition }) => ({ id, name, brand, color, colorCode, needleSize, length, weight, composition }));
      await materialStore.mergeProjectMaterials(userId, libraryYarns, template.needles);
    } catch (error) {
      try {
        if (!await projectStore.delete(userId, project.id)) throw new Error('Das Projekt konnte nicht zurückgesetzt werden.');
      } catch (rollbackError) {
        console.error('Projekt aus Vorlage konnte nicht zurückgesetzt werden:', error, rollbackError);
        res.status(500).json({ message: 'Das Projekt wurde angelegt, aber die Materialien konnten nicht vollständig übernommen werden. Bitte prüfe das Projekt in der Projektübersicht.' });
        return;
      }
      throw error;
    }
    res.status(201).json({ project: { ...project, instructionPdf: null } });
  } catch (error) {
    if (error instanceof MaterialLimitError) { res.status(400).json({ message: error.message }); return; }
    if (error instanceof DuplicateProjectNameError || (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000)) {
      res.status(409).json({ message: 'Ein Projekt mit diesem Namen existiert bereits. Bitte wähle einen anderen Namen.' }); return;
    }
    next(error);
  }
});

router.put('/:templateId/sharing', async (req, res, next) => {
  const parsed = z.discriminatedUnion('shared', [
    z.object({ shared: z.literal(true), rightsConfirmed: z.literal(true) }),
    z.object({ shared: z.literal(false) }),
  ]).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: 'Bitte bestätige, dass du die Vorlage teilen darfst.' }); return; }
  try {
    if (parsed.data.shared) {
      const template = await templateStore.find(res.locals.authUser.id, req.params.templateId);
      if (!template) { res.status(404).json({ message: 'Vorlage nicht gefunden.' }); return; }
      if (template.sharingRestricted) { res.status(403).json({ message: 'Vorlagen aus geteilten Vorlagen können nicht erneut geteilt werden.' }); return; }
    }
    if (!await templateStore.setShared(res.locals.authUser.id, req.params.templateId, parsed.data.shared)) { res.status(404).json({ message: 'Vorlage nicht gefunden.' }); return; }
    res.json({ shared: parsed.data.shared });
  } catch (error) { next(error); }
});

router.delete('/:templateId', async (req, res, next) => {
  try {
    if (!await templateStore.delete(res.locals.authUser.id, req.params.templateId)) { res.status(404).json({ message: 'Vorlage nicht gefunden.' }); return; }
    res.status(204).end();
  } catch (error) { next(error); }
});

export default router;
