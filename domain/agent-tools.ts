// Story 5.4 (AD-14) — the single place deciding which tools the agent is
// offered, from the conversation's livrable and the drive mode. Pure (AD-5).

export type AgentToolName =
  | 'propose_livrable_content'
  | 'propose_anchored_suggestions'
  | 'propose_presentation';

// - no livrable yet, or a livrable generated in the app → the agent may
//   write / rewrite the document (`propose_livrable_content`);
// - a livrable imported from Google Slides → anchored suggestions only:
//   its blocks are the Slides text boxes the save to Drive depends on,
//   so they are never regenerated (AD-9, AD-13);
// - Story 5.6: no livrable yet and Google Drive `connected` → the agent may
//   also propose a new presentation (`propose_presentation`), created in
//   Drive only on the consultant's click. Never offered in any other mode
//   (in particular never in demo mode).
export function selectAgentTools({
  livrableSource,
  driveMode,
}: {
  livrableSource: 'local' | 'drive' | null;
  driveMode: 'demo' | 'unconfigured' | 'disconnected' | 'connected';
}): AgentToolName[] {
  if (livrableSource === 'drive') return ['propose_anchored_suggestions'];
  if (livrableSource === null && driveMode === 'connected') {
    return ['propose_livrable_content', 'propose_presentation'];
  }
  return ['propose_livrable_content'];
}
