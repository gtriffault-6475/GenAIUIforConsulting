'use server';

import { eq } from 'drizzle-orm';

import type { ActionResult } from '@/actions/types';
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
    const existing = tx
      .select({ projectId: projectSkill.projectId })
      .from(projectSkill)
      .where(eq(projectSkill.projectId, projectId))
      .all();

    if (existing.length > 0) return;

    for (const skillKey of fixtureSkillKeys) {
      tx.insert(projectSkill).values({ projectId, skillKey }).run();
    }
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
      .where(eq(projectSkill.projectId, projectId));

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
// the only intended caller, via `sendMessage` in `actions/conversation.ts`.
// "Ordre de chargement" is the order `project_skill` rows come back in —
// the same implicit row order `listProjectSkills` already relies on.
export async function listLoadedSkillInstructions(
  projectId: string,
): Promise<ActionResult<{ skillKey: string; instructions: string }[]>> {
  try {
    seedFixturesIfEmpty(projectId);

    const rows = await db
      .select({ skillKey: projectSkill.skillKey })
      .from(projectSkill)
      .where(eq(projectSkill.projectId, projectId));

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
