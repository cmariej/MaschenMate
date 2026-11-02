import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import cookieParser from 'cookie-parser';
import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { config } from '../dist/config.js';
import { MongoTemplateStore } from '../dist/mongo-template-store.js';
import { LocalTemplateStore } from '../dist/template-store.js';
import { activityStore, friendStore, templateStore, userStore } from '../dist/storage.js';
import feedRouter from '../dist/routes/feed.js';
import templateRouter from '../dist/routes/project-templates.js';

test('MongoDB sharing uses an update pipeline accepted by Mongoose', async () => {
  const model = mongoose.model('ProjectTemplate');
  const original = model.collection.updateOne;
  const calls = [];
  model.collection.updateOne = async (filter, update) => {
    calls.push({ filter, update });
    return { matchedCount: 1 };
  };
  try {
    const store = new MongoTemplateStore();
    assert.equal(await store.setShared('owner', 'template', true), true);
    assert.equal(await store.setShared('owner', 'template', false), true);
    assert.deepEqual(calls[0].filter, { userId: 'owner', id: 'template' });
    assert.equal(calls[0].update[0].$set.shared, true);
    assert.equal(calls[1].update[0].$set.shared, false);
    assert.equal(calls[1].update[0].$set.sharedAt, null);
  } finally {
    model.collection.updateOne = original;
  }
});

test('sharing without friends works and later accepted friends gain access', async () => {
  const prefix = resolve(tmpdir(), 'maschenmate-sharing-test-');
  const directory = await mkdtemp(prefix);
  const store = new LocalTemplateStore(join(directory, 'templates.json'));
  const methods = ['list', 'listShared', 'findShared', 'setShared', 'find', 'findImage', 'create', 'delete'];
  const originals = Object.fromEntries(methods.map((name) => [name, templateStore[name]]));
  const originalFriends = friendStore.listForUser;
  const originalUser = userStore.findById;
  const originalActivities = activityStore.listForUsers;
  let friendship = null;
  for (const name of methods) templateStore[name] = store[name].bind(store);
  friendStore.listForUser = async (userId) => friendship && ['owner', 'friend'].includes(userId) ? [friendship] : [];
  userStore.findById = async (id) => ['owner', 'friend'].includes(id) ? { id, username: id, name: id, profileImage: null, approved: true } : null;
  activityStore.listForUsers = async () => [];
  await store.create({
    id: 'template', userId: 'owner', name: 'Vorlage', projectName: 'Projekt', size: '',
    type: 'knitting', category: 'other', image: null, patternYarn: null, yarns: [], needles: [],
    instructionMode: 'manual', instructionPdf: null, instructionPdfName: null, pdfSections: [], sections: [],
    createdAt: new Date().toISOString(),
  });

  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use('/api/project-templates', templateRouter);
  app.use('/api/feed', feedRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((done) => server.once('listening', done));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = (id, path, method = 'GET', body) => fetch(`${base}${path}`, {
    method,
    headers: {
      cookie: `maschenmate_token=${jwt.sign({}, config.JWT_SECRET, { subject: id, audience: 'maschenmate-web', issuer: 'maschenmate-api' })}`,
      'content-type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  try {
    const share = await request('owner', '/project-templates/template/sharing', 'PUT', { shared: true, rightsConfirmed: true });
    assert.equal(share.status, 200);
    assert.equal((await share.json()).shared, true);
    assert.equal((await (await request('owner', '/project-templates')).json()).templates[0].shared, true);
    assert.equal((await (await request('owner', '/feed')).json()).activities[0].type, 'template_shared');
    assert.equal((await request('friend', '/project-templates/template')).status, 404);
    friendship = { firstUserId: 'owner', secondUserId: 'friend', status: 'pending' };
    assert.equal((await request('friend', '/project-templates/template')).status, 404);
    friendship.status = 'accepted';
    assert.equal((await request('friend', '/project-templates/template')).status, 200);
    assert.equal((await (await request('friend', '/project-templates')).json()).templates[0].creatorUsername, 'owner');
    assert.equal((await request('friend', '/project-templates/template/sharing', 'PUT', { shared: false })).status, 404);
    assert.equal((await request('owner', '/project-templates/template/sharing', 'PUT', { shared: false })).status, 200);
    assert.equal((await request('friend', '/project-templates/template')).status, 404);
  } finally {
    await new Promise((done) => server.close(done));
    for (const name of methods) templateStore[name] = originals[name];
    friendStore.listForUser = originalFriends;
    userStore.findById = originalUser;
    activityStore.listForUsers = originalActivities;
    assert.ok(resolve(directory).startsWith(prefix));
    await rm(directory, { recursive: true, force: true });
  }
});
