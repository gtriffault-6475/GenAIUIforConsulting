// AD-1 (Ports & Adapters) — `actions/` and `domain/` reach a project's
// Mattermost channel only through this interface, never through a
// concrete adapter. Round 1 wires `integrations/mock/mattermost-provider.ts`
// behind it at the single injection point, `integrations/index.ts`.
// Mirrors `integrations/ports/drive-provider.ts` exactly.

export type MattermostMessage = {
  author: string;
  content: string;
  postedAt: string;
  permalinkUrl: string;
};

export interface MattermostProvider {
  getLastMessage(channelRef: string): Promise<MattermostMessage | null>;
}
