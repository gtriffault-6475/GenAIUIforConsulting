// Single wiring point (AD-1): the only place a concrete adapter is
// imported. `actions/` imports providers from here, never from
// `integrations/mock/*` or `integrations/google/*` directly.
import { mockDriveProvider } from './mock/drive-provider';
import { mockMattermostProvider } from './mock/mattermost-provider';
import { mockProjectProvider } from './mock/project-provider';
import type { DriveMode, DriveProvider } from './ports/drive-provider';
import type { MattermostProvider } from './ports/mattermost-provider';
import type { ProjectProvider } from './ports/project-provider';

export const projectProvider: ProjectProvider = mockProjectProvider;
export const mattermostProvider: MattermostProvider = mockMattermostProvider;

// Story 5.1 — the drive adapter now depends on the mode resolved by
// `resolveDriveMode` (`actions/google-connection.ts`). The simulated drive
// only ever serves the demo mode: outside it no drive data is shown
// (owner decision recorded in spec-5-1-connexion-du-compte-google.md).
// `null` = no drive data for this mode. Story 5.2 returns the Google
// adapter for `connected`.
export function getDriveProvider(mode: DriveMode): DriveProvider | null {
  return mode === 'demo' ? mockDriveProvider : null;
}
