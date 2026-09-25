import type { Metadata } from 'next';
import { IBM_Plex_Sans, Space_Grotesk } from 'next/font/google';

import { getDemoModeActive } from '@/actions/demo';
import { OverlayProvider } from '@/components/OverlayProvider';

import './globals.css';

// Space Grotesk carries "moments d'orientation" (product name, section
// titles, document title) — IBM Plex Sans carries everything else.
// See DESIGN.md > Typography.
const spaceGrotesk = Space_Grotesk({
  variable: '--font-space-grotesk',
  subsets: ['latin'],
  weight: ['600'],
});

const ibmPlexSans = IBM_Plex_Sans({
  variable: '--font-ibm-plex-sans',
  subsets: ['latin'],
  weight: ['400', '600'],
});

export const metadata: Metadata = {
  title: 'GenAI4Consulting',
  description:
    'Interface de travail agentique interne pour les consultants OCTO.',
};

// spec-toggle-mode-demo-ui.md — reads `getDemoModeActive()` once per
// request (`app/page.tsx`'s `force-dynamic` doesn't apply here, but
// `router.refresh()` re-renders every Server Component on the tree,
// layouts included per Next's own docs on `router.refresh()` — see
// `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-router.md` —
// so a toggle click's `router.refresh()`, `DemoModeToggle.tsx`, picks this
// up immediately) so the banner/border below render on *every* page
// (`/` and `/livrables/[id]` alike, Boundaries: "visibles sur toutes les
// pages") from one single read, rather than each route re-implementing its
// own check. A failed read (logged inside `getDemoModeActive` itself)
// degrades to "inactive" here — the same fail-safe direction as every
// other guarded state in this app (e.g. `app/page.tsx`'s `steps`): never
// crash the whole app's shell over a read this deliberately unimportant
// failing.
export default async function RootLayout({ children }: LayoutProps<'/'>) {
  const demoModeResult = await getDemoModeActive();
  const demoModeActive = demoModeResult.ok ? demoModeResult.data : false;

  return (
    <html
      lang="fr"
      className={`${spaceGrotesk.variable} ${ibmPlexSans.variable}`}
    >
      <body className={demoModeActive ? 'demo-mode-active' : undefined}>
        {/* Always (Boundaries): impossible to miss, on every page, the
            instant the mode démo is active — a border alone (see
            `.demo-mode-active` in `app/globals.css`) could go unnoticed at
            the edge of a large screen, so a full-width banner is the
            primary signal and the border reinforces it. */}
        {demoModeActive && (
          // Texte exact de l'Intent gelé ("MODE DÉMO") -- corrigé en Tour 2
          // (bmad-review, blind-hunter) : le Tour 1 rendait "Mode démo
          // actif", une paraphrase non renégociée du texte approuvé.
          <div className="demo-mode-banner" role="status">
            MODE DÉMO
          </div>
        )}
        <OverlayProvider>{children}</OverlayProvider>
      </body>
    </html>
  );
}
