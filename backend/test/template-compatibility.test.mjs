import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import { config } from '../dist/config.js';
import { LocalProjectStore } from '../dist/project-store.js';
import { LocalTemplateStore } from '../dist/template-store.js';
import { projectStore, templateStore, userStore, materialStore, friendStore } from '../dist/storage.js';
import templateRouter from '../dist/routes/project-templates.js';
import { projectInputSchema } from '../dist/routes/projects.js';

const pdf = `data:application/pdf;base64,${Buffer.from('%PDF-1.4\n%%EOF').toString('base64')}`;
const section = () => ({ id: 'section', name: 'Pattern', yarnId: 'yarn', needleId: 'needle', notes: 'Keep loose.\nCheck length.', entries: [
  { id: 'range', type: 'range', fromRow: 1, toRow: 2, instructions: 'Knit', stitchesPerRow: 20, yarnId: 'yarn', needleId: 'needle' },
  { id: 'repeat', type: 'repeat', fromRow: 3, toRow: 6, yarnId: 'yarn', needleId: 'needle', repeatRows: [{ instructions: 'Purl', stitchesPerRow: 20, yarnId: 'yarn', needleId: 'needle' }] },
] });
const input = () => ({
  name: 'Source', size: '', type: 'knitting', category: 'other', image: null, patternYarn: null,
  yarns: [{ id: 'yarn', name: 'Wool', brand: '', color: '', colorCode: '', needleSize: 4, length: 100, weight: 50, composition: [], gauge: { stitches: 20, rows: 30 }, needUnknown: true, plannedSkeins: null, swatchWeightKnown: false, swatchWeightGrams: null }],
  needles: [{ id: 'needle', type: 'circular', size: 4 }], instructionMode: 'manual',
  instructionPdf: pdf, instructionPdfName: 'Pattern.pdf', pdfSections: [],
  sections: [section(), { id: 'empty', name: 'Empty', entries: [] }, { id: 'count', name: 'Count only', entries: [], notes: 'From PDF', rowCount: 20 }],
  progress: { startedAt: new Date().toISOString(), activeSectionId: 'section', completedRows: { section: 2 }, changelog: [], pdfProgress: 0 },
});

test('material selections are optional and invalid references are rejected at every level', () => {
  const optional = input();
  delete optional.sections[0].yarnId;
  delete optional.sections[0].needleId;
  for (const entry of optional.sections[0].entries) {
    delete entry.yarnId;
    delete entry.needleId;
    if (entry.type === 'repeat') for (const row of entry.repeatRows) {
      delete row.yarnId;
      delete row.needleId;
    }
  }
  optional.yarns = [];
  optional.needles = [];
  assert.equal(projectInputSchema.safeParse(optional).success, true);
  for (const field of ['yarnId', 'needleId']) {
    for (const level of ['section', 'entry', 'repeatRow']) {
      const invalid = input();
      const target = level === 'section' ? invalid.sections[0]
        : level === 'entry' ? invalid.sections[0].entries[0] : invalid.sections[0].entries[1].repeatRows[0];
      target[field] = 'missing';
      assert.equal(projectInputSchema.safeParse(invalid).success, false, `${level}.${field}`);
    }
  }
});

