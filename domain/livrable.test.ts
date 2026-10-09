import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  driveTextChanged,
  googleSlidesSlideUrl,
  googleSlidesUrl,
  groupBlocksBySlide,
  hasUnsavedDriveChanges,
  isBlockModified,
  parseLivrableBlocks,
  planDriveSave,
  reimportKeepsSuggestion,
  slideHasUnsavedChanges,
  slidesToBlocks,
  type LivrableBlock,
} from './livrable.ts';

type Presentation = Parameters<typeof slidesToBlocks>[0];

const deck: Presentation = {
  slides: [
    {
      slideId: 's1',
      slideNumber: 1,
      textBoxes: [
        { objectId: 'a', text: 'Titre' },
        { objectId: 'blank', text: '   ' },
        { objectId: 'b', text: 'Sous-titre' },
      ],
    },
    { slideId: 's2', slideNumber: 2, textBoxes: [{ objectId: 'c', text: 'Corps' }] },
  ],
};

function block(id: string, text: string, driveText?: string, slide?: [string, number]): LivrableBlock {
  return {
    id,
    text,
    ...(driveText !== undefined ? { driveText } : {}),
    ...(slide ? { slideId: slide[0], slideNumber: slide[1] } : {}),
  };
}

describe('slidesToBlocks', () => {
  test('un bloc par zone de texte, dans l’ordre des diapositives, driveText = text', () => {
    assert.deepEqual(slidesToBlocks(deck), [
      { id: 'a', text: 'Titre', slideId: 's1', slideNumber: 1, driveText: 'Titre' },
      { id: 'b', text: 'Sous-titre', slideId: 's1', slideNumber: 1, driveText: 'Sous-titre' },
      { id: 'c', text: 'Corps', slideId: 's2', slideNumber: 2, driveText: 'Corps' },
    ]);
  });

  test('les zones vides ou blanches sont ignorées', () => {
    const ids = slidesToBlocks(deck).map((b) => b.id);
    assert.ok(!ids.includes('blank'));
  });

  test('présentation sans diapositive : aucun bloc', () => {
    assert.deepEqual(slidesToBlocks({ slides: [] }), []);
  });
});

describe('isBlockModified / hasUnsavedDriveChanges', () => {
  test('bloc local sans driveText : jamais modifié', () => {
    assert.equal(isBlockModified(block('a', 'texte')), false);
  });

  test('texte identique à driveText : pas modifié', () => {
    assert.equal(isBlockModified(block('a', 'x', 'x')), false);
  });

  test('texte différent de driveText : modifié', () => {
    assert.equal(isBlockModified(block('a', 'y', 'x')), true);
  });

  test('driveText vide et texte vide : pas modifié', () => {
    assert.equal(isBlockModified(block('a', '', '')), false);
  });

  test('hasUnsavedDriveChanges vrai dès qu’un bloc est modifié', () => {
    assert.equal(hasUnsavedDriveChanges([block('a', 'x', 'x'), block('b', 'y', 'z')]), true);
  });

  test('hasUnsavedDriveChanges faux sans bloc modifié ou sans bloc', () => {
    assert.equal(hasUnsavedDriveChanges([block('a', 'x', 'x'), block('b', 'local')]), false);
    assert.equal(hasUnsavedDriveChanges([]), false);
  });
});

describe('reimportKeepsSuggestion', () => {
  const before = [block('a', 'x', 'x'), block('b', 'local', 'drive')];

  test('suggestion globale (anchorRef null) : jamais conservée', () => {
    assert.equal(reimportKeepsSuggestion(before, before, null), false);
  });

  test('zone présente, texte Drive inchangé, sans modification locale : conservée', () => {
    assert.equal(reimportKeepsSuggestion(before, [block('a', 'x', 'x')], 'a'), true);
  });

  test('texte Drive de la zone changé : supprimée', () => {
    assert.equal(reimportKeepsSuggestion(before, [block('a', 'x2', 'x2')], 'a'), false);
  });

  test('zone disparue du nouvel import : supprimée', () => {
    assert.equal(reimportKeepsSuggestion(before, [block('b', 'drive', 'drive')], 'a'), false);
  });

  test('zone absente avant l’import : supprimée', () => {
    assert.equal(reimportKeepsSuggestion(before, [block('z', 'n', 'n')], 'z'), false);
  });

  test('zone modifiée localement (changement accepté) : supprimée même si Drive n’a pas changé', () => {
    assert.equal(reimportKeepsSuggestion(before, [block('b', 'drive', 'drive')], 'b'), false);
  });
});

