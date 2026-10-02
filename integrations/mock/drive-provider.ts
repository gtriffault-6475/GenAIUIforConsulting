import { isExportableMimeType, type DriveFile, type DriveProvider } from '../ports/drive-provider';
import { withLatency } from './with-latency';

const PDF = 'application/pdf';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Simulated drive (demo mode only, never shown outside it). Story 5.2:
// indexed by project NAME — the port resolves the project folder by name,
// like the Google adapter — matching `integrations/mock/project-provider.ts`.
// Credible enough to read as a real drive listing rather than a
// placeholder — no "mock"/"test" wording, no obviously-fake names.
// `folderPath` keeps the simulated folder grouping the demo has always
// shown. `content` is not part of `DriveFile`: it is kept here for Story
// 5.7's simulated text export, and never written to DOCUMENT by the
// resync (new drive rows start with an empty `content`).
type SeedFile = DriveFile & { content: string };

const SEED_FILES: Record<string, SeedFile[]> = {
  'Réponse RFP — Acme Corp': [
    {
      id: 'doc-acme-rfp',
      name: 'RFP — Acme Corp.pdf',
      mimeType: PDF,
      modifiedTime: '2026-09-01T09:00:00.000Z',
      folderPath: null,
      content:
        "Cahier des charges de l'appel d'offres pour la refonte de la plateforme de gestion des achats d'Acme Corp : périmètre fonctionnel, contraintes techniques et calendrier de réponse attendu.",
    },
    {
      id: 'doc-acme-cr-achats',
      name: 'CR call achats.docx',
      mimeType: DOCX,
      modifiedTime: '2026-09-02T09:00:00.000Z',
      folderPath: 'Comptes-rendus',
      content:
        "Compte-rendu de l'appel avec la direction achats d'Acme Corp : priorités budgétaires, jalons de décision et interlocuteurs côté client.",
    },
    {
      id: 'doc-acme-synthese',
      name: 'Note de synthèse client.pdf',
      mimeType: PDF,
      modifiedTime: '2026-09-03T09:00:00.000Z',
      folderPath: 'Synthèses',
      content:
        "Synthèse des échanges préliminaires avec Acme Corp avant le lancement officiel de l'appel d'offres.",
    },
  ],
  'Audit interne — Mission Client': [
    {
      id: 'doc-audit-rapport',
      name: "Rapport d'audit interne — v0.docx",
      mimeType: DOCX,
      modifiedTime: '2026-09-04T09:00:00.000Z',
      folderPath: null,
      content:
        "Version de travail du rapport d'audit interne : constats préliminaires sur les processus de contrôle et premières recommandations.",
    },
    {
      id: 'doc-audit-cr-direction',
      name: 'CR entretien direction financière.docx',
      mimeType: DOCX,
      modifiedTime: '2026-09-05T09:00:00.000Z',
      folderPath: 'Comptes-rendus',
      content:
        "Compte-rendu de l'entretien avec la direction financière : points de vigilance identifiés et périmètre des tests à mener.",
    },
    {
      id: 'doc-audit-referentiel',
      name: 'Référentiel de contrôle interne.xlsx',
      mimeType: XLSX,
      modifiedTime: '2026-09-06T09:00:00.000Z',
      folderPath: 'Référentiels',
      content:
        "Référentiel des contrôles internes en vigueur, utilisé comme base de comparaison pour la mission d'audit.",
    },
  ],
};

export const mockDriveProvider: DriveProvider = {
  async listFiles(projectName) {
    // An unknown project has an empty simulated folder (as before this
    // story) rather than `folder_missing`: the demo never shows a Google
    // message.
    const files: DriveFile[] = (SEED_FILES[projectName] ?? []).map(
      ({ id, name, mimeType, modifiedTime, folderPath }) => ({
        id,
        name,
        mimeType,
        modifiedTime,
        folderPath,
      }),
    );
    return withLatency({ ok: true as const, data: files });
  },

  // Story 5.7 — the simulated export. The simulated files keep their
  // PDF/.docx/.xlsx types, so the panel never offers to select them and
  // this is not reached from the UI today; it still answers like the
  // Google adapter would (the seed text, or `not_found`).
  async exportText(fileId) {
    for (const files of Object.values(SEED_FILES)) {
      const file = files.find((candidate) => candidate.id === fileId);
      if (file && isExportableMimeType(file.mimeType)) {
        return withLatency({ ok: true as const, data: file.content });
      }
    }
    return withLatency({ ok: false as const, error: 'not_found' as const });
  },
};
