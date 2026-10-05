// Story 5.4 (AD-14) — the single place deciding which tools the agent is
// offered, from the conversation's livrable and the drive mode. Pure (AD-5).

// Same values as `DriveMode` (`integrations/ports/drive-provider.ts`),
// repeated so `domain/` imports nothing outside itself (AD-5).
export type AgentToolContext = {
  livrableSource: 'local' | 'drive' | null;
  driveMode: 'demo' | 'unconfigured' | 'disconnected' | 'connected';
};

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
}: AgentToolContext): AgentToolName[] {
  if (livrableSource === 'drive') return ['propose_anchored_suggestions'];
  if (livrableSource === null && driveMode === 'connected') {
    return ['propose_livrable_content', 'propose_presentation'];
  }
  return ['propose_livrable_content'];
}

// Story 5.6 follow-up (spec-5-6-presentation-tool-use.md) — what the agent
// is told about presentations, from the same inputs as `selectAgentTools`.
// `null` = nothing to say: demo mode (never any Google wording) and a
// conversation of an imported deck (anchored suggestions only).
const PRESENTATION_REQUEST =
  "Quand le consultant demande une présentation, des slides, des diapositives, un deck ou un support de présentation (même s'il l'appelle « livrable »)";
const NO_TEXT_SLIDES =
  "n'écrivez pas les diapositives dans votre réponse ni sous forme de livrable texte — sauf s'il demande explicitement un plan en texte dans la conversation. Cette règle prime sur les skills chargés pour la forme du livrable.";

export function presentationGuidance(context: AgentToolContext): string | null {
  const { livrableSource, driveMode } = context;
  if (driveMode === 'demo' || livrableSource === 'drive') return null;
  if (selectAgentTools(context).includes('propose_presentation')) {
    return `${PRESENTATION_REQUEST}, appelez toujours l'outil propose_presentation (propose_livrable_content sert uniquement aux documents texte : note, réponse à un appel d'offres…) ; ${NO_TEXT_SLIDES}`;
  }
  const where = livrableSource === 'local' ? ', dans une nouvelle conversation (celle-ci a déjà un livrable)' : '';
  if (driveMode === 'connected') {
    return `${PRESENTATION_REQUEST}, dites-lui de refaire la demande${where} ; ${NO_TEXT_SLIDES}`;
  }
  if (driveMode === 'disconnected') {
    return `${PRESENTATION_REQUEST}, dites-lui que la création d'une présentation demande de connecter d'abord Google Drive avec le bouton « Connecter Google Drive », puis de refaire la demande${where} ; ${NO_TEXT_SLIDES}`;
  }
  return `${PRESENTATION_REQUEST}, dites-lui que la création de présentations dans Google Drive n'est pas configurée pour cette installation ; ${NO_TEXT_SLIDES}`;
}
