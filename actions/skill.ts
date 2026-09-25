'use server';

import { asc, eq } from 'drizzle-orm';

import type { ActionResult } from '@/actions/types';
import { getDemoModeActive } from '@/actions/demo';
import { seedIfEmpty } from '@/actions/seed-if-empty';
import { db } from '@/db/client';
import { projectSkill } from '@/db/schema';
import { SKILL_CATALOG } from '@/skills/catalog';

// AD-2 — this is the only file allowed to read or write PROJECT_SKILL.
// Components never touch `db/` directly; they call this Server Action.

// The shape `SkillsPanel` (and any future list surface) sees: a
// `PROJECT_SKILL` row's `skillKey` resolved against `skills/catalog.ts`
// (AD-4) into the two fields a card actually renders. Never carries
// `instructions` — that stays a server-only concern until Story 2.5's
// `skills/buildRequest.ts` reads it directly from the catalog.
export type ProjectSkillSummary = {
  skillKey: string;
  name: string;
  description: string;
};

// Story 2.4 seed data. No mechanism to attach a skill to a project exists
// yet — the real "Ajouter une skill" flow is explicitly deferred beyond
// this epic (PRD OQ-6, ARCHITECTURE-SPINE.md Deferred) — so, mirroring
// `seedFixturesIfEmpty` in `actions/conversation.ts`, this file seeds
// fixture rows directly rather than going through any mechanism a future
// add-skill feature would also need to use. Only the two seed projects
// from `integrations/mock/project-provider.ts` get fixture skills: the
// RFP project receives `references` + `rfp-drafting`, the mission project
// receives `references` + `mission-scoping`. Any other `projectId` (none
// exist yet in round 1) simply gets no seed and reads back an empty list.
const FIXTURE_PROJECT_SKILLS: Record<string, string[]> = {
  'proj-acme-rfp': ['references', 'rfp-drafting'],
  'proj-audit-mission': ['references', 'mission-scoping'],
};

// Seeds this project's fixture `PROJECT_SKILL` rows — but only when the
// project has zero rows yet and is one of the two known fixture projects
// above — so repeated calls (every page load) stay idempotent. Same
// synchronous `db.transaction` shape as `seedFixturesIfEmpty` in
// `actions/conversation.ts:113-154`: the existence check and the inserts
// run inside one callback with no `await` boundary between them, so
// nothing else on this single-threaded, synchronous `node:sqlite` driver
// can interleave between "check" and "act" — two callers racing to seed
// the same empty project (e.g. this function called twice from the same
// `Promise.all` in `app/page.tsx`, once directly and once via a future
// caller) cannot both observe zero rows and both insert.
function seedFixturesIfEmpty(projectId: string): void {
  const fixtureSkillKeys = FIXTURE_PROJECT_SKILLS[projectId];
  if (!fixtureSkillKeys) return;

  db.transaction((tx) => {
    seedIfEmpty(
      () => {
        const existing = tx
          .select({ projectId: projectSkill.projectId })
          .from(projectSkill)
          .where(eq(projectSkill.projectId, projectId))
          .all();

        return existing.length > 0;
      },
      () => {
        fixtureSkillKeys.forEach((skillKey, position) => {
          tx.insert(projectSkill).values({ projectId, skillKey, position }).run();
        });
      },
    );
  });
}

export async function listProjectSkills(
  projectId: string,
): Promise<ActionResult<ProjectSkillSummary[]>> {
  try {
    seedFixturesIfEmpty(projectId);

    const rows = await db
      .select({ skillKey: projectSkill.skillKey })
      .from(projectSkill)
      .where(eq(projectSkill.projectId, projectId))
      .orderBy(asc(projectSkill.position));

    const skills: ProjectSkillSummary[] = [];
    for (const row of rows) {
      const skill = SKILL_CATALOG[row.skillKey];
      // A PROJECT_SKILL row referencing a key no longer in the catalog
      // (e.g. a catalog entry renamed/removed after the row was written)
      // is a data problem, not a crash — skip that row and keep serving
      // the rest of the list rather than letting one bad row take the
      // whole panel down.
      if (!skill) {
        console.error(
          'listProjectSkills: PROJECT_SKILL row references an unknown catalog key',
          row.skillKey,
        );
        continue;
      }
      skills.push({
        skillKey: skill.key,
        name: skill.name,
        description: skill.description,
      });
    }

    return { ok: true, data: skills };
  } catch (error) {
    console.error('listProjectSkills failed', error);
    return {
      ok: false,
      error: 'Impossible de récupérer les skills du projet.',
    };
  }
}

