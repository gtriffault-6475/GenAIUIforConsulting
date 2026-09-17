'use server';

import { eq } from 'drizzle-orm';

import type { ActionResult } from '@/actions/types';
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

// Shared by `selectProject` and `getActiveProject` — the only two places
// that write PROJECT (AD-2). Keeping Octopod-sourced fields (including
// `type`, Story 3.2) here once means a future field only needs a single
// `set` clause updated, not a duplicate in each caller. Takes `db` or a
// transaction callback's `tx` — both expose the same `.insert()` builder —
// so `selectProject` can still land this write atomically with its
// `appState` update.
function syncProjectRow(
  executor: Pick<typeof db, 'insert'>,
  octopodProject: OctopodProject,
): void {
  executor
    .insert(project)
    .values(octopodProject)
    .onConflictDoUpdate({
      target: project.id,
      set: {
        octopodProjectRef: octopodProject.octopodProjectRef,
        name: octopodProject.name,
        mattermostChannelRef: octopodProject.mattermostChannelRef,
        type: octopodProject.type,
      },
    })
    .run();
}

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

    // `activeProjectId` set but no matching PROJECT row is not the same
    // state as "no project ever selected" (the branch above) — that would
    // mean the FK target itself went missing, which the UI should surface
    // as an error, not silently fall back to an empty selector as if
    // nothing had ever been chosen.
    if (!row) {
      console.error(
        'getActiveProject: APP_STATE.activeProjectId points at a missing PROJECT row',
        state.activeProjectId,
      );
      return { ok: false, error: 'Le projet actif est introuvable.' };
    }

    // Refresh Octopod-sourced fields (name, refs, `type`) on every read,
    // not just at selection time — otherwise a field added to
    // `OctopodProject` after a project was already active (Story 3.2's
    // `type`, backfilled to a schema-migration default for any
    // pre-existing row) stays permanently wrong: there is no "switch
    // project" UI yet, so nothing else would ever call `selectProject`
    // again for an already-active project. A provider hiccup here serves
    // the last-known local row rather than erroring the whole page for a
    // field-refresh failure.
    const octopodProject = await projectProvider.getProject(
      state.activeProjectId,
    );
    if (octopodProject) {
      syncProjectRow(db, octopodProject);
      return { ok: true, data: octopodProject };
    }

    console.error(
      'getActiveProject: projectProvider.getProject found nothing for the active project; serving the last-known local row',
      state.activeProjectId,
    );
    return { ok: true, data: row };
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
      syncProjectRow(tx, octopodProject);

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
