'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefCallback,
} from 'react';

// AD-8 — Une seule surface flottante ouverte à la fois.
//
// A single `openOverlayId` value (rather than a stack) is the whole
// mechanism: setting it to a new id implicitly closes whatever was open
// before, because only one id can ever be current. No component may keep
// its own `isOpen` boolean for a floating surface (dropdown, retravail
// field, skill-add entry point, …) — it must call `openOverlay(id)` /
// `closeOverlay()` and derive visibility from `isOverlayOpen(id)`.
//
// Scope of "surface flottante": anything that visually overlays the
// content (dropdown menu, retravail field, skill-add entry point) — not
// inline expansions that grow within the normal flow.
//
// Consumers that want click-outside-to-close must attach `contentRef` to
// the DOM node of their floating panel — a click anywhere else while
// their overlay is open closes it. Escape always closes the open overlay
// regardless of whether a consumer registered a content ref.

type OverlayContextValue = {
  openOverlayId: string | null;
  openOverlay: (id: string) => void;
  closeOverlay: () => void;
  isOverlayOpen: (id: string) => boolean;
  contentRef: RefCallback<HTMLElement>;
};

const OverlayContext = createContext<OverlayContextValue | null>(null);

export function OverlayProvider({ children }: { children: ReactNode }) {
  // Exactly one OverlayProvider may exist (AD-8 names it "the" root-level
  // provider, singular). A second, nested instance would silently split
  // the single-overlay guarantee into two independent contexts, so this
  // fails loudly instead of leaving whichever mount order wins.
  if (useContext(OverlayContext)) {
    throw new Error(
      'OverlayProvider must not be nested — mount exactly one at the root of app/.',
    );
  }

  const [openOverlayId, setOpenOverlayId] = useState<string | null>(null);
  const contentNodeRef = useRef<HTMLElement | null>(null);

  const openOverlay = useCallback((id: string) => {
    // Assigning directly (no merge with previous state) is what makes the
    // "closes the previous overlay automatically" rule unconditional.
    setOpenOverlayId(id);
  }, []);

  const closeOverlay = useCallback(() => {
    setOpenOverlayId(null);
    contentNodeRef.current = null;
  }, []);

  const isOverlayOpen = useCallback(
    (id: string) => openOverlayId === id,
    [openOverlayId],
  );

  const contentRef = useCallback<RefCallback<HTMLElement>>((node) => {
    contentNodeRef.current = node;
  }, []);

  useEffect(() => {
    if (openOverlayId === null) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpenOverlayId(null);
      }
    }

    function handlePointerDown(event: PointerEvent) {
      const node = contentNodeRef.current;
      if (node && event.target instanceof Node && !node.contains(event.target)) {
        setOpenOverlayId(null);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [openOverlayId]);

  const value = useMemo(
    () => ({ openOverlayId, openOverlay, closeOverlay, isOverlayOpen, contentRef }),
    [openOverlayId, openOverlay, closeOverlay, isOverlayOpen, contentRef],
  );

  return (
    <OverlayContext.Provider value={value}>{children}</OverlayContext.Provider>
  );
}

export function useOverlay() {
  const context = useContext(OverlayContext);
  if (!context) {
    throw new Error('useOverlay must be used within an OverlayProvider');
  }
  return context;
}
