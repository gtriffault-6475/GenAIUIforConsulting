// Single wiring point (AD-1): the only place a concrete adapter is
// imported. `actions/` imports providers from here, never from
// `integrations/mock/*` or a future `integrations/real/*` directly.
import { mockDriveProvider } from './mock/drive-provider';
import { mockMattermostProvider } from './mock/mattermost-provider';
import { mockProjectProvider } from './mock/project-provider';
import type { DriveProvider } from './ports/drive-provider';
import type { MattermostProvider } from './ports/mattermost-provider';
import type { ProjectProvider } from './ports/project-provider';

export const projectProvider: ProjectProvider = mockProjectProvider;
export const driveProvider: DriveProvider = mockDriveProvider;
export const mattermostProvider: MattermostProvider = mockMattermostProvider;
