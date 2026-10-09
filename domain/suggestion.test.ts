import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  acceptableSuggestions,
  applyAcceptedSuggestion,
  countPending,
  orderSuggestionsByAnchor,
  resolveAnchorPosition,
  suggestionPosition,
  type SuggestionStatus,
} from './suggestion.ts';

const blocks = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }];

type S = {
  name: string;
  anchorRef: string | null;
  status: SuggestionStatus;
  resolvedPosition: number | null;
};

function s(
  name: string,
  anchorRef: string | null,
  status: SuggestionStatus = 'pending',
  resolvedPosition: number | null = null,
): S {
  return { name, anchorRef, status, resolvedPosition };
}

const names = (list: S[]) => list.map((x) => x.name);

describe('resolveAnchorPosition', () => {
  test('position 1-based du bloc ciblé', () => {
    assert.equal(resolveAnchorPosition(blocks, 'p1'), 1);
    assert.equal(resolveAnchorPosition(blocks, 'p3'), 3);
  });

  test('ancre introuvable : null', () => {
    assert.equal(resolveAnchorPosition(blocks, 'absent'), null);
    assert.equal(resolveAnchorPosition([], 'p1'), null);
  });
});

describe('applyAcceptedSuggestion', () => {
  const doc = [
    { id: 'a', text: 'un', slideId: 's1', driveText: 'un' },
    { id: 'b', text: 'deux', slideId: 's1', driveText: 'deux' },
  ];

  test('seul le texte du bloc ancré change, id et autres champs gardés', () => {
    assert.deepEqual(applyAcceptedSuggestion(doc, 'b', 'DEUX'), [
      doc[0],
      { id: 'b', text: 'DEUX', slideId: 's1', driveText: 'deux' },
    ]);
  });

  test('ne modifie pas le tableau d’entrée', () => {
    const copy = structuredClone(doc);
    applyAcceptedSuggestion(doc, 'a', 'autre');
    assert.deepEqual(doc, copy);
  });

  test('ancre introuvable : blocs inchangés', () => {
    assert.deepEqual(applyAcceptedSuggestion(doc, 'z', 'x'), doc);
  });
});

describe('suggestionPosition', () => {
  test('suggestion en attente : position résolue en direct', () => {
    assert.equal(suggestionPosition(blocks, s('x', 'p2')), 2);
  });

  test('suggestion acceptée ou rejetée : position figée prioritaire', () => {
    assert.equal(suggestionPosition(blocks, s('x', 'p2', 'accepted', 7)), 7);
    assert.equal(suggestionPosition(blocks, s('x', 'gone', 'rejected', 4)), 4);
  });

  test('résolue sans position figée : résolution en direct', () => {
    assert.equal(suggestionPosition(blocks, s('x', 'p3', 'accepted', null)), 3);
  });

  test('en retravail : la position figée est ignorée', () => {
    assert.equal(suggestionPosition(blocks, s('x', 'p1', 'revising', 9)), 1);
  });

  test('suggestion globale : null', () => {
    assert.equal(suggestionPosition(blocks, s('x', null)), null);
  });

  test('ancre disparue, non résolue : null', () => {
    assert.equal(suggestionPosition(blocks, s('x', 'gone')), null);
  });
});

describe('orderSuggestionsByAnchor', () => {
  test('cartes dans l’ordre du document, globales en dernier', () => {
    const list = [s('global', null), s('p3', 'p3'), s('p1', 'p1'), s('p2', 'p2')];
    assert.deepEqual(names(orderSuggestionsByAnchor(blocks, list)), ['p1', 'p2', 'p3', 'global']);
  });

  test('ancres disparues avec les globales, en fin, ordre d’entrée gardé', () => {
    const list = [s('gone', 'zz'), s('global', null), s('p2', 'p2')];
    assert.deepEqual(names(orderSuggestionsByAnchor(blocks, list)), ['p2', 'gone', 'global']);
  });

  test('stable : même position garde l’ordre d’entrée', () => {
    const list = [s('second', 'p1'), s('first', 'p1'), s('p0', 'p1')];
    assert.deepEqual(names(orderSuggestionsByAnchor(blocks, list)), ['second', 'first', 'p0']);
  });

  test('positions figées utilisées pour les suggestions résolues', () => {
    const list = [s('pending-p1', 'p1'), s('accepted-frozen-5', 'gone', 'accepted', 5), s('pending-p3', 'p3')];
    assert.deepEqual(names(orderSuggestionsByAnchor(blocks, list)), [
      'pending-p1',
      'pending-p3',
      'accepted-frozen-5',
    ]);
  });

  test('renvoie un nouveau tableau sans trier l’entrée', () => {
    const list = [s('b', 'p2'), s('a', 'p1')];
    const result = orderSuggestionsByAnchor(blocks, list);
    assert.notEqual(result, list);
    assert.deepEqual(names(list), ['b', 'a']);
  });
});

describe('countPending', () => {
  test('compte seulement les suggestions en attente', () => {
    const list = [
      s('a', 'p1', 'pending'),
      s('b', 'p2', 'revising'),
      s('c', 'p3', 'accepted'),
      s('d', null, 'rejected'),
      s('e', null, 'pending'),
    ];
    assert.equal(countPending(list), 2);
  });

  test('une suggestion en retravail n’est pas comptée', () => {
    assert.equal(countPending([s('a', 'p1', 'revising')]), 0);
  });

  test('aucune suggestion : 0', () => {
    assert.equal(countPending([]), 0);
  });
});

describe('acceptableSuggestions', () => {
  test('en attente, ancrées, paragraphe présent, dans l’ordre du document', () => {
    const list = [
      s('p3', 'p3'),
      s('global', null),
      s('revising', 'p1', 'revising'),
      s('accepted', 'p2', 'accepted'),
      s('rejected', 'p2', 'rejected'),
      s('gone', 'zz'),
      s('p1', 'p1'),
    ];
    assert.deepEqual(names(acceptableSuggestions(blocks, list)), ['p1', 'p3']);
  });

  test('aucune acceptable : tableau vide', () => {
    assert.deepEqual(acceptableSuggestions(blocks, [s('global', null)]), []);
  });

  test('ne modifie pas l’entrée', () => {
    const list = [s('p2', 'p2'), s('p1', 'p1')];
    const result = acceptableSuggestions(blocks, list);
    assert.notEqual(result, list);
    assert.deepEqual(names(list), ['p2', 'p1']);
  });
});
