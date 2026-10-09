import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStepStatuses, STEPS } from './workflow.ts';

const statuses = (activeStepKey: string | null) =>
  computeStepStatuses(activeStepKey).map((step) => [step.key, step.status]);

test('les quatre étapes dans l’ordre fixe, avec leurs libellés', () => {
  assert.deepEqual(
    computeStepStatuses(null).map((step) => [step.key, step.label]),
    STEPS.map((step) => [step.key, step.label]),
  );
  assert.deepEqual(
    STEPS.map((step) => step.key),
    ['qualification', 'references', 'experts', 'redaction'],
  );
});

test('première étape active : les suivantes à venir', () => {
  assert.deepEqual(statuses('qualification'), [
    ['qualification', 'active'],
    ['references', 'upcoming'],
    ['experts', 'upcoming'],
    ['redaction', 'upcoming'],
  ]);
});

test('étape du milieu active : précédentes faites, suivantes à venir', () => {
  assert.deepEqual(statuses('experts'), [
    ['qualification', 'done'],
    ['references', 'done'],
    ['experts', 'active'],
    ['redaction', 'upcoming'],
  ]);
});

test('dernière étape active : toutes les autres faites', () => {
  assert.deepEqual(statuses('redaction'), [
    ['qualification', 'done'],
    ['references', 'done'],
    ['experts', 'done'],
    ['redaction', 'active'],
  ]);
});

test('conversation libre (null) ou étape inconnue : tout à venir', () => {
  for (const key of [null, 'inconnue']) {
    assert.ok(computeStepStatuses(key).every((step) => step.status === 'upcoming'));
  }
});
