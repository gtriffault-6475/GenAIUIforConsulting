'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { getSlideThumbnail } from '@/actions/livrable';
import { googleSlidesSlideUrl } from '@/domain/livrable';

// spec-apercu-diapositives — image of the real slide above a "Diapositive N"
// group of a Drive livrable, rendered by the page only while Google is
// `connected` (never in demo mode, never on a local livrable).
// - Lazy: requested once the group comes within one screen of the document
//   pane (`IntersectionObserver`, root = the pane while it scrolls on its
//   own, the viewport in the single-column layout), never at page open for
//   groups out of view, never while previews are hidden
//   (`data-previews="hidden"` on the pane, set by `SlidePreviewToggle`).
// - The frame reserves a 16:9 box before the image is known, then the real
//   ratio, so the text below does not jump.
// - Shows the slide as saved in Drive (D2); `unsaved` adds a text mark.
// - `slide-previews-refresh` (dispatched after a save or reimport) drops the
//   image and requests it again when in or near view.
export const SLIDE_PREVIEWS_REFRESH_EVENT = 'slide-previews-refresh';

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; url: string; width: number; height: number }
  | { status: 'error' };

function documentPane(element: Element | null): HTMLElement | null {
  return element?.closest<HTMLElement>('.editor-document') ?? null;
}

function previewsHidden(element: Element | null): boolean {
  return documentPane(element)?.getAttribute('data-previews') === 'hidden';
}

export function SlidePreview({
  livrableId,
  driveFileId,
  slideId,
  slideNumber,
  unsaved,
}: {
  livrableId: string;
  driveFileId: string;
  slideId: string;
  slideNumber: number;
  unsaved: boolean;
}) {
  const [state, setState] = useState<State>({ status: 'idle' });
  const frameRef = useRef<HTMLDivElement>(null);
  // Whether the frame is in or near view, kept up to date by the observer.
  const nearRef = useRef(false);
  const stateRef = useRef<State>(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  // Bumped by each request and refresh: a stale answer is ignored.
  const seqRef = useRef(0);

  const request = useCallback(() => {
    if (previewsHidden(frameRef.current)) return;
    const seq = ++seqRef.current;
    // Set at once: a second observer report before the next render must
    // not start a second request.
    stateRef.current = { status: 'loading' };
    setState({ status: 'loading' });
    getSlideThumbnail(livrableId, slideId)
      .then((result) => {
        if (seq !== seqRef.current) return;
        setState(result.ok ? { status: 'ready', ...result.data } : { status: 'error' });
      })
      .catch((error) => {
        console.error('SlidePreview: getSlideThumbnail call failed', error);
        if (seq === seqRef.current) setState({ status: 'error' });
      });
  }, [livrableId, slideId]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || typeof IntersectionObserver === 'undefined') return;
    let observer: IntersectionObserver | null = null;

    function observe() {
      observer?.disconnect();
      const pane = documentPane(frame);
      const paneScrolls =
        pane !== null && ['auto', 'scroll'].includes(getComputedStyle(pane).overflowY);
      const root = paneScrolls ? pane : null;
      const screen = root ? root.clientHeight : window.innerHeight;
      observer = new IntersectionObserver(
        (entries) => {
          const near = entries.some((entry) => entry.isIntersecting);
          nearRef.current = near;
          if (near && stateRef.current.status === 'idle') request();
        },
        { root, rootMargin: `${screen}px 0px` },
      );
      observer.observe(frame as Element);
    }

    observe();
    // The pane scrolls on its own only in the two-pane layout (≥ 1100px).
    const layout = window.matchMedia('(width >= 1100px)');
    layout.addEventListener('change', observe);
    return () => {
      layout.removeEventListener('change', observe);
      observer?.disconnect();
    };
  }, [request]);

  useEffect(() => {
    function onRefresh() {
      seqRef.current += 1;
      stateRef.current = { status: 'idle' };
      setState({ status: 'idle' });
      if (nearRef.current) request();
    }
    window.addEventListener(SLIDE_PREVIEWS_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(SLIDE_PREVIEWS_REFRESH_EVENT, onRefresh);
  }, [request]);

  const ratio =
    state.status === 'ready' ? `${state.width} / ${state.height}` : '16 / 9';

  return (
    <div className="slide-preview">
      <div ref={frameRef} className="slide-preview-frame" style={{ aspectRatio: ratio }}>
        {state.status === 'ready' ? (
          <a
            href={googleSlidesSlideUrl(driveFileId, slideId)}
            target="_blank"
            rel="noopener noreferrer"
            className="slide-preview-link"
          >
            {/* Plain `<img>` with Google's URL (spec: no `next/image`, no proxy). */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={state.url}
              width={state.width}
              height={state.height}
              alt={`Diapositive ${slideNumber}`}
              className="slide-preview-image"
              onError={() => setState({ status: 'error' })}
            />
            <span className="sr-only"> (ouvrir dans Google Slides, nouvel onglet)</span>
          </a>
        ) : state.status === 'error' ? (
          <div className="slide-preview-placeholder slide-preview-failed" role="status">
            <p className="text-caption">Aperçu indisponible</p>
            <button type="button" className="button-later" onClick={request}>
              Réessayer
            </button>
          </div>
        ) : (
          <div className="slide-preview-placeholder" aria-busy={state.status === 'loading'}>
            {state.status === 'loading' && (
              <span className="sr-only">Chargement de l&apos;aperçu…</span>
            )}
          </div>
        )}
      </div>
      {unsaved && (
        <p className="text-caption slide-preview-unsaved">
          Modifications non enregistrées : l&apos;aperçu montre la version Drive.
        </p>
      )}
    </div>
  );
}
