// Single wiring point (AD-1): the only place a concrete adapter is
// imported. `actions/` imports providers from here, never from
// `integrations/mock/*` or a future `integrations/real/*` directly.
import { mockDriveProvider } from './mock/drive-provider';
import { mockProjectProvider } from './mock/project-provider';
import type { DriveProvider } from './ports/drive-provider';
import type { ProjectProvider } from './ports/project-provider';

export const projectProvider: ProjectProvider = mockProjectProvider;
export const driveProvider: DriveProvider = mockDriveProvider;
