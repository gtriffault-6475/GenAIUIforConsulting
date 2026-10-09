import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  budgetContextDocuments,
  CONTEXT_DOCUMENT_CHAR_CAP,
  CONTEXT_TOTAL_CHAR_CAP,
  exportMimeTypeFor,
  GOOGLE_DOC_MIME,
  GOOGLE_SHEET_MIME,
  GOOGLE_SLIDES_MIME,
  isAgentReadable,
  truncateForContext,
  UPLOAD_ACCEPT,
  uploadedFileName,
  uploadSourceMimeType,
  uploadTargetMimeType,
} from './document.ts';

describe('isAgentReadable', () => {
  test('Google Docs, Slides et Sheets sont lisibles', () => {
    assert.equal(isAgentReadable(GOOGLE_DOC_MIME), true);
    assert.equal(isAgentReadable(GOOGLE_SLIDES_MIME), true);
    assert.equal(isAgentReadable(GOOGLE_SHEET_MIME), true);
  });

  test('autres formats et type absent : non lisibles', () => {
    assert.equal(isAgentReadable('application/pdf'), false);
    assert.equal(isAgentReadable('application/vnd.google-apps.folder'), false);
    assert.equal(isAgentReadable(null), false);
    assert.equal(isAgentReadable(''), false);
  });
});

describe('exportMimeTypeFor', () => {
  test('Sheets exporté en CSV', () => {
    assert.equal(exportMimeTypeFor(GOOGLE_SHEET_MIME), 'text/csv');
  });

  test('Docs et Slides exportés en texte brut', () => {
    assert.equal(exportMimeTypeFor(GOOGLE_DOC_MIME), 'text/plain');
    assert.equal(exportMimeTypeFor(GOOGLE_SLIDES_MIME), 'text/plain');
  });
});

describe('truncateForContext', () => {
  test('texte sous le plafond : intact', () => {
    assert.deepEqual(truncateForContext('abc', 3), { text: 'abc', truncated: false });
  });

  test('texte au-dessus du plafond : coupé au plafond', () => {
    assert.deepEqual(truncateForContext('abcdef', 4), { text: 'abcd', truncated: true });
  });

  test('ne coupe jamais une paire de substitution (emoji) en deux', () => {
    const text = 'ab😀cd'; // a, b, high, low, c, d
    assert.deepEqual(truncateForContext(text, 3), { text: 'ab', truncated: true });
    assert.deepEqual(truncateForContext(text, 4), { text: 'ab😀', truncated: true });
  });

  test('plafond par défaut de 30 000 caractères', () => {
    assert.equal(CONTEXT_DOCUMENT_CHAR_CAP, 30_000);
    const long = 'x'.repeat(30_001);
    const result = truncateForContext(long);
    assert.equal(result.truncated, true);
    assert.equal(result.text.length, 30_000);
    assert.equal(truncateForContext('x'.repeat(30_000)).truncated, false);
  });
});

describe('budgetContextDocuments', () => {
  const doc = (name: string, length: number) => ({ name, content: 'x'.repeat(length) });

  test('documents courts : tous inclus intacts, dans l’ordre', () => {
    const result = budgetContextDocuments([doc('a', 10), doc('b', 20)], 100, 1000);
    assert.deepEqual(result, {
      included: [
        { name: 'a', text: 'x'.repeat(10), truncatedBy: null },
        { name: 'b', text: 'x'.repeat(20), truncatedBy: null },
      ],
      omitted: [],
    });
  });

  test('coupé par son propre plafond', () => {
    const { included } = budgetContextDocuments([doc('a', 150)], 100, 1000);
    assert.equal(included[0].text.length, 100);
    assert.equal(included[0].truncatedBy, 'document');
  });

  test('coupé par le budget total, avec la raison, les suivants laissés de côté', () => {
    const result = budgetContextDocuments(
      [doc('a', 900), doc('b', 900), doc('c', 10)],
      1000,
      1500,
    );
    assert.deepEqual(
      result.included.map((d) => [d.name, d.text.length, d.truncatedBy]),
      [
        ['a', 900, null],
        ['b', 600, 'total'],
      ],
    );
    assert.deepEqual(result.omitted, ['c']);
  });

  test('reste minuscule (moins de 500 caractères) : document laissé de côté', () => {
    const result = budgetContextDocuments([doc('a', 1300), doc('b', 1000)], 2000, 1500);
    assert.deepEqual(result.included.map((d) => d.name), ['a']);
    assert.deepEqual(result.omitted, ['b']);
  });

  test('seuil de 500 caractères : reste de 500 gardé (coupé), 499 laissé de côté', () => {
    const at500 = budgetContextDocuments([doc('a', 1000), doc('b', 1000)], 2000, 1500);
    assert.deepEqual(
      at500.included.map((d) => [d.name, d.text.length, d.truncatedBy]),
      [
        ['a', 1000, null],
        ['b', 500, 'total'],
      ],
    );
    assert.deepEqual(at500.omitted, []);
    const at499 = budgetContextDocuments([doc('a', 1001), doc('b', 1000)], 2000, 1500);
    assert.deepEqual(at499.included.map((d) => d.name), ['a']);
    assert.deepEqual(at499.omitted, ['b']);
  });

  test('reste minuscule mais document assez court : inclus en entier', () => {
    const result = budgetContextDocuments([doc('a', 1300), doc('b', 100)], 2000, 1500);
    assert.deepEqual(
      result.included.map((d) => [d.name, d.truncatedBy]),
      [
        ['a', null],
        ['b', null],
      ],
    );
    assert.deepEqual(result.omitted, []);
  });

  test('budget exactement épuisé : les suivants sont laissés de côté', () => {
    const result = budgetContextDocuments([doc('a', 1000), doc('b', 500), doc('c', 1)], 1000, 1500);
    assert.deepEqual(result.included.map((d) => d.name), ['a', 'b']);
    assert.deepEqual(result.omitted, ['c']);
  });

  test('plafonds par défaut : 30 000 par document, 60 000 au total', () => {
    assert.equal(CONTEXT_TOTAL_CHAR_CAP, 60_000);
    const result = budgetContextDocuments([doc('a', 40_000), doc('b', 40_000), doc('c', 40_000)]);
    assert.deepEqual(
      result.included.map((d) => [d.name, d.text.length, d.truncatedBy]),
      [
        ['a', 30_000, 'document'],
        ['b', 30_000, 'document'],
      ],
    );
    assert.deepEqual(result.omitted, ['c']);
  });

  test('aucun document : rien', () => {
    assert.deepEqual(budgetContextDocuments([]), { included: [], omitted: [] });
  });
});

