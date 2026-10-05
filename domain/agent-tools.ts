// Story 5.4 (AD-14) — the single place deciding which tools the agent is
// offered, from the conversation's livrable alone. Pure (AD-5).

export type AgentToolName = 'propose_livrable_content' | 'propose_anchored_suggestions';

// - no livrable yet, or a livrable generated in the app → the agent may
//   write / rewrite the document (`propose_livrable_content`);
// - a livrable imported from Google Slides → anchored suggestions only:
//   its blocks are the Slides text boxes the save to Drive depends on,
//   so they are never regenerated (AD-9, AD-13).
// Story 5.6 adds the presentation-proposal tool here.
export function selectAgentTools({
  livrableSource,
}: {
  livrableSource: 'local' | 'drive' | null;
}): AgentToolName[] {
  if (livrableSource === 'drive') return ['propose_anchored_suggestions'];
  return ['propose_livrable_content'];
}
