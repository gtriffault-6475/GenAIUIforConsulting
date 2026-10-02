'use server';

import { getDemoModeActive } from '@/actions/demo';
import { getGoogleAccount } from '@/actions/google-connection';
import { googleOAuth, type DriveMode } from '@/integrations';

// Story 5.1 (AD-1, epic-5-context.md "Mode drive") — the single decision
// point for the drive mode. Returns the first true case, in this order:
// `demo` > `unconfigured` > `disconnected` > `connected`. The result is
// passed to `integrations/index.ts`'s `createDriveProvider`, the only
// place a mode becomes a concrete adapter.
//
// Never fails: a failed database read (demo flag or connection row) is
// logged by the action that read it and degrades to `disconnected` — the
// mode in which nothing ever calls Google, so an unreadable demo flag can
// never lead to a Google call while the demo might be active.
export async function resolveDriveMode(): Promise<DriveMode> {
  const demoModeResult = await getDemoModeActive();
  if (!demoModeResult.ok) {
    console.error('resolveDriveMode: demo mode unreadable, falling back to disconnected');
    return 'disconnected';
  }
  if (demoModeResult.data) return 'demo';

  if (!googleOAuth.isConfigured()) return 'unconfigured';

  const accountResult = await getGoogleAccount();
  if (!accountResult.ok) {
    console.error('resolveDriveMode: Google connection unreadable, falling back to disconnected');
    return 'disconnected';
  }

  return accountResult.data ? 'connected' : 'disconnected';
}
