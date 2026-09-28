'use server';

import { eq } from 'drizzle-orm';

import type { ActionResult } from '@/actions/types';
import { db } from '@/db/client';
import { document } from '@/db/schema';
import { driveProvider } from '@/integrations';

// spec-demo-document-reference.md — id dérivé de `projectId` (jamais
// `crypto.randomUUID()`, jamais un seul id fixe partagé entre projets) :
// `document.id` est la clé primaire globale de cette table, donc un seul
// id constant ne pourrait jamais appartenir qu'à un seul projet à la fois
// -- trouvé par l'orchestrateur en vérifiant que le tool-call démo (comme
// tout `matchDemoChatEntry`, jamais scopé par `projectId`) peut en théorie
// se déclencher sur n'importe quel projet, pas seulement `proj-acme-rfp`.
// Un id par projet laisse chaque projet obtenir sa propre copie, tout en
// restant idempotent (vérifié avant insertion, Boundaries: "un second
// déclenchement ne doit jamais créer de doublon") pour ce même projet.
// Non exportée (ce fichier porte `'use server'` -- toute fonction exportée
// en devient une Server Action, et Next rejette une Server Action
// synchrone). `resolveDemoReferenceDocumentId` ci-dessous est le seul point
// d'accès pour un appelant externe (`actions/demo.ts`).
function demoReferenceDocumentId(projectId: string): string {
  return `doc-demo-references-${projectId}`;
}

// Revue (blind-hunter, Review Triage Log #3) : `resetAvantVenteWorkflow`
// (`actions/demo.ts`) doit pouvoir supprimer ce même document lors d'un
// reset avant-vente (sans quoi rejouer la démo sur un projet déjà utilisé
// montre le document de référence dès le premier message, avant même que le
// tool-call RFP ne se redéclenche). AD-2 reste respecté : `actions/demo.ts`
// ne recalcule jamais l'id à la main, il appelle cette Server Action --
// seule source pour le dériver, ici comme dans `seedDemoReferenceDocument`
// ci-dessous. `async` uniquement pour la contrainte Server Action
// ci-dessus ; le corps lui-même n'a besoin d'aucun `await`.
export async function resolveDemoReferenceDocumentId(
  projectId: string,
): Promise<string> {
  return demoReferenceDocumentId(projectId);
}

// AD-2 — this is the only file allowed to read or write DOCUMENT.
// Components never touch `db/` or `integrations/` directly; they call
// this Server Action. Story 1.3 only ever inserts/reads rows with
// `source: 'drive'` — Story 1.4 adds `source: 'manual'` rows through this
// same file, alongside these.

export type DocumentSummary = {
  id: string;
  name: string;
  source: 'drive' | 'manual';
  folderPath: string | null;
};

export async function listDocuments(
  projectId: string,
): Promise<ActionResult<DocumentSummary[]>> {
  try {
    const driveDocuments = await driveProvider.listDocuments(projectId);

    // Mirrors `selectProject` in `actions/project.ts`: sync the (mocked)
    // drive listing into DOCUMENT before reading it back, so this table
    // — not the provider — is the single read path the Contexte panel
    // depends on, exactly as it will be once Story 1.4 starts inserting
    // `source: 'manual'` rows into the same table.
    db.transaction((tx) => {
      for (const doc of driveDocuments) {
        tx.insert(document)
          .values({
            id: doc.id,
            projectId,
            name: doc.name,
            source: 'drive',
            folderPath: doc.folderPath,
            content: doc.content,
          })
          .onConflictDoUpdate({
            target: document.id,
            set: {
              name: doc.name,
              folderPath: doc.folderPath,
              content: doc.content,
            },
          })
          .run();
      }
    });

    const rows = await db
      .select({
        id: document.id,
        name: document.name,
        source: document.source,
        folderPath: document.folderPath,
      })
      .from(document)
      .where(eq(document.projectId, projectId));

    return { ok: true, data: rows };
  } catch (error) {
    console.error('listDocuments failed', error);
    return {
      ok: false,
      error: 'Impossible de récupérer les documents du projet.',
    };
  }
}

