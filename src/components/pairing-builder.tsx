"use client";

import { useEffect, useRef, useState } from "react";
import type { Player } from "@/lib/scoring";
import { addPairing, assignPairing, createPairingDraft, pairingSearchText, type PairingDraft } from "@/lib/pairing-builder";
import { applyPairingImport, previewPairingImportFile, type PairingImportPreview } from "@/lib/pairing-import";

function PairingCard({ code, players, draft, onAssign }: {
  code: string; players: Player[]; draft: PairingDraft; onAssign: (playerId: string, code: string) => void;
}) {
  const [search, setSearch] = useState("");
  const members = players.filter((player) => draft.assignments[player.id] === code);
  const matches = search.trim() ? players.filter((player) => !draft.assignments[player.id] && pairingSearchText(player.name).includes(pairingSearchText(search))) : [];
  return <article className="pairing-builder-card">
    <h3>{code} <small>— {members.length} players</small></h3>
    <input aria-label={`Search players for ${code}`} placeholder="Search / Add player..." value={search} onChange={(event) => setSearch(event.target.value)} />
    {search.trim() && <div className="pairing-picker-results">
      {matches.length ? matches.map((player) => <button type="button" key={player.id} onClick={() => { onAssign(player.id, code); setSearch(""); }}>{player.name} <span>+</span></button>) : <p>No unassigned players found.</p>}
    </div>}
    <ul>{members.map((player) => <li key={player.id}><span>{player.name}</span><button type="button" aria-label={`Remove ${player.name} from ${code}`} onClick={() => onAssign(player.id, "")}>×</button></li>)}</ul>
  </article>;
}

