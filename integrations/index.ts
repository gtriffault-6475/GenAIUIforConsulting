// Single wiring point (AD-1): the only place a concrete adapter is
// imported. `actions/` imports providers from here, never from
// `integrations/mock/*` or a future `integrations/real/*` directly.
import {
  GOOGLE_OAUTH_REDIRECT_URI,
  createGoogleAuthUrl,
  exchangeGoogleAuthCode,
  isGoogleConfigured,
  revokeGoogleToken,
} from './google/oauth';
import { mockDriveProvider } from './mock/drive-provider';
import { mockMattermostProvider } from './mock/mattermost-provider';
import { mockProjectProvider } from './mock/project-provider';
import type { DriveMode, DriveProvider } from './ports/drive-provider';
import type { MattermostProvider } from './ports/mattermost-provider';
import type { ProjectProvider } from './ports/project-provider';

export type { DriveMode } from './ports/drive-provider';
export type { GoogleOAuthExchangeResult } from './google/oauth';

export const projectProvider: ProjectProvider = mockProjectProvider;
export const mattermostProvider: MattermostProvider = mockMattermostProvider;

// Story 5.1 — replaces the former `driveProvider` constant. The mode comes
// from `actions/drive-mode.ts`'s `resolveDriveMode` (the single decision
// point). Decision 1 of the spec (Checkpoint 1): until Story 5.2 wires
// `integrations/google/*`, every mode still returns the simulated adapter,
// so the Contexte and Livrables panels stay unchanged in every mode.
export function createDriveProvider(mode: DriveMode): DriveProvider {
  switch (mode) {
    case 'demo':
    case 'unconfigured':
    case 'disconnected':
    case 'connected':
      return mockDriveProvider;
  }
}

// Story 5.1 (AD-12) — Google OAuth (connection only, no Drive access).
// Consumed by `app/api/google/oauth/*` and `actions/google-connection.ts`.
export const googleOAuth = {
  redirectUri: GOOGLE_OAUTH_REDIRECT_URI,
  isConfigured: isGoogleConfigured,
  createAuthUrl: createGoogleAuthUrl,
  exchangeAuthCode: exchangeGoogleAuthCode,
  revokeToken: revokeGoogleToken,
};