describe('groupBlocksBySlide', () => {
  test('regroupe les blocs consécutifs d’une même diapositive', () => {
    const blocks = [
      block('a', 'a', 'a', ['s1', 1]),
      block('b', 'b', 'b', ['s1', 1]),
      block('c', 'c', 'c', ['s2', 2]),
    ];
    assert.deepEqual(groupBlocksBySlide(blocks), [
      { slideNumber: 1, blocks: [blocks[0], blocks[1]] },
      { slideNumber: 2, blocks: [blocks[2]] },
    ]);
  });

  test('blocs sans numéro de diapositive : un seul groupe 0', () => {
    const blocks = [block('a', 'a'), block('b', 'b')];
    assert.deepEqual(groupBlocksBySlide(blocks), [{ slideNumber: 0, blocks }]);
  });

  test('une diapositive non consécutive ouvre un nouveau groupe', () => {
    const blocks = [block('a', 'a', 'a', ['s1', 1]), block('b', 'b', 'b', ['s2', 2]), block('c', 'c', 'c', ['s1', 1])];
    assert.deepEqual(
      groupBlocksBySlide(blocks).map((g) => g.slideNumber),
      [1, 2, 1],
    );
  });

  test('aucun bloc : aucun groupe', () => {
    assert.deepEqual(groupBlocksBySlide([]), []);
  });
});

describe('parseLivrableBlocks', () => {
  test('lit les blocs valides avec tous leurs champs', () => {
    const blocks = [block('a', 'x', 'x', ['s1', 1]), block('b', 'y')];
    assert.deepEqual(parseLivrableBlocks(JSON.stringify({ blocks })), blocks);
  });

  test('JSON invalide : aucun bloc, sans exception', () => {
    assert.deepEqual(parseLivrableBlocks('{pas du json'), []);
  });

  test('pas de tableau blocks : aucun bloc', () => {
    assert.deepEqual(parseLivrableBlocks('{}'), []);
    assert.deepEqual(parseLivrableBlocks('{"blocks":"x"}'), []);
    assert.deepEqual(parseLivrableBlocks('null'), []);
    assert.deepEqual(parseLivrableBlocks('[]'), []);
  });

  test('entrées sans id ou texte chaîne écartées, les valides gardées', () => {
    const content = JSON.stringify({
      blocks: [null, 3, { id: 1, text: 'x' }, { id: 'a' }, { text: 'y' }, { id: 'ok', text: 'garde' }],
    });
    assert.deepEqual(parseLivrableBlocks(content), [{ id: 'ok', text: 'garde' }]);
  });
});

describe('planDriveSave', () => {
  test('texte Drive inchangé depuis la modification : à écrire', () => {
    const b = block('a', 'nouveau', 'ancien');
    assert.deepEqual(planDriveSave([b], new Map([['a', 'ancien']])), {
      toWrite: [b],
      alreadySaved: [],
      conflicts: [],
    });
  });

  test('Slides contient déjà le texte du bloc : déjà enregistré', () => {
    const b = block('a', 'nouveau', 'ancien');
    assert.deepEqual(planDriveSave([b], new Map([['a', 'nouveau']])), {
      toWrite: [],
      alreadySaved: [b],
      conflicts: [],
    });
  });

  test('texte Slides modifié ailleurs : conflit', () => {
    const b = block('a', 'nouveau', 'ancien');
    assert.deepEqual(planDriveSave([b], new Map([['a', 'autre']])).conflicts, ['a']);
  });

  test('zone disparue de Slides : conflit', () => {
    const b = block('a', 'nouveau', 'ancien');
    const plan = planDriveSave([b], new Map());
    assert.deepEqual(plan, { toWrite: [], alreadySaved: [], conflicts: ['a'] });
  });

  test('bloc modifié sans driveText : conflit (comportement actuel)', () => {
    const b = block('a', 'nouveau');
    assert.deepEqual(planDriveSave([b], new Map([['a', 'ancien']])), {
      toWrite: [],
      alreadySaved: [],
      conflicts: ['a'],
    });
  });

  test('plusieurs blocs répartis dans les trois listes, dans l’ordre', () => {
    const w1 = block('w1', 'n', 'o');
    const s = block('s', 'n', 'o');
    const c = block('c', 'n', 'o');
    const w2 = block('w2', 'n2', 'o2');
    const remote = new Map([
      ['w1', 'o'],
      ['s', 'n'],
      ['c', 'x'],
      ['w2', 'o2'],
    ]);
    assert.deepEqual(planDriveSave([w1, s, c, w2], remote), {
      toWrite: [w1, w2],
      alreadySaved: [s],
      conflicts: ['c'],
    });
  });
});

