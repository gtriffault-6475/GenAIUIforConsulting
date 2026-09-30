---
title: "Fiabiliser l'appel réel à l'API Claude hors mode démo"
type: 'bugfix'
created: '2026-09-30'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
baseline_commit: 'c00a77aecd9c7c92f3e44f99bd21c464a56faa1f'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problème :** le chemin réel (hors mode démo) de `skills/buildRequest.ts`'s `sendToAgent` n'a jamais tourné avec une vraie clé. Relu contre la doc API actuelle, il a deux défauts qui cassent la génération d'un livrable : (1) le second `messages.create`, après un `tool_use`, renvoie un historique contenant `tool_use`/`tool_result` sans le paramètre `tools` -- rejet 400 probable, *après* que le livrable a déjà été créé ; (2) `max_tokens: 4096` est trop bas sur Opus 5 / Sonnet 5 (thinking adaptatif activé par défaut, qui consomme des tokens de sortie) pour un livrable complet passé en entrée d'outil, et une réponse tronquée (`stop_reason: "max_tokens"`) ou refusée (`"refusal"`) est traitée comme une réponse normale.

**Approche :** dans `sendToAgent` uniquement : (1) le second appel renvoie le même `tool` avec `tool_choice: { type: 'none' }` -- requête valide, et toujours aucun enchaînement d'outil possible (contrat "un seul tool_use géré par réponse" inchangé) ; (2) `max_tokens` passe à 16000 sur les deux appels (non streamé, sous les timeouts du SDK) ; (3) sur chacun des deux appels, `stop_reason` `max_tokens` ou `refusal` renvoie `{ ok: false }` avec un message français clair ("La réponse de l'agent a été tronquée…" / "L'agent a refusé de répondre à cette demande."), au lieu d'extraire un texte partiel ou d'exécuter un outil à l'entrée tronquée. Aucun changement du mode démo, des modèles proposés, ni de la signature de `sendToAgent`. Le cas "outil réussi puis second appel en échec" reste tel quel (déjà dans `deferred-work.md`).

</frozen-after-approval>

## Implementation Notes

`skills/buildRequest.ts` only. New `MAX_TOKENS = 16000` on both calls. New `checkStopReason(response, toolAlreadySucceeded)` runs on both calls: `max_tokens`, `model_context_window_exceeded` (found in SDK 0.126's `StopReason` during review) and `refusal` return `{ ok: false }`, with a `console.warn` logging the stop reason, model and usage. When the second call stops abnormally after a successful `executeTool`, the message says the livrable was saved ("Le livrable a bien été enregistré, mais la réponse de l'agent a été interrompue avant la fin.") instead of inviting a retry. The second call now sends `tools: [tool]` + `tool_choice: { type: 'none' }`.

Verified: `npx tsc --noEmit` and `npx next build --turbopack` clean. Throwaway harness (scratchpad, not committed): the real `sendToAgent` bundled with esbuild, run against a local fake Messages API server (`ANTHROPIC_BASE_URL`) on a DB copy with demo mode off -- 18/18 assertions across 6 scenarios: happy tool cycle (second request carries `tools`, `tool_choice: none`, `tool_result`, `max_tokens: 16000`), first call truncated mid-`tool_use` (tool never executed), second call truncated after tool success (livrable-saved message), refusal, context window exceeded on the no-tool path, plain reply. Not verified: a live call with a real key (pending the user's key) -- in particular that the real API accepts the second request.

## Review Triage Log

Blind-hunter only (oneshot route).

| # | Finding | Verdict | Route | Evidence |
|---|---|---|---|---|
| 1 | `extractText`'s doc comment ended up above `MAX_TOKENS`. | low | patch | Verified; comment moved back onto `extractText`. |
| 2 | A bad stop reason on the second call reports "reformulez" although the livrable is already saved. | medium | patch | Verified: `executeTool` has committed by then; `toolAlreadySucceeded` now yields a livrable-saved message (harness scenario C). |
| 3 | `model_context_window_exceeded` not handled. | medium | patch | Verified in `node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts:2256`; treated as truncation (scenario E). |
| 4 | No-tool callers now get a hard error on truncation instead of partial text. | -- | false | This is the frozen Intent ("sur chacun des deux appels ... au lieu d'extraire un texte partiel"). |
| 5 | 16000 and "thinking on by default" asserted without evidence. | -- | false | Per the current Claude API reference: non-streaming default ~16000 stays under SDK timeouts; Opus 5 / Sonnet 5 run adaptive thinking when `thinking` is omitted. |
| 6 | Spec unfinished (empty notes, `in-progress`). | -- | false | Oneshot template; notes and status are filled in at finalization. |
| 7 | No automated test / no live smoke run. | low | reject | No test runner in the repo (already in `deferred-work.md`); covered by the throwaway harness above; live run planned once the key is set. |
| 8 | Truncations and refusals leave no server-side trace. | low | patch | Direct addition of a `console.warn` with stop reason, model and usage. |
| 9 | The deferred "tool succeeded, second call failed" entry doesn't mention the new triggers. | low | defer | `deferred-work.md` is append-only; new entry appended. |
