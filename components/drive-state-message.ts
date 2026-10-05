import type { DriveListingState } from '@/actions/document';

// Story 5.2/5.3 — EXPERIENCE.md drive states, shared by the Contexte and
// Livrables panels so both always show the same message.
const DRIVE_STATE_MESSAGES: Record<'disconnected' | 'unconfigured' | 'error', string> = {
  disconnected: 'Connectez Google Drive pour afficher les fichiers du projet.',
  unconfigured: "Google Drive n'est pas configuré pour cette installation.",
  error: 'Impossible de lire le Drive du projet. Réessayez plus tard.',
};

export function driveStateMessage(state: DriveListingState, projectName: string): string | null {
  if (state === 'ok') return null;
  if (state === 'folder_missing') return `Aucun dossier « ${projectName} » dans le Drive racine.`;
  if (state === 'folder_duplicate') return `Plusieurs dossiers portent le nom « ${projectName} ».`;
  return DRIVE_STATE_MESSAGES[state];
}

