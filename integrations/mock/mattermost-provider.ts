import type {
  MattermostMessage,
  MattermostProvider,
} from '../ports/mattermost-provider';

// Round-1 seed data: one credible last message per seed project's
// `mattermostChannelRef` (ids match `integrations/mock/project-provider.ts`)
// — no "mock"/"test" wording, no obviously-fake author or content.
const SEED_MESSAGES: Record<string, MattermostMessage> = {
  'av-acme-rfp': {
    author: 'Camille Roy',
    content:
      "J'ai relu la partie technique du RFP avec Julien, on part sur l'architecture proposée par l'équipe cloud. Je pousse une v1 de la réponse dans le drive avant demain matin.",
    postedAt: '2026-09-15T08:47:00.000Z',
    permalinkUrl:
      'https://mattermost.octo-technology.com/octo/pl/av-acme-rfp-4f2c19',
  },
  'mi-audit-interne': {
    author: 'Thomas Lefèvre',
    content:
      "Retour de l'entretien avec la direction financière : ils confirment l'accès aux journaux de contrôle pour vendredi. Je mets à jour le plan de tests ce soir.",
    postedAt: '2026-09-14T17:12:00.000Z',
    permalinkUrl:
      'https://mattermost.octo-technology.com/octo/pl/mi-audit-interne-9a71e3',
  },
};

// A believable Mattermost read has network latency; see
// `integrations/mock/project-provider.ts` for the same rationale.
function withLatency<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), 180));
}

export const mockMattermostProvider: MattermostProvider = {
  async getLastMessage(channelRef) {
    return withLatency(SEED_MESSAGES[channelRef] ?? null);
  },
};
