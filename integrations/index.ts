// Single wiring point (AD-1): the only place a concrete adapter is
// imported. `actions/` imports providers from here, never from
// `integrations/mock/*` or a future `integrations/real/*` directly.
import { createGoogleDriveProvider } from './google/drive';
import {
  GOOGLE_OAUTH_REDIRECT_URI,
  createGoogleAuthUrl,
  exchangeGoogleAuthCode,
  isGoogleConfigured,
  readGoogleConfig,
  revokeGoogleToken,
} from './google/oauth';
import { mockDriveProvider } from './mock/drive-provider';
import { mockMattermostProvider } from './mock/mattermost-provider';
import { mockProjectProvider } from './mock/project-provider';
import type { DriveError, DriveMode, DriveProvider } from './ports/drive-provider';
import type { MattermostProvider } from './ports/mattermost-provider';
import type { ProjectProvider } from './ports/project-provider';

export type {
  DriveError,
  DriveFile,
  DriveMode,
  DriveProvider,
  DriveResult,
  PresentationContent,
  PresentationSlide,
  PresentationTextBox,
} from './ports/drive-provider';
export type { GoogleOAuthExchangeResult } from './google/oauth';
export { PRESENTATION_MIME_TYPE, isExportableMimeType } from './ports/drive-provider';

export const projectProvider: ProjectProvider = mockProjectProvider;
export const mattermostProvider: MattermostProvider = mockMattermostProvider;

// A provider that only ever answers one error: what the panel shows
// outside demo mode when there is no usable Google account.
function failingDriveProvider(error: DriveError): DriveProvider {
  return {
    async listFiles() {
      return { ok: false, error };
    },
    async exportText() {
      return { ok: false, error };
    },
    async readPresentation() {
      return { ok: false, error };
    },
  };
}

// Story 5.1 replaced the former `driveProvider` constant with this
// factory; Story 5.2 wires the real adapters. The mode comes from
// `actions/drive-mode.ts`'s `resolveDriveMode` (the single decision
// point):
// - `demo` → the simulated adapter (never any Google call);
// - `connected` → the Google adapter, built with the stored refresh
//   token (read server-side by `actions/google-credentials.ts`, never
//   through a Server Action);
// - `disconnected` / `unconfigured` → a provider answering that error, so
//   no simulated file ever shows outside demo mode.
// A `connected` call without a token, or whose configuration vanished in
// between, degrades to the matching error rather than calling Google.
export function createDriveProvider(
  mode: DriveMode,
  refreshToken: string | null = null,
): DriveProvider {
  switch (mode) {
    case 'demo':
      return mockDriveProvider;
    case 'unconfigured':
      return failingDriveProvider('unconfigured');
    case 'disconnected':
      return failingDriveProvider('disconnected');
    case 'connected': {
      const config = readGoogleConfig();
      if (!config) return failingDriveProvider('unconfigured');
      if (!refreshToken) return failingDriveProvider('disconnected');
      return createGoogleDriveProvider(config, refreshToken);
    }
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
