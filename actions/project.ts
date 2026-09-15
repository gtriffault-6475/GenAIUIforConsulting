'use server';

import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { APP_STATE_ID, appState, project } from '@/db/schema';
import { projectProvider } from '@/integrations';
import type { OctopodProject } from '@/integrations/ports/project-provider';

// AD-2 — this is the only file allowed to read or write PROJECT/APP_STATE.
// Components never touch `db/` or `integrations/` directly; they call
// these Server Actions.

// The shape components see is the same as the port's — re-exported under
// a name that doesn't leak the "Octopod" integration detail into the UI
// layer.
export type ProjectSummary = OctopodProject;

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function listProjects(): Promise<ActionResult<ProjectSummary[]>> {
  try {
    const projects = await projectProvider.listProjects();
    return { ok: true, data: projects };
  } catch (error) {
    console.error('listProjects failed', error);
    return {
      ok: false,
      error: 'Impossible de récupérer la liste des projets Octopod.',
    };
  }
}

export async function getActiveProject(): Promise<
  ActionResult<ProjectSummary | null>
> {
  try {
    const [state] = await db
      .select()
      .from(appState)
      .where(eq(appState.id, APP_STATE_ID));

    if (!state?.activeProjectId) {
      return { ok: true, data: null };
    }

    const [row] = await db
      .select()
      .from(project)
      .where(eq(project.id, state.activeProjectId));

    return { ok: true, data: row ?? null };
  } catch (error) {
    console.error('getActiveProject failed', error);
    return {
      ok: false,
      error: 'Impossible de récupérer le projet actif.',
    };
  }
}

export async function selectProject(
  projectId: string,
): Promise<ActionResult<ProjectSummary>> {
  try {
    const octopodProject = await projectProvider.getProject(projectId);
    if (!octopodProject) {
      return { ok: false, error: 'Ce projet Octopod est introuvable.' };
    }

    // Both writes must land together: a project persisted without
    // APP_STATE pointing at it (or vice versa) would leave the singleton
    // row and its FK target out of sync if the second insert ever failed
    // independently of the first. `node:sqlite` is a synchronous driver,
    // so drizzle requires a plain (non-`async`) transaction callback —
    // each statement is forced to execute immediately via `.run()`
    // rather than relying on an implicit `await`.
    db.transaction((tx) => {
      // Persist (or refresh) the PROJECT row so APP_STATE's foreign key
      // resolves and later panels (Contexte, Mattermost) have a local
      // row to read and extend — PROJECT is the durable record, not a
      // cache.
      tx.insert(project)
        .values(octopodProject)
        .onConflictDoUpdate({
          target: project.id,
          set: {
            octopodProjectRef: octopodProject.octopodProjectRef,
            name: octopodProject.name,
            mattermostChannelRef: octopodProject.mattermostChannelRef,
          },
        })
        .run();

      // APP_STATE is a true singleton row (fixed id): upsert, never a
      // second insert.
      tx.insert(appState)
        .values({ id: APP_STATE_ID, activeProjectId: projectId })
        .onConflictDoUpdate({
          target: appState.id,
          set: { activeProjectId: projectId },
        })
        .run();
    });

    return { ok: true, data: octopodProject };
  } catch (error) {
    console.error('selectProject failed', error);
    return {
      ok: false,
      error: 'Impossible de sélectionner ce projet.',
    };
  }
}
