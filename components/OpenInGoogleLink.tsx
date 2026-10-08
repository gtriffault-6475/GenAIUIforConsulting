import { googleSlidesUrl } from '@/domain/livrable';

// Ouvrir dans Google Slides — opens a Drive livrable's deck in a new tab.
// Secondary look (`.button-later`, as a link), never the primary button nor
// the AI purple. Callers render it only for a Drive livrable with a
// `driveFileId`, outside demo mode. Variants: `button` (editor header),
// `compact` (icon only, named by `aria-label`, Livrables panel), `inline`
// (a plain link inside a sentence, proposal card). `onOpen` lets the editor
// know the deck was opened from this tab, to re-check it on return.
const VARIANT_CLASS = {
  button: 'button-later open-in-google',
  compact: 'open-in-google open-in-google-compact',
  inline: 'open-in-google open-in-google-inline',
} as const;

export function OpenInGoogleLink({
  driveFileId,
  variant = 'button',
  onOpen,
}: {
  driveFileId: string;
  variant?: keyof typeof VARIANT_CLASS;
  onOpen?: () => void;
}) {
  const compact = variant === 'compact';
  return (
    <a
      href={googleSlidesUrl(driveFileId)}
      target="_blank"
      rel="noopener noreferrer"
      className={VARIANT_CLASS[variant]}
      aria-label={compact ? 'Ouvrir dans Google Slides (nouvel onglet)' : undefined}
      title={compact ? 'Ouvrir dans Google Slides' : undefined}
      onClick={onOpen}
      onAuxClick={onOpen}
    >
      <ExternalLinkIcon />
      {!compact && (
        <>
          {variant === 'inline' ? 'ouvrir dans Google Slides' : 'Ouvrir dans Google Slides'}
          <span className="sr-only"> (nouvel onglet)</span>
        </>
      )}
    </a>
  );
}

function ExternalLinkIcon() {
  return (
    <svg
      className="open-in-google-icon"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 3h7v7" />
      <path d="M10 14L21 3" />
      <path d="M21 14v5a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h5" />
    </svg>
  );
}
