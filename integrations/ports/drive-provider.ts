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

// Story 5.1 (AD-1) — computed only by `resolveDriveMode`
// (`actions/google-connection.ts`), strict priority
// demo > unconfigured > disconnected > connected, then passed to the
// factory in `integrations/index.ts`. Declared here, next to the port it
// selects an adapter for, so `integrations/` never imports `actions/`.
export type DriveMode = 'demo' | 'unconfigured' | 'disconnected' | 'connected';
