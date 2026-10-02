// AD-1 (Ports & Adapters) — `actions/` and `domain/` reach a project's
// drive documents only through this interface, never through a concrete
// adapter. Round 1 wires `integrations/mock/drive-provider.ts` behind it
// at the single injection point, `integrations/index.ts`. Mirrors
// `integrations/ports/project-provider.ts` exactly.

export type OctopodDocument = {
  id: string;
  name: string;
  folderPath: string | null;
  content: string;
};

export interface DriveProvider {
  listDocuments(projectId: string): Promise<OctopodDocument[]>;
}

// Story 5.1 (AD-1, epic-5-context.md "Mode drive") — computed once by
// `actions/drive-mode.ts`'s `resolveDriveMode`, in this priority order,
// and passed to `integrations/index.ts`'s `createDriveProvider`, the only
// place a mode is turned into a concrete adapter.
export type DriveMode = 'demo' | 'unconfigured' | 'disconnected' | 'connected';
