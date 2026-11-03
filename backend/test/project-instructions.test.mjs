import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import { config } from '../dist/config.js';
import { LocalProjectStore, normalizeStoredProject } from '../dist/project-store.js';
import { projectStore, userStore, activityStore } from '../dist/storage.js';
import projectRouter, { projectInputSchema } from '../dist/routes/projects.js';

const draft = () => ({
  name: 'Testprojekt', size: '', type: 'knitting', category: 'other', image: null,
  patternYarn: null, yarns: [], needles: [], instructionMode: 'manual',
  instructionPdf: null, instructionPdfName: null, pdfSections: [],
  sections: [{ id: 'empty', name: 'Leerer Abschnitt', entries: [] }],
  progress: { startedAt: null, activeSectionId: null, completedRows: {}, changelog: [] },
});
const pdf = `data:application/pdf;base64,${Buffer.from('%PDF-1.4\n%%EOF').toString('base64')}`;

test('common sections accept empty entries, notes and optional row counts with or without PDF', () => {
  for (const attachment of [null, pdf]) {
    const input = draft();
    input.instructionPdf = attachment;
    input.instructionPdfName = attachment ? 'Anleitung.pdf' : null;
    input.sections.push({ id: 'notes', name: 'Notiz', entries: [], notes: 'Auf die Länge achten.', rowCount: 12 });
    input.sections.push({ id: 'rows', name: 'Anweisungen', notes: 'Locker arbeiten.', entries: [
      { id: 'row', type: 'range', fromRow: 1, toRow: 3, instructions: 'Rechte Maschen', stitchesPerRow: 20 },
    ] });
    assert.equal(projectInputSchema.safeParse(input).success, true);
  }
  const invalid = draft();
  invalid.sections[0].notes = 'x'.repeat(5001);
  assert.equal(projectInputSchema.safeParse(invalid).success, false);
  invalid.sections[0].notes = '';
  invalid.sections[0].rowCount = 0;
  assert.equal(projectInputSchema.safeParse(invalid).success, false);
});

test('legacy PDF sections retain IDs, row counts, attachment and progress after normalization', () => {
  const input = draft();
  input.instructionMode = 'pdf';
  input.instructionPdf = pdf;
  input.instructionPdfName = 'Alt.pdf';
  input.pdfSections = [{ id: 'legacy', name: 'Rückenteil', rowCount: 30 }];
  input.progress.activeSectionId = 'legacy';
  input.progress.completedRows.legacy = 10;
  const normalized = normalizeStoredProject(input);
  assert.equal(normalized.instructionMode, 'manual');
  assert.deepEqual(normalized.sections[1], { id: 'legacy', name: 'Rückenteil', rowCount: 30, entries: [] });
  assert.equal(normalized.progress.completedRows.legacy, 10);
  assert.equal(normalized.instructionPdf, pdf);
  assert.deepEqual(normalizeStoredProject(normalized), normalized);
});

test('API preserves optional PDF and notes through edits and removes PDF explicitly', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'maschenmate-instructions-'));
  const store = new LocalProjectStore(join(directory, 'projects.json'));
  const methods = ['create', 'find', 'update'];
  const originals = Object.fromEntries(methods.map(name => [name, projectStore[name]]));
  const originalUser = userStore.findById;
  const originalActivity = activityStore.create;
  for (const name of methods) projectStore[name] = store[name].bind(store);
  userStore.findById = async id => ({ id, username: 'test', approved: true });
  activityStore.create = async () => {};
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use('/projects', projectRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(done => server.once('listening', done));
  const base = `http://127.0.0.1:${server.address().port}/projects`;
  const headers = { 'content-type': 'application/json', cookie: `maschenmate_token=${jwt.sign({}, config.JWT_SECRET, { subject: 'test', audience: 'maschenmate-web', issuer: 'maschenmate-api' })}` };
  try {
    const input = draft();
    input.instructionPdf = pdf;
    input.instructionPdfName = 'Anleitung.pdf';
    input.sections[0].notes = 'Meine Notiz';
    const created = await fetch(base, { method: 'POST', headers, body: JSON.stringify(input) });
    assert.equal(created.status, 201);
    let { project } = await created.json();
    assert.equal(project.sections[0].notes, 'Meine Notiz');
    const edited = await fetch(`${base}/${project.id}`, { method: 'PUT', headers, body: JSON.stringify(project) });
    assert.equal(edited.status, 200);
    assert.equal((await store.find('test', project.id)).instructionPdf, pdf);
    const download = await fetch(`${base}/${project.id}/instruction-pdf`, { headers });
    assert.equal(download.status, 200);
    const invalidPdf = await fetch(`${base}/${project.id}/instruction-pdf?name=Anleitung.pdf`, {
      method: 'PUT', headers: { ...headers, 'content-type': 'application/pdf' }, body: 'keine PDF',
    });
    assert.equal(invalidPdf.status, 400);
    const uploaded = await fetch(`${base}/${project.id}/instruction-pdf?name=Neu.pdf`, {
      method: 'PUT', headers: { ...headers, 'content-type': 'application/pdf' }, body: '%PDF-1.4\n%%EOF',
    });
    assert.equal(uploaded.status, 204);
    assert.equal((await store.find('test', project.id)).instructionPdfName, 'Neu.pdf');
    project.instructionPdfName = null;
    const removed = await fetch(`${base}/${project.id}`, { method: 'PUT', headers, body: JSON.stringify(project) });
    assert.equal(removed.status, 200);
    assert.equal((await store.find('test', project.id)).instructionPdf, null);
    assert.equal((await store.find('test', project.id)).sections[0].notes, 'Meine Notiz');
  } finally {
    await new Promise(done => server.close(done));
    for (const name of methods) projectStore[name] = originals[name];
    userStore.findById = originalUser;
    activityStore.create = originalActivity;
    await rm(directory, { recursive: true, force: true });
  }
});
