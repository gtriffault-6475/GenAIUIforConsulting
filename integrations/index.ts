// Single wiring point (AD-1): the only place a concrete adapter is
// imported. `actions/` imports providers from here, never from
// `integrations/mock/*` or `integrations/google/*` directly.
import {
  createGoogleDriveProvider,
  type GoogleDriveCredentials,
} from './google/drive-provider';
import { mockDriveProvider } from './mock/drive-provider';
import { mockMattermostProvider } from './mock/mattermost-provider';
import { mockProjectProvider } from './mock/project-provider';
import type { DriveMode, DriveProvider } from './ports/drive-provider';
import type { MattermostProvider } from './ports/mattermost-provider';
import type { ProjectProvider } from './ports/project-provider';

export const projectProvider: ProjectProvider = mockProjectProvider;
export const mattermostProvider: MattermostProvider = mockMattermostProvider;

export type { GoogleDriveCredentials };

// The drive adapter depends on the mode resolved by `resolveDriveMode`
// (`actions/google-connection.ts`): the simulated drive only ever serves
// the demo mode, the Google adapter only `connected` (with the credentials
// the caller read). `null` = no drive data for this mode (`unconfigured`,
// `disconnected`).
export function getDriveProvider(
  mode: DriveMode,
  googleCredentials?: GoogleDriveCredentials,
): DriveProvider | null {
  if (mode === 'demo') return mockDriveProvider;
  if (mode === 'connected' && googleCredentials) {
    return createGoogleDriveProvider(googleCredentials);
  }
  return null;
}