// Story 2.5 — Sélection du modèle et envoi d'un message. Server-only
// counterpart to `listProjectSkills` above: same join, same catalog
// resolution and orphan-key handling, but returns `instructions` instead
// of `name`/`description`. `ProjectSkillSummary` (and `listProjectSkills`
// itself) stay exactly as they are — this is a separate function, not a
// reshape of the existing one, per the spec's Never ("ne pas modifier
// listProjectSkills... ProjectSkillSummary reste un contrat gelé"). Not
// exported to any client component: `skills/buildRequest.ts` (AD-11) is
// the only intended caller, via `sendMessage` in `actions/message.ts`.
// "Ordre de chargement" (AD-11) est désormais `projectSkill.position`
// (epic-2-retro-item-14), pas un ordre de lignes implicite -- ce dernier
// s'est avéré diverger silencieusement de l'ordre d'insertion en pratique
// (voir le commentaire de `position` dans `db/schema.ts`).
export async function listLoadedSkillInstructions(
  projectId: string,
): Promise<ActionResult<{ skillKey: string; instructions: string }[]>> {
  try {
    seedFixturesIfEmpty(projectId);

    const rows = await db
      .select({ skillKey: projectSkill.skillKey })
      .from(projectSkill)
      .where(eq(projectSkill.projectId, projectId))
      .orderBy(asc(projectSkill.position));

    const instructions: { skillKey: string; instructions: string }[] = [];
    for (const row of rows) {
      const skill = SKILL_CATALOG[row.skillKey];
      if (!skill) {
        console.error(
          'listLoadedSkillInstructions: PROJECT_SKILL row references an unknown catalog key',
          row.skillKey,
        );
        continue;
      }
      instructions.push({ skillKey: skill.key, instructions: skill.instructions });
    }

    return { ok: true, data: instructions };
  } catch (error) {
    console.error('listLoadedSkillInstructions failed', error);
    return {
      ok: false,
      error: 'Impossible de récupérer les instructions des skills chargées.',
    };
  }
}

// spec-demo-ajout-skill.md — mocke le vrai "Ajouter une skill" toujours
// différé (PRD OQ-6, commentaire de `FIXTURE_PROJECT_SKILLS` ci-dessus) :
// insère une vraie ligne `PROJECT_SKILL`, jamais une donnée fictive --
// reste chargée normalement (utilisée par `listLoadedSkillInstructions`,
// visible dans `listProjectSkills`) même après désactivation du mode démo.
// Refuse explicitement si le mode démo n'est pas actif (`actions/demo.ts`'s
// `getDemoModeActive`) : jamais une fonctionnalité activable par accident
// en dehors d'une démo, avant même que `SkillsPanel.tsx` ne l'offre. Reste
// dans ce fichier (AD-2, seul propriétaire de PROJECT_SKILL) plutôt que
// dans `actions/demo.ts` : contrairement à `resetAvantVenteWorkflow`
// (un outil autonome sur son propre domaine), ceci ne fait qu'étendre une
// action déjà propriétaire de cette table.
export async function addProjectSkillDemo(
  projectId: string,
  skillKey: string,
): Promise<ActionResult<void>> {
  // Tour 2 (bmad-review, blind-hunter) : la garde du mode démo passe en
  // premier -- avant même de valider `skillKey` -- pour que "cette
  // fonctionnalité n'est disponible qu'en mode démo" reste le refus reçu
  // hors démo dans tous les cas, y compris avec une clé invalide, plutôt
  // que l'ordre inverse d'origine qui pouvait renvoyer "introuvable dans
  // le catalogue" en dehors du mode démo. Un échec de lecture (pas
  // seulement "mode démo inactif") est aussi loggé ici, comme partout
  // ailleurs dans ce fichier -- l'utilisateur voit le même message dans
  // les deux cas (aucune action possible de son côté), mais une vraie
  // panne d'infrastructure ne doit jamais disparaître sans trace.
  const demoModeResult = await getDemoModeActive();
  if (!demoModeResult.ok) {
    console.error('addProjectSkillDemo: getDemoModeActive failed', demoModeResult.error);
  }
  if (!demoModeResult.ok || !demoModeResult.data) {
    return {
      ok: false,
      error: "L'ajout d'une skill n'est disponible qu'en mode démo.",
    };
  }

  if (!SKILL_CATALOG[skillKey]) {
    return { ok: false, error: 'Cette skill est introuvable dans le catalogue.' };
  }

  try {
    // Tour 2 (bmad-review, blind-hunter) : même geste que
    // `listProjectSkills`/`listLoadedSkillInstructions` -- sans cet appel,
    // un premier ajout sur un projet jamais encore lu (ex. cette action
    // appelée directement, sans être passé par l'UI qui aurait déjà
    // déclenché ce seed) rendrait la table non-vide avant que les
    // fixtures n'aient jamais été posées, désactivant `seedIfEmpty`'s
    // garde "si vide" pour toujours sur ce projet.
    seedFixturesIfEmpty(projectId);

    let result: ActionResult<void> | null = null;

    db.transaction((tx) => {
      const existingRows = tx
        .select({ skillKey: projectSkill.skillKey, position: projectSkill.position })
        .from(projectSkill)
        .where(eq(projectSkill.projectId, projectId))
        .all();

      if (existingRows.some((row) => row.skillKey === skillKey)) {
        result = { ok: false, error: 'Cette skill est déjà chargée sur ce projet.' };
        return;
      }

      // Append (Boundaries: même position-append que `seedFixturesIfEmpty`
      // ci-dessus) — jamais une position choisie par l'utilisateur, cette
      // skill arrive toujours en dernier dans l'ordre de chargement.
      const nextPosition =
        existingRows.reduce((max, row) => Math.max(max, row.position ?? -1), -1) + 1;

      tx.insert(projectSkill)
        .values({ projectId, skillKey, position: nextPosition })
        .run();

      result = { ok: true, data: undefined };
    });

    return result ?? { ok: false, error: "Impossible d'ajouter cette skill." };
  } catch (error) {
    console.error('addProjectSkillDemo failed', error);
    return { ok: false, error: "Impossible d'ajouter cette skill." };
  }
}
