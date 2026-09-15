import type { OctopodProject, ProjectProvider } from '../ports/project-provider';
import { withLatency } from './with-latency';

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

export const mockProjectProvider: ProjectProvider = {
  async listProjects() {
    return withLatency(SEED_PROJECTS);
  },
  async getProject(id) {
    return withLatency(SEED_PROJECTS.find((p) => p.id === id) ?? null);
  },
};
