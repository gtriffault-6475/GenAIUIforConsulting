'use client';

import { useState, useTransition, type FormEvent } from 'react';

import { addManualDocument } from '@/actions/document';

// Story 1.4 — Ajout d'un document hors-drive. Body of the form opened by
// `ContextPanel`'s trigger button, inside the shared `OverlayProvider`
// surface (AD-8). Round 1 has no real file upload (no `<input
// type="file">`, no PDF/DOCX parsing) — every field is plain text,
// matching `DOCUMENT.content: text NOT NULL`.
export function AddDocumentForm({
  projectId,
  onAdded,
}: {
  projectId: string;
  onAdded: () => void;
}) {
  const [name, setName] = useState('');
  const [folderPath, setFolderPath] = useState('');
  const [content, setContent] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Ignore a second submit fired before React has committed the
    // `disabled` state from the first — `disabled={isPending}` alone only
    // takes effect after a re-render, which is not synchronous with the
    // event that triggers it.
    if (isPending) return;

    // Clear both error kinds unconditionally before re-validating: a
    // failed submission (`submitError`) must not linger alongside a new
    // validation error if the user then blanks a field and resubmits.
    setValidationError(null);
    setSubmitError(null);

    const trimmedName = name.trim();
    const trimmedContent = content.trim();

    if (!trimmedName || !trimmedContent) {
      // Blocked entirely client-side: no Server Action call below this
      // branch, so no network call is made for a missing required field.
      setValidationError('Le nom et le contenu sont obligatoires.');
      return;
    }

    startTransition(async () => {
      const result = await addManualDocument({
        projectId,
        name: trimmedName,
        folderPath: folderPath.trim() || null,
        content: trimmedContent,
      });

      if (!result.ok) {
        // Form stays open, entered values kept (no state reset here) —
        // matches the spec's "Échec de la Server Action" row.
        setSubmitError(result.error);
        return;
      }

      onAdded();
    });
  }

  return (
    <form onSubmit={handleSubmit} aria-label="Ajouter un document">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        <label className="text-caption" htmlFor="add-document-name">
          Nom
        </label>
        <input
          id="add-document-name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={isPending}
        />
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-1)',
          marginTop: 'var(--space-3)',
        }}
      >
        <label className="text-caption" htmlFor="add-document-folder">
          Dossier (optionnel)
        </label>
        <input
          id="add-document-folder"
          type="text"
          value={folderPath}
          onChange={(event) => setFolderPath(event.target.value)}
          disabled={isPending}
        />
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-1)',
          marginTop: 'var(--space-3)',
        }}
      >
        <label className="text-caption" htmlFor="add-document-content">
          Contenu
        </label>
        <textarea
          id="add-document-content"
          rows={6}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          disabled={isPending}
        />
      </div>

      {validationError && (
        <p className="text-caption" role="alert" style={{ marginTop: 'var(--space-2)' }}>
          {validationError}
        </p>
      )}

      {submitError && (
        <p className="text-caption" role="alert" style={{ marginTop: 'var(--space-2)' }}>
          {submitError}
        </p>
      )}

      <button
        type="submit"
        className="button-primary"
        disabled={isPending}
        style={{ marginTop: 'var(--space-3)' }}
      >
        Ajouter
      </button>
    </form>
  );
}