test('templates round-trip mixed instructions, legacy formats and shared copies', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'maschenmate-template-compat-'));
  const projects = new LocalProjectStore(join(directory, 'projects.json'));
  const templates = new LocalTemplateStore(join(directory, 'templates.json'));
  const restore = [];
  const replace = (target, name, value) => { const previous = target[name]; restore.push(() => { target[name] = previous; }); target[name] = value; };
  for (const name of ['find', 'create', 'list', 'delete']) replace(projectStore, name, projects[name].bind(projects));
  for (const name of ['find', 'create', 'findShared']) replace(templateStore, name, templates[name].bind(templates));
  replace(userStore, 'findById', async id => ({ id, username: id, approved: true }));
  replace(friendStore, 'listForUser', async () => [{ firstUserId: 'owner', secondUserId: 'friend', status: 'accepted' }]);
  replace(materialStore, 'mergeProjectMaterials', async () => {});
  const app = express(); app.use(cookieParser()); app.use(express.json()); app.use('/templates', templateRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(done => server.once('listening', done));
  const base = `http://127.0.0.1:${server.address().port}/templates`;
  const request = (path, method = 'GET', body, user = 'owner') => fetch(`${base}${path}`, { method, headers: {
    'content-type': 'application/json', cookie: `maschenmate_token=${jwt.sign({}, config.JWT_SECRET, { subject: user, audience: 'maschenmate-web', issuer: 'maschenmate-api' })}`,
  }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const get = async (path, method, body, user) => { const response = await request(path, method, body, user); const value = await response.json(); assert.ok(response.ok, JSON.stringify(value)); return value; };
  const assertReferences = project => {
    const pattern = project.sections[0];
    assert.equal(pattern.needleId, project.needles[0].id);
    assert.equal(pattern.yarnId, project.yarns[0].id);
    assert.equal(pattern.entries[0].needleId, project.needles[0].id);
    assert.equal(pattern.entries[1].needleId, project.needles[0].id);
    assert.equal(pattern.entries[1].repeatRows[0].needleId, project.needles[0].id);
    assert.equal(pattern.entries[0].yarnId, project.yarns[0].id);
    assert.equal(pattern.entries[1].yarnId, project.yarns[0].id);
    assert.equal(pattern.entries[1].repeatRows[0].yarnId, project.yarns[0].id);
  };
  try {
    await t.test('inherited material stays unset while overrides survive project-template-project round trips', async () => {
      const original = input();
      original.name = 'Inheritance source';
      original.yarns.push({ ...original.yarns[0], id: 'contrast', name: 'Contrast' });
      original.needles.push({ ...original.needles[0], id: 'small', size: 3 });
      const pattern = original.sections[0];
      delete pattern.entries[0].yarnId;
      delete pattern.entries[0].needleId;
      pattern.entries[1].yarnId = 'contrast';
      pattern.entries[1].needleId = 'small';
      delete pattern.entries[1].repeatRows[0].yarnId;
      delete pattern.entries[1].repeatRows[0].needleId;
      pattern.entries[1].repeatRows.push({ instructions: 'Knit', stitchesPerRow: 20, yarnId: 'yarn', needleId: 'needle' });
      const source = await projects.create('owner', original);
      const { template: summary } = await get('', 'POST', { projectId: source.id, name: 'Inheritance' });
      const { template } = await get(`/${summary.id}`);
      const { project } = await get(`/${summary.id}/projects`, 'POST', { name: 'Inheritance copy' });
      for (const copy of [template, project]) {
        const section = copy.sections[0];
        const [range, repeat] = section.entries;
        assert.equal(range.yarnId, undefined);
        assert.equal(range.needleId, undefined);
        assert.equal(repeat.repeatRows[0].yarnId, undefined);
        assert.equal(repeat.repeatRows[0].needleId, undefined);
        assert.equal(section.yarnId, copy.yarns[0].id);
        assert.equal(section.needleId, copy.needles[0].id);
        assert.equal(repeat.yarnId, copy.yarns[1].id);
        assert.equal(repeat.needleId, copy.needles[1].id);
        assert.equal(repeat.repeatRows[1].yarnId, copy.yarns[0].id);
        assert.equal(repeat.repeatRows[1].needleId, copy.needles[0].id);
      }
      // Default inheritance must remain dynamic after the section selection changes.
      project.sections[0].yarnId = project.yarns[1].id;
      project.sections[0].needleId = project.needles[1].id;
      const saved = await projects.update('owner', project.id, project);
      const inherited = saved.sections[0].entries[0];
      assert.equal(inherited.yarnId ?? saved.sections[0].yarnId, saved.yarns[1].id);
      assert.equal(inherited.needleId ?? saved.sections[0].needleId, saved.needles[1].id);
    });
    await t.test('project -> template -> project retains PDF, notes, empty sections and material links', async () => {
      const source = await projects.create('owner', input());
      const { template: summary } = await get('', 'POST', { projectId: source.id, name: 'Mixed' });
      const { template } = await get(`/${summary.id}`);
      assert.equal(template.instructionMode, 'manual');
      assert.equal(template.instructionPdfName, 'Pattern.pdf');
      assert.equal(template.instructionPdf, undefined);
      assert.equal(template.sections[0].notes, source.sections[0].notes);
      assert.deepEqual(template.sections[1].entries, []);
      assert.equal(template.sections[2].rowCount, 20);
      assertReferences(template);
      assert.equal(await (await request(`/${summary.id}/instruction-pdf`)).text(), '%PDF-1.4\n%%EOF');
      const { project } = await get(`/${summary.id}/projects`, 'POST', { name: 'Copy' });
      assertReferences(project);
      assert.notEqual(project.yarns[0].id, source.yarns[0].id);
      assert.notEqual(project.sections[0].id, source.sections[0].id);
      assert.equal(project.sections[0].notes, source.sections[0].notes);
      assert.deepEqual(project.sections[1].entries, []);
      assert.equal(project.sections[2].rowCount, 20);
      assert.equal((await projects.find('owner', project.id)).instructionPdf, pdf);
      assert.equal(project.progress.startedAt, null);
      assert.deepEqual(project.progress.completedRows, {});
      assert.deepEqual(project.progress.changelog, []);
    });
    await t.test('old manual templates without PDF fields remain usable', async () => {
      const legacy = { ...input(), id: 'legacy-manual', userId: 'owner', name: 'Manual', projectName: 'Source', createdAt: new Date().toISOString() };
      delete legacy.pdfSections; delete legacy.instructionPdf; delete legacy.instructionPdfName;
      await templates.create(legacy);
      const { template } = await get('/legacy-manual');
      assert.equal(template.instructionPdfName, null);
      assert.equal(template.sections.length, 3);
      const { project } = await get('/legacy-manual/projects', 'POST', { name: 'Manual copy' });
      assert.equal(project.sections.length, 3);
      assert.equal(project.instructionPdfName, null);
      assertReferences(project);
    });
    for (const materialRefsLocal of [false, true]) await t.test(`legacy shared PDF templates migrate (local refs: ${materialRefsLocal})`, async () => {
      const id = `legacy-pdf-${materialRefsLocal}`;
      const legacy = { ...input(), id, userId: 'owner', shared: true, name: 'PDF', projectName: 'Source', createdAt: new Date().toISOString(), materialRefsLocal,
        instructionMode: 'pdf', pdfSections: [{ id: 'pdf-part', name: 'Body', rowCount: 45 }], sections: [] };
      delete legacy.instructionPdfName;
      await templates.create(legacy);
      const { template } = await get(`/${id}`, 'GET', undefined, 'friend');
      assert.equal(template.instructionMode, 'manual');
      assert.equal(template.instructionPdfName, 'Anleitung.pdf');
      assert.deepEqual(template.pdfSections, []);
      assert.deepEqual(template.sections[0], { id: 'pdf-part', name: 'Body', rowCount: 45, entries: [] });
      assert.equal(template.isOwner, false);
      const { project } = await get(`/${id}/projects`, 'POST', { name: `PDF copy ${materialRefsLocal}` }, 'friend');
      assert.equal(project.sections[0].rowCount, 45);
      assert.deepEqual(project.sections[0].entries, []);
      assert.equal(project.instructionPdfName, 'Anleitung.pdf');
      assert.equal((await projects.find('friend', project.id)).instructionPdf, pdf);
      assert.equal(project.sharedSource, true);
      assert.equal((await templates.find('owner', id)).instructionMode, 'pdf');
    });
    await t.test('templates without any instructions or attachments can create projects', async () => {
      const source = await projects.create('owner', { ...input(), name: 'Empty source', instructionPdf: null, instructionPdfName: null, sections: [] });
      const { template } = await get('', 'POST', { projectId: source.id, name: 'Empty' });
      const { project } = await get(`/${template.id}/projects`, 'POST', { name: 'Empty copy' });
      assert.deepEqual(project.sections, []);
      assert.equal(project.instructionPdfName, null);
    });
  } finally {
    await new Promise(done => server.close(done));
    for (const undo of restore.reverse()) undo();
    await rm(directory, { recursive: true, force: true });
  }
});
