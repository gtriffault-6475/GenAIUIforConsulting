import { GOOGLE_DOC_MIME, GOOGLE_SHEET_MIME } from '@/domain/document';

import type { DriveFile, DriveProvider } from '../ports/drive-provider';
import { withLatency } from './with-latency';

// Demo-mode drive (AD-1: only ever wired for `demo`). Story 5.2 aligned it
// on the real Drive panel (owner decision, spec-5-2): a flat list of the
// files directly in the project folder, keyed by project name
// (`integrations/mock/project-provider.ts`). Google Docs / Sheets carry
// no file extension and are readable by the agent; PDFs are not. Credible
// names only — no "mock"/"test" wording.
type SeedFile = DriveFile & { content: string };

const MODIFIED = '2026-09-12T09:30:00.000Z';

const SEED_FILES: Record<string, SeedFile[]> = {
  'Réponse RFP — Acme Corp': [
    {
      fileId: 'mock-acme-rfp',
      name: 'RFP — Acme Corp.pdf',
      mimeType: 'application/pdf',
      modifiedTime: MODIFIED,
      content:
        "Cahier des charges de l'appel d'offres pour la refonte de la plateforme de gestion des achats d'Acme Corp : périmètre fonctionnel, contraintes techniques et calendrier de réponse attendu.",
    },
    {
      fileId: 'mock-acme-cr-achats',
      name: 'CR call achats',
      mimeType: GOOGLE_DOC_MIME,
      modifiedTime: MODIFIED,
      content:
        "Compte-rendu de l'appel avec la direction achats d'Acme Corp : priorités budgétaires, jalons de décision et interlocuteurs côté client.",
    },
    {
      fileId: 'mock-acme-synthese',
      name: 'Note de synthèse client',
      mimeType: GOOGLE_DOC_MIME,
      modifiedTime: MODIFIED,
      content:
        "Synthèse des échanges préliminaires avec Acme Corp avant le lancement officiel de l'appel d'offres.",
    },
  ],
  'Audit interne — Mission Client': [
    {
      fileId: 'mock-audit-rapport',
      name: "Rapport d'audit interne — v0",
      mimeType: GOOGLE_DOC_MIME,
      modifiedTime: MODIFIED,
      content:
        "Version de travail du rapport d'audit interne : constats préliminaires sur les processus de contrôle et premières recommandations.",
    },
    {
      fileId: 'mock-audit-cr-direction',
      name: 'CR entretien direction financière.pdf',
      mimeType: 'application/pdf',
      modifiedTime: MODIFIED,
      content:
        "Compte-rendu de l'entretien avec la direction financière : points de vigilance identifiés et périmètre des tests à mener.",
    },
    {
      fileId: 'mock-audit-referentiel',
      name: 'Référentiel de contrôle interne',
      mimeType: GOOGLE_SHEET_MIME,
      modifiedTime: MODIFIED,
      content:
        "Contrôle;Processus;Fréquence\nSéparation des tâches;Achats;Continue\nRapprochement bancaire;Trésorerie;Mensuelle\nRevue des accès;SI;Trimestrielle",
    },
  ],
};

export const mockDriveProvider: DriveProvider = {
  async listFiles(projectName) {
    const files = (SEED_FILES[projectName] ?? []).map(
      ({ fileId, name, mimeType, modifiedTime }) => ({ fileId, name, mimeType, modifiedTime }),
    );
    return withLatency({ ok: true as const, data: files });
  },
  async exportText(fileId) {
    for (const files of Object.values(SEED_FILES)) {
      const file = files.find((candidate) => candidate.fileId === fileId);
      if (file) return withLatency({ ok: true as const, data: file.content });
    }
    return { ok: false, error: 'not_found' };
  },
};
