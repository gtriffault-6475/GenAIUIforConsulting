import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { presentationGuidance, selectAgentTools, type AgentToolContext } from './agent-tools.ts';

const modes: AgentToolContext['driveMode'][] = ['demo', 'unconfigured', 'disconnected', 'connected'];

function ctx(
  livrableSource: AgentToolContext['livrableSource'],
  driveMode: AgentToolContext['driveMode'],
  slidesTemplateConfigured = true,
): AgentToolContext {
  return { livrableSource, driveMode, slidesTemplateConfigured };
}

describe('selectAgentTools', () => {
  test('livrable importé de Slides : suggestions ancrées seulement, quel que soit le mode', () => {
    for (const mode of modes) {
      for (const configured of [true, false]) {
        assert.deepEqual(selectAgentTools(ctx('drive', mode, configured)), ['propose_anchored_suggestions']);
      }
    }
  });

  test('pas de livrable, Drive connecté, modèle configuré : contenu et présentation', () => {
    assert.deepEqual(selectAgentTools(ctx(null, 'connected', true)), [
      'propose_livrable_content',
      'propose_presentation',
    ]);
  });

  test('pas de livrable, Drive connecté sans modèle : contenu seulement', () => {
    assert.deepEqual(selectAgentTools(ctx(null, 'connected', false)), ['propose_livrable_content']);
  });

  test('pas de livrable hors mode connecté (dont démo) : contenu seulement', () => {
    for (const mode of ['demo', 'unconfigured', 'disconnected'] as const) {
      assert.deepEqual(selectAgentTools(ctx(null, mode, true)), ['propose_livrable_content']);
    }
  });

  test('livrable local : contenu seulement, même connecté', () => {
    assert.deepEqual(selectAgentTools(ctx('local', 'connected', true)), ['propose_livrable_content']);
  });
});

describe('presentationGuidance', () => {
  test('mode démo : rien, jamais de mention Google', () => {
    for (const source of [null, 'local', 'drive'] as const) {
      assert.equal(presentationGuidance(ctx(source, 'demo', true)), null);
    }
  });

  test('livrable importé de Slides : rien', () => {
    for (const mode of modes) {
      assert.equal(presentationGuidance(ctx('drive', mode, true)), null);
    }
  });

  test('outil de présentation proposé : consigne d’appeler propose_presentation', () => {
    const text = presentationGuidance(ctx(null, 'connected', true));
    assert.ok(text);
    assert.match(text, /appelez toujours l'outil propose_presentation/);
    assert.match(text, /ne dites jamais que vous n'avez pas accès au Drive/);
  });

  test('livrable local, connecté et configuré : refaire la demande dans une nouvelle conversation', () => {
    const text = presentationGuidance(ctx('local', 'connected', true));
    assert.ok(text);
    assert.match(text, /dites-lui de refaire la demande, dans une nouvelle conversation/);
    assert.doesNotMatch(text, /appelez toujours/);
  });

  test('Drive déconnecté, modèle configuré : connecter Google Drive d’abord', () => {
    const fresh = presentationGuidance(ctx(null, 'disconnected', true));
    assert.ok(fresh);
    assert.match(fresh, /connecter d'abord Google Drive/);
    assert.doesNotMatch(fresh, /nouvelle conversation/);
    const local = presentationGuidance(ctx('local', 'disconnected', true));
    assert.ok(local);
    assert.match(local, /connecter d'abord Google Drive.*nouvelle conversation/);
  });

  test('non configuré (Drive ou modèle) : création non configurée', () => {
    for (const context of [
      ctx(null, 'unconfigured', true),
      ctx(null, 'connected', false),
      ctx(null, 'disconnected', false),
      ctx('local', 'unconfigured', false),
    ]) {
      const text = presentationGuidance(context);
      assert.ok(text);
      assert.match(text, /n'est pas configurée pour cette installation/);
    }
  });

  test('toute consigne non nulle interdit d’écrire les diapositives en texte', () => {
    for (const source of [null, 'local'] as const) {
      for (const mode of ['unconfigured', 'disconnected', 'connected'] as const) {
        for (const configured of [true, false]) {
          const text = presentationGuidance(ctx(source, mode, configured));
          assert.ok(text);
          assert.match(text, /n'écrivez pas les diapositives/);
        }
      }
    }
  });
});
