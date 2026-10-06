'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition, type FormEvent } from 'react';

import { uploadDocumentToDrive } from '@/actions/document';
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL, UPLOAD_ACCEPT, uploadTargetMimeType } from '@/domain/document';

// spec-upload-document-drive — "Ajouter un document" when Google Drive is
// connected: one file, sent to the project Drive folder (converted to a
// Google format) and ticked as context. Same dropdown surface as
// `AddDocumentForm` (the text form, kept for demo / disconnected modes).
export function UploadDocumentForm({
  projectId,
  onAdded,
}: {
  projectId: string;
  onAdded: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;
    setError(null);
    setNotice(null);

    const file = inputRef.current?.files?.[0];
    if (!file) {
      setError('Choisissez un fichier.');
      return;
    }
    if (file.size === 0) {
      setError('Le fichier est vide.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`Le fichier dépasse ${MAX_UPLOAD_LABEL}.`);
      return;
    }
    if (!uploadTargetMimeType(file.name)) {
      setError("Ce format n'est pas pris en charge.");
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    startTransition(async () => {
      try {
        const result = await uploadDocumentToDrive(projectId, formData);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        if (result.data.contextError) {
          // In Drive, but not ticked: say so instead of closing silently.
          setNotice(`Fichier ajouté dans Drive, mais pas comme contexte : ${result.data.contextError}`);
          // Already in Drive: clear the choice so a second click cannot
          // upload it again.
          if (inputRef.current) inputRef.current.value = '';
          router.refresh();
          return;
        }
        onAdded();
      } catch (callError) {
        console.error('UploadDocumentForm: uploadDocumentToDrive call failed', callError);
        setError("L'envoi du fichier dans Drive a échoué. Réessayez.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} aria-label="Ajouter un document">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        <label className="text-caption" htmlFor="upload-document-file">
          Fichier (Word, PDF, Excel, PowerPoint, OpenDocument, RTF, texte, Markdown, HTML, CSV — {MAX_UPLOAD_LABEL} max.)
        </label>
        <input
          id="upload-document-file"
          ref={inputRef}
          type="file"
          accept={UPLOAD_ACCEPT}
          disabled={isPending}
        />
        <p className="text-caption" style={{ margin: 0 }}>
          Le fichier est ajouté au dossier Drive du projet, converti au format Google, et utilisé
          comme contexte.
        </p>
      </div>

      {error && (
        <p className="text-caption" role="alert" style={{ marginTop: 'var(--space-2)' }}>
          {error}
        </p>
      )}
      {notice && (
        <p className="text-caption" role="status" style={{ marginTop: 'var(--space-2)' }}>
          {notice}
        </p>
      )}

      <button
        type="submit"
        className="button-primary"
        disabled={isPending}
        style={{ marginTop: 'var(--space-3)' }}
      >
        {isPending ? 'Envoi…' : 'Ajouter'}
      </button>
    </form>
  );
}
