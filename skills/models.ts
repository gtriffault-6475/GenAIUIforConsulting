// Closed list of AI models the composer may send with (Story 2.5's
// Boundaries — "jamais un skill ou un agent"). `id` is the exact model
// string sent to `skills/buildRequest.ts`'s `sendToAgent` and to the real
// `@anthropic-ai/sdk` call; `label` is the French UI text, also the value
// persisted to `MESSAGE.model` for an assistant reply (never the raw
// `id`, so a real reply reads consistently with `actions/conversation.ts`'s
// fixture data — e.g. `'Claude Sonnet 5'`, not `'claude-sonnet-5'`).
// Shared by `components/Composer.tsx` (client, for the dropdown) and
// `actions/conversation.ts` (server, to resolve `label` before persisting)
// so the id→label mapping exists in exactly one place.
export type ModelOption = {
  id: string;
  label: string;
};

export const MODELS: readonly ModelOption[] = [
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
  { id: 'claude-opus-5', label: 'Claude Opus 5' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
] as const;

export function resolveModelLabel(modelId: string): string {
  return MODELS.find((entry) => entry.id === modelId)?.label ?? modelId;
}
