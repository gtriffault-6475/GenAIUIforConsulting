'use client';

import { useLayoutEffect, useRef, useState } from 'react';

// spec-apercu-diapositives (D3) — "Masquer les aperçus" / "Afficher les
// aperçus" in the document card of a Drive livrable, rendered by the page
// only while Google is `connected`. The choice is remembered per browser
// (`localStorage`, any storage failure = default, shown) and applied as
// `data-previews="hidden"` on the document pane: CSS hides the previews and
// `SlidePreview` requests nothing while it is set.
const STORAGE_KEY = 'genai4consulting.slidePreviews';

function readHidden(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'hidden';
  } catch {
    return false;
  }
}

function writeHidden(hidden: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, hidden ? 'hidden' : 'shown');
  } catch {
    // Storage unavailable: the choice lasts for this page only.
  }
}

export function SlidePreviewToggle() {
  const [hidden, setHidden] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Before paint and before any preview's observer reports: the stored
  // choice is applied first, so a hidden preview never requests an image.
  useLayoutEffect(() => {
    setHidden(readHidden());
  }, []);

  useLayoutEffect(() => {
    const pane = buttonRef.current?.closest<HTMLElement>('.editor-document');
    if (!pane) return;
    if (hidden) pane.setAttribute('data-previews', 'hidden');
    else pane.removeAttribute('data-previews');
  }, [hidden]);

  return (
    <div className="slide-preview-toggle">
      <button
        ref={buttonRef}
        type="button"
        className="button-later"
        onClick={() => {
          const next = !hidden;
          writeHidden(next);
          setHidden(next);
        }}
      >
        {hidden ? 'Afficher les aperçus' : 'Masquer les aperçus'}
      </button>
    </div>
  );
}