export function PairingBuilder({ players, savedCodes, saveStatus, roundLabel, onSave, onClose }: {
  players: Player[]; savedCodes: string[]; saveStatus: string; roundLabel: string; onSave: (draft: PairingDraft) => void; onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<PairingImportPreview | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [filename, setFilename] = useState("");
  const [draft, setDraft] = useState(() => createPairingDraft(players, savedCodes));
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("1");
  const [to, setTo] = useState("9");
  const roster = players.filter((player) => player.name.trim());
  const unassigned = roster.filter((player) => !draft.assignments[player.id]);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  const save = (next: PairingDraft) => {
    setDraft(next);
    onSave(next);
  };
  const assign = (playerId: string, pairing: string) => save(assignPairing(draft, playerId, pairing));
  const chooseImport = async (file: File | undefined) => {
    if (!file) return;
    setImporting(true);
    setImportError("");
    setFilename(file.name);
    try {
      const currentPlayers = players.map((player) => ({ ...player, pairing: draft.assignments[player.id] ?? player.pairing }));
      setPreview(await previewPairingImportFile(file, currentPlayers));
    } catch {
      setImportError("Could not read the file. Choose a valid CSV or XLSX with Name and Pairing columns.");
    } finally {
      setImporting(false);
      if (importInput.current) importInput.current.value = "";
    }
  };
  const create = () => {
    const result = addPairing(draft, code);
    setError(result.error ?? "");
    if (!result.error) save(result.draft);
    if (!result.error) setCode("");
  };
  const autoCreate = () => {
    const first = Number(from), last = Number(to);
    if (!Number.isInteger(first) || !Number.isInteger(last) || first < 1 || last < first || last - first > 99) {
      setError("Enter an increasing range starting at 1 or above, with up to 100 numbers.");
      return;
    }
    let next = draft;
    for (let number = first; number <= last; number++) {
      for (const suffix of ["A", "B"]) next = addPairing(next, `${number}${suffix}`).draft;
    }
    save(next);
    setError("");
  };
  return <dialog className="pairing-builder-dialog" ref={dialogRef} onCancel={onClose}>
    <header><div><h2>Pairing Builder</h2><p>Assign tournament players to pairing groups.</p><small>{roundLabel}</small></div><button type="button" className="secondary-button" aria-label="Close Pairing Builder" onClick={onClose}>×</button></header>
    <div className="pairing-builder-summary"><span>{roster.length} Players</span><span className="pairing-assigned">{roster.length - unassigned.length} Assigned</span><span className={unassigned.length ? "pairing-unassigned" : ""}>{unassigned.length} Unassigned</span><span>{draft.codes.length} Pairings</span></div>
    {preview ? <section className="pairing-builder-body pairing-import-preview" aria-label="Pairing import preview">
      <h3>Import Pairings</h3><p>{filename}</p>
      <div className="score-import-summary">
        <span>{preview.rowsFound} rows found</span><span>{preview.entries.length} matched</span>
        <span>{preview.unmatched.length} unmatched</span><span>{preview.invalid.length} invalid</span>
        <span>{preview.replacementCount} existing pairing assignments will be replaced</span>
      </div>
      {preview.headerError && <p role="alert" className="validation-error">{preview.headerError}</p>}
      {preview.unmatched.length > 0 && <div className="score-import-issues"><b>Unmatched</b>{preview.unmatched.map((issue) => <span key={issue.rowNumber}>Row {issue.rowNumber}: {issue.name} — {issue.reason}</span>)}</div>}
      {preview.invalid.length > 0 && <div className="score-import-issues"><b>Invalid</b>{preview.invalid.map((issue) => <span key={issue.rowNumber}>Row {issue.rowNumber}: {issue.name} — {issue.reason}</span>)}</div>}
      {preview.entries.length > 0 && <div className="pairing-import-changes"><table><thead><tr><th>Player</th><th>Current Pairing</th><th>Imported Pairing</th></tr></thead><tbody>{preview.entries.map((entry) => <tr key={entry.playerId}><td>{entry.name}</td><td>{entry.previous || "Unassigned"}</td><td>{entry.pairing || "Unassigned"}</td></tr>)}</tbody></table></div>}
      <div className="pairing-import-actions"><button type="button" className="secondary-button" onClick={() => setPreview(null)}>Cancel</button><button type="button" className="primary-button" disabled={!preview.entries.length || !!preview.headerError || preview.invalid.length > 0} onClick={() => { save(applyPairingImport(draft, preview.entries)); setPreview(null); }}>Apply Pairings</button></div>
    </section> : roster.length ? <div className="pairing-builder-body">
      <section className="pairing-builder-create">
        <form onSubmit={(event) => { event.preventDefault(); create(); }}><input aria-label="New pairing code" placeholder="Pairing code, e.g. 1A" value={code} onChange={(event) => setCode(event.target.value)} /><button className="secondary-button" type="submit">+ Add Pairing</button></form>
        <details><summary>Auto Create Pairings</summary><div><label>From<input type="number" min="1" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>To<input type="number" min="1" value={to} onChange={(event) => setTo(event.target.value)} /></label><span>A &amp; B</span><button type="button" className="secondary-button" onClick={autoCreate}>Create</button></div></details>
        <input type="file" hidden ref={importInput} accept=".csv,.xlsx" aria-label="Choose pairing import file" onChange={(event) => void chooseImport(event.target.files?.[0])} />
        <button type="button" className="secondary-button pairing-import-open" disabled={importing} onClick={() => importInput.current?.click()}>{importing ? "Reading file…" : "Import Pairings"}</button>
        {importError && <p role="alert" className="validation-error">{importError}</p>}
        {error && <p role="alert" className="validation-error">{error}</p>}
      </section>
      <div className="pairing-builder-layout">
        <section className="pairing-builder-unassigned"><h3>Unassigned Players ({unassigned.length})</h3><input aria-label="Search unassigned players" placeholder="Search unassigned players..." value={search} onChange={(event) => setSearch(event.target.value)} />
          {!unassigned.length && <p className="pairing-assigned">✓ All players assigned</p>}
          <ul>{unassigned.filter((player) => pairingSearchText(player.name).includes(pairingSearchText(search))).map((player) => <li key={player.id}><span>{player.name}</span><select aria-label={`Assign ${player.name} to pairing`} value="" onChange={(event) => assign(player.id, event.target.value)}><option value="">Assign…</option>{draft.codes.map((pairing) => <option key={pairing}>{pairing}</option>)}</select></li>)}</ul>
        </section>
        <section className="pairing-builder-cards" aria-label="Pairing groups">{draft.codes.length ? draft.codes.map((pairing) => <PairingCard key={pairing} code={pairing} players={roster} draft={draft} onAssign={assign} />) : <p>Add a pairing to begin assigning players.</p>}</section>
      </div>
    </div> : <p className="pairing-builder-empty">Add or import players before creating pairings.</p>}
    <footer><span role="status" className={saveStatus === "failed" ? "validation-error" : "pairing-assigned"}>{saveStatus === "failed" ? "Could not save. Browser storage may be full." : saveStatus === "saving" ? "Saving…" : "Changes saved automatically"}</span><button type="button" className="primary-button" onClick={onClose}>Done</button></footer>
  </dialog>;
}
