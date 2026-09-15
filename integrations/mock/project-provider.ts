import type { OctopodProject, ProjectProvider } from '../ports/project-provider';

// Round-1 seed data: one project per PRD use case (avant-vente, mission),
// each already carrying its `octopodProjectRef`/`mattermostChannelRef` so
// selecting a project never requires a separate configuration step.
const SEED_PROJECTS: OctopodProject[] = [
  {
    id: 'proj-acme-rfp',
    octopodProjectRef: 'OCTO-AV-2847',
    name: 'Réponse RFP — Acme Corp',
    mattermostChannelRef: 'av-acme-rfp',
  },
  {
    id: 'proj-audit-mission',
    octopodProjectRef: 'OCTO-MI-1936',
    name: 'Audit interne — Mission Client',
    mattermostChannelRef: 'mi-audit-interne',
  },
];

// A believable Octopod call has network latency; a mock that resolves
// instantly is one of the "signs the data is simulated" the epic context
// explicitly rules out.
function withLatency<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), 180));
}

export const mockProjectProvider: ProjectProvider = {
  async listProjects() {
    return withLatency(SEED_PROJECTS);
  },
  async getProject(id) {
    return withLatency(SEED_PROJECTS.find((p) => p.id === id) ?? null);
  },
};
