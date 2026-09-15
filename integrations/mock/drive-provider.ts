import type { DriveProvider, OctopodDocument } from '../ports/drive-provider';

// Round-1 seed data: a handful of documents per seed project (ids match
// `integrations/mock/project-provider.ts`), credible enough to read as a
// real drive listing rather than a placeholder — no "mock"/"test"
// wording, no obviously-fake names.
const SEED_DOCUMENTS: Record<string, OctopodDocument[]> = {
  'proj-acme-rfp': [
    {
      id: 'doc-acme-rfp',
      name: 'RFP — Acme Corp.pdf',
      folderPath: null,
      content:
        "Cahier des charges de l'appel d'offres pour la refonte de la plateforme de gestion des achats d'Acme Corp : périmètre fonctionnel, contraintes techniques et calendrier de réponse attendu.",
    },
    {
      id: 'doc-acme-cr-achats',
      name: 'CR call achats.docx',
      folderPath: 'Comptes-rendus',
      content:
        "Compte-rendu de l'appel avec la direction achats d'Acme Corp : priorités budgétaires, jalons de décision et interlocuteurs côté client.",
    },
    {
      id: 'doc-acme-synthese',
      name: 'Note de synthèse client.pdf',
      folderPath: 'Synthèses',
      content:
        "Synthèse des échanges préliminaires avec Acme Corp avant le lancement officiel de l'appel d'offres.",
    },
  ],
  'proj-audit-mission': [
    {
      id: 'doc-audit-rapport',
      name: "Rapport d'audit interne — v0.docx",
      folderPath: null,
      content:
        "Version de travail du rapport d'audit interne : constats préliminaires sur les processus de contrôle et premières recommandations.",
    },
    {
      id: 'doc-audit-cr-direction',
      name: 'CR entretien direction financière.docx',
      folderPath: 'Comptes-rendus',
      content:
        "Compte-rendu de l'entretien avec la direction financière : points de vigilance identifiés et périmètre des tests à mener.",
    },
    {
      id: 'doc-audit-referentiel',
      name: 'Référentiel de contrôle interne.xlsx',
      folderPath: 'Référentiels',
      content:
        "Référentiel des contrôles internes en vigueur, utilisé comme base de comparaison pour la mission d'audit.",
    },
  ],
};

// A believable drive listing has network latency; see
// `integrations/mock/project-provider.ts` for the same rationale.
function withLatency<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), 180));
}

export const mockDriveProvider: DriveProvider = {
  async listDocuments(projectId) {
    return withLatency(SEED_DOCUMENTS[projectId] ?? []);
  },
};
