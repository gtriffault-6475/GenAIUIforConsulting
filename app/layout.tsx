import type { Metadata } from 'next';
import { IBM_Plex_Sans, Space_Grotesk } from 'next/font/google';

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

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="fr"
      className={`${spaceGrotesk.variable} ${ibmPlexSans.variable}`}
    >
      <body>
        <OverlayProvider>{children}</OverlayProvider>
      </body>
    </html>
  );
}
