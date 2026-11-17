"use client";

import { useEffect, useRef, useState } from "react";
import type { Player } from "@/lib/scoring";
import { addPairing, assignPairing, createPairingDraft, pairingSearchText, type PairingDraft } from "@/lib/pairing-builder";

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

export function PairingBuilder({ players, roundLabel, onApply, onClose }: {
  players: Player[]; roundLabel: string; onApply: (draft: PairingDraft) => void; onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(() => createPairingDraft(players));
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
  const assign = (playerId: string, pairing: string) => setDraft((current) => assignPairing(current, playerId, pairing));
  const create = () => {
    const result = addPairing(draft, code);
    setError(result.error ?? "");
    setDraft(result.draft);
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
    setDraft(next);
    setError("");
  };
  return <dialog className="pairing-builder-dialog" ref={dialogRef} onCancel={onClose}>
    <header><div><h2>Pairing Builder</h2><p>Assign tournament players to pairing groups.</p><small>{roundLabel}</small></div><button type="button" className="secondary-button" aria-label="Close Pairing Builder" onClick={onClose}>×</button></header>
    <div className="pairing-builder-summary"><span>{roster.length} Players</span><span className="pairing-assigned">{roster.length - unassigned.length} Assigned</span><span className={unassigned.length ? "pairing-unassigned" : ""}>{unassigned.length} Unassigned</span><span>{draft.codes.length} Pairings</span></div>
    {roster.length ? <div className="pairing-builder-body">
      <section className="pairing-builder-create">
        <form onSubmit={(event) => { event.preventDefault(); create(); }}><input aria-label="New pairing code" placeholder="Pairing code, e.g. 1A" value={code} onChange={(event) => setCode(event.target.value)} /><button className="secondary-button" type="submit">+ Add Pairing</button></form>
        <details><summary>Auto Create Pairings</summary><div><label>From<input type="number" min="1" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>To<input type="number" min="1" value={to} onChange={(event) => setTo(event.target.value)} /></label><span>A &amp; B</span><button type="button" className="secondary-button" onClick={autoCreate}>Create</button></div></details>
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
    <footer><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="button" className="primary-button" disabled={!roster.length} onClick={() => onApply(draft)}>Apply Pairings</button></footer>
  </dialog>;
}