describe('googleSlidesUrl / googleSlidesSlideUrl', () => {
  test('URL d’édition de la présentation', () => {
    assert.equal(googleSlidesUrl('abc123'), 'https://docs.google.com/presentation/d/abc123/edit');
  });

  test('identifiant encodé', () => {
    assert.equal(googleSlidesUrl('a/b c'), 'https://docs.google.com/presentation/d/a%2Fb%20c/edit');
  });

  test('URL ouverte sur une diapositive', () => {
    assert.equal(
      googleSlidesSlideUrl('abc', 'g1_0'),
      'https://docs.google.com/presentation/d/abc/edit#slide=id.g1_0',
    );
  });

  test('identifiant de diapositive encodé', () => {
    assert.equal(
      googleSlidesSlideUrl('abc', 'a#b'),
      'https://docs.google.com/presentation/d/abc/edit#slide=id.a%23b',
    );
  });
});

describe('slideHasUnsavedChanges', () => {
  const blocks = [
    block('a', 'x', 'x', ['s1', 1]),
    block('b', 'modifié', 'origine', ['s2', 2]),
  ];

  test('une zone modifiée sur la diapositive : vrai', () => {
    assert.equal(slideHasUnsavedChanges(blocks, 's2'), true);
  });

  test('aucune zone modifiée sur la diapositive : faux', () => {
    assert.equal(slideHasUnsavedChanges(blocks, 's1'), false);
  });

  test('diapositive inconnue : faux', () => {
    assert.equal(slideHasUnsavedChanges(blocks, 's9'), false);
  });
});

describe('driveTextChanged', () => {
  const imported = slidesToBlocks(deck);

  function withBox(slideIndex: number, objectId: string, text: string | null): Presentation {
    return {
      slides: deck.slides.map((slide, index) => {
        if (index !== slideIndex) return slide;
        const others = slide.textBoxes.filter((box) => box.objectId !== objectId);
        const existing = slide.textBoxes.find((box) => box.objectId === objectId);
        if (text === null) return { ...slide, textBoxes: others };
        if (existing) {
          return {
            ...slide,
            textBoxes: slide.textBoxes.map((box) => (box.objectId === objectId ? { objectId, text } : box)),
          };
        }
        return { ...slide, textBoxes: [...slide.textBoxes, { objectId, text }] };
      }),
    };
  }

  test('présentation inchangée : faux', () => {
    assert.equal(driveTextChanged(imported, deck), false);
  });

  test('texte d’une zone modifié dans Slides : vrai', () => {
    assert.equal(driveTextChanged(imported, withBox(0, 'a', 'Titre modifié')), true);
  });

  test('zone supprimée dans Slides : vrai', () => {
    assert.equal(driveTextChanged(imported, withBox(1, 'c', null)), true);
  });

  test('zone suivie vidée dans Slides : vrai', () => {
    assert.equal(driveTextChanged(imported, withBox(1, 'c', '  ')), true);
  });

  test('zone ajoutée avec du texte : vrai', () => {
    assert.equal(driveTextChanged(imported, withBox(1, 'nouvelle', 'Texte')), true);
  });

  test('zone ajoutée vide : faux', () => {
    assert.equal(driveTextChanged(imported, withBox(1, 'nouvelle', '')), false);
  });

  test('modification locale non enregistrée : faux (seul Drive compte)', () => {
    const local = imported.map((b) => (b.id === 'a' ? { ...b, text: 'Édition locale' } : b));
    assert.equal(driveTextChanged(local, deck), false);
  });

  test('zone enregistrée vide, toujours vide dans Slides : faux', () => {
    const blocks = [...imported, block('blank', '', '', ['s1', 1])];
    assert.equal(driveTextChanged(blocks, deck), false);
  });

  test('ordre des diapositives changé seul : faux', () => {
    const reordered: Presentation = {
      slides: [
        { ...deck.slides[1], slideNumber: 1 },
        { ...deck.slides[0], slideNumber: 2 },
      ],
    };
    assert.equal(driveTextChanged(imported, reordered), false);
  });
});
