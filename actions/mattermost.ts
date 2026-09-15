'use server';

import type { ActionResult } from '@/actions/types';
import { mattermostProvider } from '@/integrations';
import type { MattermostMessage } from '@/integrations/ports/mattermost-provider';

// AD-2 — this is the only file allowed to call `mattermostProvider`.
// Components never touch `integrations/` directly; they call this Server
// Action. Unlike `actions/document.ts`, this story never touches a
// table: the spec is explicit that a Mattermost preview is never reused
// elsewhere as context, so it's read straight from the provider on every
// render rather than synced into DB first.

export async function getLastMattermostMessage(
  channelRef: string,
): Promise<ActionResult<MattermostMessage | null>> {
  try {
    const message = await mattermostProvider.getLastMessage(channelRef);
    return { ok: true, data: message };
  } catch (error) {
    console.error('getLastMattermostMessage failed', error);
    return {
      ok: false,
      error: 'Impossible de récupérer le dernier message Mattermost.',
    };
  }
}
