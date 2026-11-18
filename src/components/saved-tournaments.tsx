"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { SavedTournament } from "@/lib/tournament-storage";
import { deleteTournamentSnapshot, readTournamentSnapshots, renameTournamentSnapshot, saveTournamentSnapshot, type TournamentSnapshot } from "@/lib/saved-tournaments";

async function requireAdmin(onExpired: () => void) {
  const response = await fetch("/api/admin/session", { cache: "no-store" });
  const session = await response.json();
  if (!response.ok || session.admin !== true) {
    onExpired();
    throw new Error("Unlock Admin Mode to access saved tournaments.");
  }
}

function SnapshotDialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.showModal();
    const dialog = ref.current;
    return () => { dialog?.close(); if (previous instanceof HTMLElement) previous.focus({ preventScroll: true }); };
  }, []);
  return createPortal(<dialog ref={ref} className="reset-dialog snapshot-dialog" aria-label={title} onCancel={(event) => { event.preventDefault(); onClose(); }}><h2>{title}</h2>{children}</dialog>, document.body);
}

export function SaveTournamentButton({ state, disabled, onExpired }: { state: SavedTournament; disabled: boolean; onExpired: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const save = async () => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      await requireAdmin(onExpired);
      saveTournamentSnapshot(window.localStorage, name, state);
      setOpen(false); setNotice("Snapshot saved in this browser.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "The snapshot could not be saved. Browser storage may be full.");
    } finally { setBusy(false); }
  };
  return <>
    <button type="button" className="load-data-button save-tournament-button" disabled={disabled} onClick={() => { setName(state.name); setError(""); setNotice(""); setOpen(true); }}>Save Tournament</button>
    {notice && <span className="snapshot-notice" role="status">{notice}</span>}
    {open && <SnapshotDialog title="Save Current Tournament" onClose={() => { if (!busy) setOpen(false); }}>
      <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <p>Save the current tournament so it can be loaded again later.</p>
        <p>Stored only in this browser on this device.</p>
        <label>Snapshot Name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} required /></label>
        {error && <p className="validation-error" role="alert">{error}</p>}
        <div className="snapshot-actions"><button className="secondary-button" type="button" disabled={busy} onClick={() => setOpen(false)}>Cancel</button><button className="primary-button" type="submit" disabled={busy || !name.trim()}>{busy ? "Saving…" : "Save as New Snapshot"}</button></div>
      </form>
    </SnapshotDialog>}
  </>;
}

export function SavedTournamentList({ onLoad, onExpired }: { onLoad: (snapshot: TournamentSnapshot) => void; onExpired: () => void }) {
  const [snapshots, setSnapshots] = useState<TournamentSnapshot[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ snapshot: TournamentSnapshot; action: "rename" | "delete" } | null>(null);
  const [name, setName] = useState("");
  useEffect(() => {
    let cancelled = false;
    requireAdmin(onExpired).then(() => {
      if (!cancelled) setSnapshots(readTournamentSnapshots(window.localStorage));
    }).catch((error) => { if (!cancelled) setError(error instanceof Error ? error.message : "Saved tournaments could not be read."); });
    return () => { cancelled = true; };
  }, [onExpired]);
  const act = async (action: () => void) => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      await requireAdmin(onExpired);
      action();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Saved tournaments could not be updated.");
    } finally { setBusy(false); }
  };
  return <section className="saved-tournament-list">
    <h3>Saved Tournaments</h3><p>Stored only in this browser on this device.</p>
    {error && <p className="validation-error" role="alert">{error}</p>}
    {!snapshots.length && !error && <p>No saved tournaments yet.</p>}
    {snapshots.map((snapshot) => {
      const courseNames = snapshot.state.rounds.map((round) => snapshot.state.courseData?.find((course) => course.id === round.courseId)?.name).filter(Boolean);
      const playerCount = new Set(Object.values(snapshot.state.tournamentScores).flat().map((player) => player.id)).size;
      return <article key={snapshot.id} data-snapshot-id={snapshot.id}>
        <h4>{snapshot.name}</h4>
        <p>{courseNames.join(" · ") || "Course not selected"}</p>
        <p>{playerCount} players · Saved {new Date(snapshot.savedAt).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3 })}</p>
        <div className="snapshot-actions">
          <button type="button" className="primary-button" disabled={busy} onClick={() => void act(() => {
            const current = readTournamentSnapshots(window.localStorage).find((item) => item.id === snapshot.id);
            if (!current) throw new Error("The saved tournament no longer exists.");
            onLoad(current);
          })}>Load</button>
          <details><summary aria-label={`Manage ${snapshot.name}`}>⋯</summary><button type="button" disabled={busy} onClick={() => { setEditing({ snapshot, action: "rename" }); setName(snapshot.name); }}>Rename</button><button type="button" disabled={busy} onClick={() => setEditing({ snapshot, action: "delete" })}>Delete</button></details>
        </div>
      </article>;
    })}
    {editing && <SnapshotDialog title={editing.action === "rename" ? "Rename saved tournament" : "Delete saved tournament?"} onClose={() => { if (!busy) setEditing(null); }}>
      <form onSubmit={(event) => { event.preventDefault(); void act(() => {
        if (editing.action === "rename") renameTournamentSnapshot(window.localStorage, editing.snapshot.id, name);
        else deleteTournamentSnapshot(window.localStorage, editing.snapshot.id);
        setSnapshots(readTournamentSnapshots(window.localStorage)); setEditing(null);
      }); }}>
        {editing.action === "rename" ? <label>Snapshot Name<input autoFocus required value={name} onChange={(event) => setName(event.target.value)} /></label> : <p>This will permanently remove the saved snapshot “{editing.snapshot.name}”.</p>}
        {error && <p className="validation-error" role="alert">{error}</p>}
        <div className="snapshot-actions"><button className="secondary-button" type="button" disabled={busy} onClick={() => setEditing(null)}>Cancel</button><button className={editing.action === "delete" ? "reset-confirm-button" : "primary-button"} type="submit" disabled={busy || (editing.action === "rename" && !name.trim())}>{editing.action === "rename" ? "Rename" : "Delete"}</button></div>
      </form>
    </SnapshotDialog>}
  </section>;
}
