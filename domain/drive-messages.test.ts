import { test } from 'node:test';
import assert from 'node:assert/strict';
import { folderDuplicateMessage, folderMissingMessage } from './drive-messages.ts';

test('dossier projet manquant : message nommant le projet', () => {
  assert.equal(folderMissingMessage('Acme'), 'Aucun dossier « Acme » dans le Drive racine.');
});

test('dossiers projet en double : message nommant le projet', () => {
  assert.equal(folderDuplicateMessage('Acme'), 'Plusieurs dossiers portent le nom « Acme ».');
});
