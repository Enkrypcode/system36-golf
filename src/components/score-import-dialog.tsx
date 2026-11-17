"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { ScoreImportPreview } from "@/lib/score-import";

type Props = {
  preview: ScoreImportPreview | null;
  error: string | null;
  filename: string;
  description: string;
  onClose: () => void;
  onConfirm: () => void;
};

export function ScoreImportDialog({ preview, error, filename, description, onClose, onConfirm }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  return createPortal(
    <dialog ref={dialogRef} className="reset-dialog score-import-dialog" aria-labelledby="score-import-title" onCancel={onClose}>
      <h2 id="score-import-title">Import data</h2>
      <p>{filename}</p>
      <p className="score-import-mode-note">{description}</p>
      {error ? <p className="score-import-error">{error}</p> : preview && <>
        <div className="score-import-summary">
          <span>{preview.rowsFound} rows found</span><span>{preview.matchedCount} matched</span>
          <span>{preview.newPlayerCount} new players</span><span>{preview.unmatched.length} unmatched</span>
          <span>{preview.invalid.length} invalid</span><span>{preview.replacementCount} existing scorecards will be replaced</span>
        </div>
        {preview.headerError && <p className="score-import-error">{preview.headerError}</p>}
        {preview.unmatched.length > 0 && <div className="score-import-issues"><b>Unmatched players</b>{preview.unmatched.map((issue) => <span key={issue.rowNumber}>Row {issue.rowNumber}: {issue.name}</span>)}</div>}
        {preview.invalid.length > 0 && <div className="score-import-issues"><b>Invalid rows</b>{preview.invalid.map((issue) => <span key={issue.rowNumber}>Row {issue.rowNumber}: {issue.name} — {issue.reason}</span>)}</div>}
      </>}
      <div className="score-import-actions">
        <button className="secondary-button" type="button" onClick={onClose}>Cancel</button>
        <button className="primary-button" type="button" disabled={!preview?.entries.length} onClick={onConfirm}>Import data</button>
      </div>
    </dialog>,
    document.body,
  );
}