describe('uploadTargetMimeType', () => {
  test('format Google cible selon l’extension', () => {
    assert.equal(uploadTargetMimeType('note.docx'), GOOGLE_DOC_MIME);
    assert.equal(uploadTargetMimeType('rapport.pdf'), GOOGLE_DOC_MIME);
    assert.equal(uploadTargetMimeType('notes.md'), GOOGLE_DOC_MIME);
    assert.equal(uploadTargetMimeType('chiffres.csv'), GOOGLE_SHEET_MIME);
    assert.equal(uploadTargetMimeType('budget.xlsx'), GOOGLE_SHEET_MIME);
    assert.equal(uploadTargetMimeType('deck.pptx'), GOOGLE_SLIDES_MIME);
  });

  test('extension insensible à la casse', () => {
    assert.equal(uploadTargetMimeType('DECK.PPTX'), GOOGLE_SLIDES_MIME);
  });

  test('format non supporté, sans extension ou fichier caché : null', () => {
    assert.equal(uploadTargetMimeType('image.png'), null);
    assert.equal(uploadTargetMimeType('README'), null);
    assert.equal(uploadTargetMimeType('.docx'), null);
  });
});

describe('uploadSourceMimeType', () => {
  test('type envoyé par le navigateur gardé s’il est précis', () => {
    assert.equal(uploadSourceMimeType('note.md', 'text/markdown'), 'text/markdown');
  });

  test('type vide ou générique : déduit de l’extension', () => {
    assert.equal(uploadSourceMimeType('notes.md', ''), 'text/plain');
    assert.equal(uploadSourceMimeType('data.csv', 'application/octet-stream'), 'text/csv');
    assert.equal(
      uploadSourceMimeType('doc.ODT', ''),
      'application/vnd.oasis.opendocument.text',
    );
  });

  test('extension inconnue sans type : octet-stream', () => {
    assert.equal(uploadSourceMimeType('fichier.xyz', ''), 'application/octet-stream');
  });
});

describe('tables d’upload', () => {
  test('chaque extension acceptée a un format cible et un type source connu', () => {
    for (const ext of UPLOAD_ACCEPT.split(',')) {
      assert.notEqual(uploadTargetMimeType(`f${ext}`), null, ext);
      assert.notEqual(uploadSourceMimeType(`f${ext}`, ''), 'application/octet-stream', ext);
    }
  });
});

describe('uploadedFileName', () => {
  test('nom sans l’extension', () => {
    assert.equal(uploadedFileName('Proposition client.docx'), 'Proposition client');
  });

  test('seule la dernière extension est retirée', () => {
    assert.equal(uploadedFileName('archive.v2.pdf'), 'archive.v2');
  });

  test('sans extension : nom gardé, espaces retirés', () => {
    assert.equal(uploadedFileName('  README  '), 'README');
  });

  test('fichier caché (point en tête) : nom complet gardé', () => {
    assert.equal(uploadedFileName('.env'), '.env');
  });

  test('base vide après retrait de l’extension : nom complet', () => {
    assert.equal(uploadedFileName(' .pdf'), '.pdf');
  });
});
