// Epic 5 retrospective (A9) — the project-folder messages of EXPERIENCE.md,
// one source for the panels (`components/drive-state-message.ts`) and the
// presentation creation (`actions/livrable.ts`). Pure (AD-5).
export function folderMissingMessage(projectName: string): string {
  return `Aucun dossier « ${projectName} » dans le Drive racine.`;
}

export function folderDuplicateMessage(projectName: string): string {
  return `Plusieurs dossiers portent le nom « ${projectName} ».`;
}
