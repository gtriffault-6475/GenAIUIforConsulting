// AD-1 (Ports & Adapters) — `actions/` and `domain/` reach Octopod project
// metadata only through this interface, never through a concrete adapter.
// Round 1 wires `integrations/mock/project-provider.ts` behind it at the
// single injection point, `integrations/index.ts`.

export type OctopodProject = {
  id: string;
  octopodProjectRef: string;
  name: string;
  mattermostChannelRef: string;
  type: 'avant-vente' | 'mission';
};

export interface ProjectProvider {
  listProjects(): Promise<OctopodProject[]>;
  getProject(id: string): Promise<OctopodProject | null>;
}