// Story 1.4 — Ajout d'un document hors-drive. A manually-added document is
// NOT Octopod data (AD-1): it never goes through `DriveProvider` or any
// `integrations/*` adapter — this Server Action writes the `DOCUMENT` row
// directly, the same table `listDocuments` reads from, so the new row is
// visible immediately without any resync. The client (`AddDocumentForm`)
// already blocks empty name/content before ever calling this action; the
// checks below are a second line of defense so this function never trusts
// its caller and never throws an uncaught exception to the UI.
export async function addManualDocument({
  projectId,
  name,
  folderPath,
  content,
}: {
  projectId: string;
  name: string;
  folderPath: string | null;
  content: string;
}): Promise<ActionResult<DocumentSummary>> {
  const trimmedName = name.trim();
  const trimmedContent = content.trim();
  const trimmedFolderPath = folderPath?.trim() || null;

  if (!trimmedName || !trimmedContent) {
    return {
      ok: false,
      error: 'Le nom et le contenu sont obligatoires.',
    };
  }

  try {
    const id = crypto.randomUUID();

    db.insert(document)
      .values({
        id,
        projectId,
        name: trimmedName,
        source: 'manual',
        folderPath: trimmedFolderPath,
        content: trimmedContent,
      })
      .run();

    return {
      ok: true,
      data: {
        id,
        name: trimmedName,
        source: 'manual',
        folderPath: trimmedFolderPath,
      },
    };
  } catch (error) {
    console.error('addManualDocument failed', error);
    return {
      ok: false,
      error: "Impossible d'ajouter ce document.",
    };
  }
}

// spec-demo-document-reference.md — appelée uniquement par
// `actions/message.ts`'s `executeTool`, juste après un
// `createLivrableWithSuggestions`/`updateLivrableWithSuggestions` réussi
// sur l'entrée de création RFP du script démo (`skills/demoScript.ts`), et
// seulement quand le mode démo est actif -- la garde elle-même vit dans
// `actions/message.ts` (déjà en train de vérifier `getDemoModeActive()`
// pour cette même entrée), pas ici. `source: 'manual'` (jamais `'drive'`,
// AD-1) : ce n'est pas une donnée Octopod, seulement une mise en scène du
// mode démo -- ne sera jamais retiré ni écrasé par le prochain
// `listDocuments`/sync drive (qui ne touche que les ids listés par le
// provider). Idempotente par projet (`demoReferenceDocumentId`
// ci-dessus) : ne fait rien si ce projet a déjà sa copie, pour qu'un
// second déclenchement du même tool-call (ex. la révision globale, même
// point d'accroche) ne duplique jamais le document -- mais chaque projet
// où ce tool-call se déclenche obtient bien la sienne. `async` (bien que
// le corps n'ait besoin d'`await` que pour la lecture) parce que ce
// fichier porte `'use server'` -- toute fonction exportée en devient une
// Server Action, et Next rejette une Server Action synchrone (même leçon
// déjà rencontrée pour `actions/insert-message.ts`/`actions/message.ts` :
// "Server Actions must be async functions").
//
// Revue (blind-hunter) : cette fonction est appelée depuis `executeTool`
// (`actions/message.ts`), juste après que le livrable ait déjà été créé/mis
// à jour avec succès -- un échec ici ne doit donc jamais remonter comme une
// exception (elle serait attrapée par `sendToAgent`'s propre `try/catch` et
// transformerait tout l'échange en `assistantFailed: true`, alors que le
// vrai travail du tool-call a déjà réussi), d'où le `try/catch` local qui ne
// fait que logger. Le `SELECT` puis `INSERT` reste un check-then-act non
// atomique (deux déclenchements concurrents sur le même projet pourraient
// tous les deux passer le `SELECT` avant qu'aucun n'insère) ; `onConflictDoNothing`
// rend l'`INSERT` lui-même idempotent indépendamment de ce `SELECT`, qui
// reste comme court-circuit pour le cas non concurrent (la grande majorité).
export async function seedDemoReferenceDocument(projectId: string): Promise<void> {
  const id = demoReferenceDocumentId(projectId);

  try {
    const [existing] = await db
      .select({ id: document.id })
      .from(document)
      .where(eq(document.id, id));

    if (existing) return;

    db.insert(document)
      .values({
        id,
        projectId,
        name: 'Références clients — secteur Acme Corp.xlsx',
        source: 'manual',
        folderPath: 'Références',
        content:
          "Liste des missions déjà menées par le cabinet pour des acteurs du secteur d'Acme Corp, avec la portée de chaque mission et les résultats obtenus -- base de travail pour la réponse à l'appel d'offres en cours.",
      })
      .onConflictDoNothing({ target: document.id })
      .run();
  } catch (error) {
    console.error(
      'seedDemoReferenceDocument failed -- continuing without the reference document',
      error,
    );
  }
}
