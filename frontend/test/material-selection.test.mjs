import assert from 'node:assert/strict';
import test from 'node:test';
import { materialId } from '../src/app/material-selection.ts';

test('one yarn or needle applies to sections, instructions and repeat rows automatically', () => {
  for (const id of ['yarn', 'needle']) {
    const materials = [{ id }];
    assert.equal(materialId(materials), id);
    assert.equal(materialId(materials, undefined, undefined, undefined), id);
    assert.equal(materialId(materials, 'old-selection'), id);
  }
});

test('multiple materials preserve explicit choices and inheritance without choosing the first', () => {
  const materials = [{ id: 'first' }, { id: 'second' }];
  assert.equal(materialId(materials), undefined);
  assert.equal(materialId(materials, undefined, 'second'), 'second');
  assert.equal(materialId(materials, 'first', 'second'), 'first');
  assert.equal(materialId(materials, undefined, undefined, 'second'), 'second');
  assert.equal(materialId([], undefined), undefined);
});

test('implicit single-material selection stays dynamic after adding or removing materials', () => {
  const materials = [{ id: 'first' }];
  assert.equal(materialId(materials), 'first');
  materials.push({ id: 'second' });
  assert.equal(materialId(materials), undefined);
  // A section selection resolves the unknown state for all inherited instructions.
  assert.equal(materialId(materials, undefined, undefined, 'second'), 'second');
  assert.equal(materialId(materials, 'first', undefined, 'second'), 'first');
  materials.shift();
  assert.equal(materialId(materials), 'second');
});
