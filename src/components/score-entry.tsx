"use client";

import { useEffect, useMemo, useRef, useState, type ClipboardEvent } from "react";
import { createPortal } from "react-dom";
import type { TournamentRound } from "@/components/app-client";
import type { ScoringCourse } from "@/lib/course-catalog";
import { scoreEntryGrossCsv, scoreEntryGrossFilename } from "@/lib/score-entry-export";
import { applyScoreImport, previewScoreImportFile, type ScoreImportPreview } from "@/lib/score-import";
import { clearScoreValues, formatScoreClipboard, parseScoreClipboard, pasteScoreValues } from "@/lib/score-clipboard";
import { addPlayerToRound, addPlayerToTournament, blankPlayer, playerSnapshots, removePlayerFromRound, removePlayerFromTournament, restorePlayerSnapshots, type RemovedPlayerSnapshot } from "@/lib/player-removal";
import { handicapScoreSummary, scoreSummary, type AwardCategory, type Player, type ScoringSystem, type TournamentFormat } from "@/lib/scoring";

const makeBlankPlayers = (count: number): Player[] => Array.from({ length: count }, (_, index) => ({ id: `player-${index + 1}`, name: "", pairing: "", scores: Array(18).fill(null) }));
type SortKey = "original" | "pairing" | "flight" | "hcp" | "gross" | "nett";
type SortState = { key: SortKey; direction: "asc" | "desc" };
const originalSort: SortState = { key: "original", direction: "asc" };
const pairingCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
const completeScorecard = (player: Player) => player.scores.length === 18 && player.scores.every((score) => score !== null);
const normalizedPlayerName = (name: string) => name.trim().replace(/\s+/g, " ").toLocaleLowerCase();
const normalizedPairing = (pairing: string | undefined) => pairing?.trim().toLocaleUpperCase() ?? "";
const flightOrder: Record<string, number> = { A: 0, B: 1, C: 2, SS: 3 };

type PendingRemoval = { id: string; name: string; hasScores: boolean; scope: "round" | "tournament" };
type UndoRemoval = { label: string; snapshots: RemovedPlayerSnapshot[] };
type AddScope = "round" | "tournament";
type ScoreSelection = { playerId: string; startHole: number; endHole: number };
type RowMenuPosition = { left: number; top: number; placement: "above" | "below" };

type Props = {
  tournamentName: string; rounds: TournamentRound[]; courses: Map<number, ScoringCourse>; savedScores: Record<number, Player[]>;
  scoringSystem: ScoringSystem; tournamentFormat: TournamentFormat; jackpotEnabled: boolean; jackpotBlindHoles: number[]; jackpotRevealed: boolean;
  onScoresChange: (scores: Record<number, Player[]>) => void;
  onHandicapChange: (playerId: string, handicap: number | undefined) => void;
  onBack: () => void; onContinue: (scores: Record<number, Player[]>) => void;
};

export function ScoreEntry({ tournamentName, rounds, courses, savedScores, scoringSystem, tournamentFormat, jackpotEnabled, jackpotBlindHoles, jackpotRevealed, onScoresChange, onHandicapChange, onBack, onContinue }: Props) {
  const [roundId, setRoundId] = useState(rounds[0].id);
  const gridInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const scorePointerSelectionRef = useRef(false);
  const scoreImportInputRef = useRef<HTMLInputElement | null>(null);
  const [scoresByRound, setScoresByRound] = useState<Record<number, Player[]>>(() => Object.fromEntries(rounds.map((round) => [round.id, savedScores[round.id] ?? makeBlankPlayers(round.players ?? 0)])));
  useEffect(() => { onScoresChange(scoresByRound); }, [onScoresChange, scoresByRound]);
  const activeRound = rounds.find((round) => round.id === roundId) ?? rounds[0];
  const course = courses.get(activeRound.courseId ?? -1)!;
  const players = useMemo(() => scoresByRound[activeRound.id] ?? [], [activeRound.id, scoresByRound]);
  const [sortByRound, setSortByRound] = useState<Record<number, SortState>>({});
  const [searchByRound, setSearchByRound] = useState<Record<number, string>>({});
  const [pairingFilterByRound, setPairingFilterByRound] = useState<Record<number, string>>({});
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval | null>(null);
  const [openRowMenuId, setOpenRowMenuId] = useState<string | null>(null);
  const [rowMenuPosition, setRowMenuPosition] = useState<RowMenuPosition | null>(null);
  const rowMenuRef = useRef<HTMLDivElement | null>(null);
  const [lastRemoval, setLastRemoval] = useState<UndoRemoval | null>(null);
  const [showAddPlayerDialog, setShowAddPlayerDialog] = useState(false);
  const [pendingFocusPlayerId, setPendingFocusPlayerId] = useState<string | null>(null);
  const [scoreImportPreview, setScoreImportPreview] = useState<ScoreImportPreview | null>(null);
  const [scoreImportError, setScoreImportError] = useState<string | null>(null);
  const [scoreImportFilename, setScoreImportFilename] = useState<string>("" );
  const [scoreSelection, setScoreSelection] = useState<ScoreSelection | null>(null);
  const [scoreClipboardError, setScoreClipboardError] = useState<string | null>(null);
  const activeSort = sortByRound[activeRound.id] ?? originalSort;
  const searchQuery = searchByRound[activeRound.id] ?? "";
  const pairingFilter = pairingFilterByRound[activeRound.id] ?? "";
  const handicapMode = scoringSystem === "handicap";
  const psgcMode = handicapMode && tournamentFormat === "psgc";
  const pairingOptions = useMemo(() => Array.from(new Set(players.map((player) => normalizedPairing(player.pairing)).filter(Boolean))).sort(pairingCollator.compare), [players]);
  const duplicatePlayerIds = useMemo(() => { const names = new Map<string, string[]>(); players.forEach((player) => { const normalized = normalizedPlayerName(player.name); if (normalized) names.set(normalized, [...(names.get(normalized) ?? []), player.id]); }); return new Set(Array.from(names.values()).filter((ids) => ids.length > 1).flat()); }, [players]);
  const displayedPlayers = useMemo(() => {
    const indexed = players.map((player, originalIndex) => ({ player, originalIndex, summary: completeScorecard(player) ? handicapMode ? handicapScoreSummary(player.scores, course.pars!, player.handicap ?? 0) : scoreSummary(player.scores, course.pars!) : null }));
    if (activeSort.key === "original") return indexed;
    if (activeSort.key === "pairing") return indexed.sort((a, b) => { const aPairing = normalizedPairing(a.player.pairing); const bPairing = normalizedPairing(b.player.pairing); if (!aPairing && !bPairing) return a.originalIndex - b.originalIndex; if (!aPairing) return 1; if (!bPairing) return -1; return pairingCollator.compare(aPairing, bPairing) * (activeSort.direction === "asc" ? 1 : -1) || a.originalIndex - b.originalIndex; });
    if (activeSort.key === "flight") { if (!psgcMode) return indexed; return indexed.sort((a, b) => { const aFlight = a.player.awardCategory; const bFlight = b.player.awardCategory; const aValue = aFlight === undefined ? null : flightOrder[aFlight]; const bValue = bFlight === undefined ? null : flightOrder[bFlight]; if (aValue === null && bValue === null) return a.originalIndex - b.originalIndex; if (aValue === null) return 1; if (bValue === null) return -1; return (aValue - bValue) * (activeSort.direction === "asc" ? 1 : -1) || a.originalIndex - b.originalIndex; }); }
    const valueFor = (item: typeof indexed[number]) => activeSort.key === "hcp" ? (handicapMode ? (item.summary && "handicap" in item.summary ? item.summary.handicap : null) : (item.summary && "system36Handicap" in item.summary ? item.summary.system36Handicap : null)) : activeSort.key === "gross" ? item.summary?.gross ?? null : item.summary?.nett ?? null;
    return indexed.sort((a, b) => { const aValue = valueFor(a); const bValue = valueFor(b); if (aValue === null && bValue === null) return a.originalIndex - b.originalIndex; if (aValue === null) return 1; if (bValue === null) return -1; return (aValue - bValue) * (activeSort.direction === "asc" ? 1 : -1) || a.originalIndex - b.originalIndex; });
  }, [activeSort, course.pars, handicapMode, players, psgcMode]);
  const visiblePlayers = displayedPlayers.filter(({ player }) => player.name.toLocaleLowerCase().includes(searchQuery.trim().toLocaleLowerCase()) && (!pairingFilter || normalizedPairing(player.pairing) === pairingFilter));
  const awardCategoryColumn = psgcMode ? (handicapMode ? 2 : 1) : null; const targetStart = 1 + (handicapMode ? 1 : 0) + (psgcMode ? 1 : 0); const pairingColumn = targetStart + (jackpotEnabled ? 2 : 0); const holeStart = pairingColumn + 1; const lastColumn = holeStart + 17;
  const chooseSort = (key: SortKey) => setSortByRound((current) => { const previous = current[activeRound.id] ?? originalSort; return { ...current, [activeRound.id]: key === "original" ? { key, direction: "asc" } : { key, direction: previous.key === key && previous.direction === "asc" ? "desc" : "asc" } }; });
  const moveGridFocus = (event: React.KeyboardEvent<HTMLInputElement>, playerId: string, column: number, isTextField = false) => {
    const { key, currentTarget } = event;
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(key)) return;
    if (isTextField && key === "ArrowLeft" && (currentTarget.selectionStart ?? 0) > 0) return;
    if (isTextField && key === "ArrowRight" && (currentTarget.selectionEnd ?? 0) < currentTarget.value.length) return;
    event.preventDefault(); const currentRow = visiblePlayers.findIndex(({ player }) => player.id === playerId);
    const targetRow = key === "ArrowUp" ? Math.max(0, currentRow - 1) : key === "ArrowDown" ? Math.min(visiblePlayers.length - 1, currentRow + 1) : currentRow;
    const targetColumn = key === "ArrowLeft" ? Math.max(0, column - 1) : key === "ArrowRight" ? Math.min(lastColumn, column + 1) : column;
    const target = visiblePlayers[targetRow]?.player; const input = target && gridInputRefs.current[`${target.id}:${targetColumn}`];
    if (input) { input.focus({ preventScroll: true }); input.select(); input.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" }); }
  };
  const updateScore = (playerId: string, hole: number, raw: string) => { if (raw !== "" && (!/^\d{1,2}$/.test(raw) || Number(raw) < 1 || Number(raw) > 15)) return; setScoresByRound((current) => ({ ...current, [activeRound.id]: current[activeRound.id].map((player) => player.id === playerId ? { ...player, scores: player.scores.map((score, index) => index === hole ? (raw === "" ? null : Number(raw)) : score) } : player) })); };
  const selectScoreCell = (playerId: string, holeIndex: number, extend = false) => {
    setScoreClipboardError(null);
    setScoreSelection((current) => extend && current?.playerId === playerId
      ? { ...current, endHole: holeIndex }
      : { playerId, startHole: holeIndex, endHole: holeIndex });
  };
  const copyScoreRange = (event: ClipboardEvent<HTMLInputElement>, player: Player, holeIndex: number) => {
    const selection = scoreSelection?.playerId === player.id ? scoreSelection : { playerId: player.id, startHole: holeIndex, endHole: holeIndex };
    event.preventDefault();
    event.clipboardData.setData("text/plain", formatScoreClipboard(player.scores, selection.startHole, selection.endHole));
  };
  const pasteScoreRange = (event: ClipboardEvent<HTMLInputElement>, playerId: string, holeIndex: number) => {
    event.preventDefault();
    const parsed = parseScoreClipboard(event.clipboardData.getData("text/plain"));
    if (!parsed.ok) { setScoreClipboardError(parsed.error); return; }
    const pastedLength = Math.min(parsed.values.length, 18 - holeIndex);
    setScoresByRound((current) => ({ ...current, [activeRound.id]: (current[activeRound.id] ?? []).map((player) => player.id === playerId
      ? { ...player, scores: pasteScoreValues(player.scores, holeIndex, parsed.values) }
      : player) }));
    setScoreClipboardError(null);
    setScoreSelection({ playerId, startHole: holeIndex, endHole: holeIndex + pastedLength - 1 });
  };
  const updatePlayerName = (playerId: string, name: string) => setScoresByRound((current) => ({ ...current, [activeRound.id]: current[activeRound.id].map((player) => player.id === playerId ? { ...player, name } : player) }));
  const closeRowMenu = () => { setOpenRowMenuId(null); setRowMenuPosition(null); };
  const toggleRowMenu = (playerId: string, button: HTMLButtonElement) => {
    if (openRowMenuId === playerId) { closeRowMenu(); return; }
    const rect = button.getBoundingClientRect();
    const menuWidth = 178;
    const menuHeight = 126;
    const openAbove = window.innerHeight - rect.bottom < menuHeight + 10 && rect.top > menuHeight + 10;
    setOpenRowMenuId(playerId);
    setRowMenuPosition({
      left: Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8)),
      top: openAbove ? Math.max(8, rect.top - menuHeight - 4) : rect.bottom + 4,
      placement: openAbove ? "above" : "below",
    });
  };
  const clearPlayerScores = (playerId: string) => {
    setScoresByRound((current) => ({ ...current, [activeRound.id]: (current[activeRound.id] ?? []).map((player) => player.id === playerId ? { ...player, scores: clearScoreValues(player.scores) } : player) }));
    setScoreSelection(null);
    setOpenRowMenuId(null);
  };
  const updateAwardCategory = (playerId: string, awardCategory: string, commit = false) => { const next = awardCategory.trim().toLocaleUpperCase(); if (!["", "A", "B", "C", "S", "SS"].includes(next)) return; const normalized = commit && next === "S" ? "" : next; setScoresByRound((current) => ({ ...current, [activeRound.id]: current[activeRound.id].map((player) => player.id === playerId ? { ...player, awardCategory: normalized === "" ? undefined : normalized as AwardCategory } : player) })); };
  const updateJackpotTarget = (playerId: string, section: "front" | "back", raw: string) => { if (raw !== "" && (!/^\d{1,3}(\.\d{0,2})?$/.test(raw) || Number(raw) < 0)) return; const value = raw === "" ? undefined : Number(raw); setScoresByRound((current) => ({ ...current, [activeRound.id]: current[activeRound.id].map((player) => player.id === playerId ? { ...player, ...(section === "front" ? { jackpotTargetFront: value } : { jackpotTargetBack: value }) } : player) })); };
  const updatePairing = (playerId: string, pairing: string) => setScoresByRound((current) => ({ ...current, [activeRound.id]: current[activeRound.id].map((player) => player.id === playerId ? { ...player, pairing } : player) }));
  const changeHandicap = (playerId: string, raw: string) => { if (raw === "") { onHandicapChange(playerId, undefined); setScoresByRound((current) => Object.fromEntries(Object.entries(current).map(([round, items]) => [round, items.map((player) => player.id === playerId ? { ...player, handicap: undefined } : player)]))); return; } if (/^\d{0,2}(\.\d{0,2})?$/.test(raw) && Number(raw) >= 0) { const value = Number(raw); onHandicapChange(playerId, value); setScoresByRound((current) => Object.fromEntries(Object.entries(current).map(([round, items]) => [round, items.map((player) => player.id === playerId ? { ...player, handicap: value } : player)]))); } };
  const summarySpan = handicapMode ? 4 : 6;
  const exportGrossCsv = () => {
    const blob = new Blob([scoreEntryGrossCsv(players, course.pars!)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const download = document.createElement("a");
    download.href = url;
    download.download = scoreEntryGrossFilename(tournamentName, rounds.findIndex((round) => round.id === activeRound.id) + 1);
    document.body.appendChild(download);
    download.click();
    download.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const chooseScoreImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setScoreImportError(null);
    setScoreImportPreview(null);
    setScoreImportFilename(file.name);
    try { setScoreImportPreview(await previewScoreImportFile(file, players)); }
    catch (error) { setScoreImportError(error instanceof Error ? error.message : "The score file could not be read."); }
  };
  const closeScoreImport = () => {
    setScoreImportPreview(null);
    setScoreImportError(null);
    setScoreImportFilename("");
    if (scoreImportInputRef.current) scoreImportInputRef.current.value = "";
  };
  const confirmScoreImport = () => {
    if (!scoreImportPreview?.entries.length) return;
    setScoresByRound((current) => ({ ...current, [activeRound.id]: applyScoreImport(current[activeRound.id] ?? [], scoreImportPreview.entries) }));
    closeScoreImport();
  };
  const confirmPlayerRemoval = () => {
    if (!pendingRemoval) return;
    const affectedRounds = pendingRemoval.scope === "round" ? [activeRound.id] : rounds.map((round) => round.id);
    const snapshots = playerSnapshots(scoresByRound, pendingRemoval.id, affectedRounds);
    setScoresByRound((current) => pendingRemoval.scope === "round"
      ? removePlayerFromRound(current, activeRound.id, pendingRemoval.id)
      : removePlayerFromTournament(current, pendingRemoval.id));
    setLastRemoval({ label: pendingRemoval.name || "Player", snapshots });
    setPendingRemoval(null);
  };
  const undoPlayerRemoval = () => {
    if (!lastRemoval) return;
    setScoresByRound((current) => restorePlayerSnapshots(current, lastRemoval.snapshots));
    setLastRemoval(null);
  };
  const addPlayer = (scope: AddScope) => {
    const id = `player-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const newPlayer = blankPlayer(id);
    setScoresByRound((current) => scope === "round"
      ? addPlayerToRound(current, activeRound.id, newPlayer)
      : addPlayerToTournament(current, rounds.map((round) => round.id), newPlayer));
    setSearchByRound((current) => ({ ...current, [activeRound.id]: "" }));
    setPairingFilterByRound((current) => ({ ...current, [activeRound.id]: "" }));
    setPendingFocusPlayerId(id);
    setShowAddPlayerDialog(false);
  };
  useEffect(() => {
    if (!openRowMenuId) return;
    const dismiss = (event: PointerEvent) => {
      if (rowMenuRef.current?.contains(event.target as Node)) return;
      closeRowMenu();
    };
    const dismissOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") closeRowMenu(); };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", dismissOnEscape);
    window.addEventListener("scroll", closeRowMenu, true);
    window.addEventListener("resize", closeRowMenu);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", dismissOnEscape);
      window.removeEventListener("scroll", closeRowMenu, true);
      window.removeEventListener("resize", closeRowMenu);
    };
  }, [openRowMenuId]);
  useEffect(() => {
    if (!lastRemoval) return;
    const timeout = window.setTimeout(() => setLastRemoval(null), 9000);
    return () => window.clearTimeout(timeout);
  }, [lastRemoval]);
  useEffect(() => {
    if (!pendingFocusPlayerId) return;
    const frame = window.requestAnimationFrame(() => {
      const input = gridInputRefs.current[`${pendingFocusPlayerId}:0`];
      if (input) { input.focus(); input.select(); input.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" }); }
      setPendingFocusPlayerId(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pendingFocusPlayerId, visiblePlayers]);  return <section className="scoring-step"><div className="score-step-heading"><div><p>STEP 2 · {tournamentName}</p><h1>Score entry</h1><span>Enter player names and scores left to right. Tab moves to the next cell; Shift + Tab moves back.</span></div><div className="score-heading-actions"><button className="secondary-button" onClick={onBack}>← Edit tournament</button></div></div>
    <div className="round-tabs">{rounds.map((round, index) => <button className={round.id === activeRound.id ? "active" : ""} key={round.id} onClick={() => setRoundId(round.id)}>Round {index + 1} — {courses.get(round.courseId ?? -1)?.name}</button>)}</div>
    <div className="score-toolbar"><label className="player-search"><input type="search" value={searchQuery} onChange={(event) => setSearchByRound((current) => ({ ...current, [activeRound.id]: event.target.value }))} placeholder="Search player..." aria-label="Search player" />{searchQuery && <button type="button" aria-label="Clear player search" onClick={() => setSearchByRound((current) => ({ ...current, [activeRound.id]: "" }))}>×</button>}</label><label className="pairing-filter"><span>Pairing:</span><select value={pairingFilter} onChange={(event) => setPairingFilterByRound((current) => ({ ...current, [activeRound.id]: event.target.value }))} aria-label="Filter by pairing"><option value="">All Pairings</option>{pairingOptions.map((pairing) => <option key={pairing} value={pairing}>{pairing}</option>)}</select></label><div className="score-sort-controls" aria-label="Sort score entry"><span>Sort:</span>{(["original", "pairing", ...(psgcMode ? ["flight" as const] : []), "hcp", "gross", "nett"] as SortKey[]).map((key) => { const label = key === "original" ? "Original" : key === "pairing" ? "Pairing" : key === "flight" ? "Flight" : key === "hcp" ? handicapMode ? "Handicap" : "HCP 36" : key[0].toUpperCase() + key.slice(1); const selected = activeSort.key === key; return <button type="button" className={selected ? "active" : ""} key={key} onClick={() => chooseSort(key)}>{label}{selected && key !== "original" ? activeSort.direction === "asc" ? " ↑" : " ↓" : ""}</button>; })}</div><input ref={scoreImportInputRef} className="score-import-input" type="file" accept=".xlsx,.xls,.csv" aria-label="Choose score import file" onChange={chooseScoreImportFile} /><button className="secondary-button score-import-button" type="button" onClick={() => scoreImportInputRef.current?.click()}>Import Scores</button><button className="secondary-button score-export-button" type="button" onClick={exportGrossCsv}>Export Gross CSV</button></div>
    {scoreClipboardError && <p className="score-clipboard-error" role="alert">{scoreClipboardError}</p>}
    {visiblePlayers.length ? <div className="score-table-wrap simple-score-table-wrap"><table className={`score-table ${handicapMode ? "handicap-score-table" : ""} ${psgcMode ? "psgc-score-table" : ""} ${jackpotEnabled ? "jackpot-score-table" : ""}`}><colgroup><col className="score-col-number" /><col className="score-col-player" />{handicapMode && <col className="score-col-handicap" />}{psgcMode && <col className="score-col-award-category" />}{jackpotEnabled && <><col className="score-col-jackpot-target" /><col className="score-col-jackpot-target" /></>}<col className="score-col-pairing" />{Array.from({ length: 18 }, (_, index) => <col className="score-col-hole" key={`hole-${index}`} />)}{Array.from({ length: summarySpan }, (_, index) => <col className="score-col-summary" key={`summary-${index}`} />)}</colgroup><thead><tr className="par-row"><th className="sticky-number">Par</th><th className="sticky-player">{course.name.toUpperCase()}</th>{handicapMode && <th className="sticky-handicap" />}{psgcMode && <th className="sticky-award-category" />}{jackpotEnabled && <><th className="sticky-jackpot-front" /><th className="sticky-jackpot-back" /></>}<th className="sticky-pairing" />{course.pars!.map((par, index) => <th key={index}>{par}</th>)}<th colSpan={summarySpan}>{handicapMode ? "HANDICAP" : "SYSTEM 36"}</th></tr><tr className="column-row"><th className="sticky-number">No</th><th className="sticky-player">Player Name</th>{handicapMode && <th className="sticky-handicap">Handicap</th>}{psgcMode && <th className="sticky-award-category">Flight</th>}{jackpotEnabled && <><th className="sticky-jackpot-front">Target 1–9</th><th className="sticky-jackpot-back">Target 10–18</th></>}<th className="sticky-pairing">Pairing</th>{Array.from({ length: 18 }, (_, index) => <th key={index}>{index + 1}</th>)}<th>Front</th><th>Back</th><th>Gross</th>{!handicapMode && <th>HCP 36</th>}<th>Nett</th>{!handicapMode && <th>Point</th>}</tr></thead><tbody>{visiblePlayers.map(({ player, originalIndex, summary }) => { const frontComplete = player.scores.slice(0, 9).every((score) => score !== null); const backComplete = player.scores.slice(9).every((score) => score !== null); const front = frontComplete ? player.scores.slice(0, 9).reduce<number>((total, score) => total + (score ?? 0), 0) : null; const back = backComplete ? player.scores.slice(9).reduce<number>((total, score) => total + (score ?? 0), 0) : null; const handicap = player.handicap; return <tr key={player.id}><td className="sticky-number row-index">{originalIndex + 1}</td><td className={`sticky-player player-name ${duplicatePlayerIds.has(player.id) ? "duplicate-player" : ""}`}><div className="player-name-editor"><input aria-label={`Player name, row ${originalIndex + 1}`} type="text" value={player.name} title={player.name} ref={(element) => { gridInputRefs.current[`${player.id}:0`] = element; }} onChange={(event) => updatePlayerName(player.id, event.target.value)} onKeyDown={(event) => moveGridFocus(event, player.id, 0, true)} onFocus={(event) => event.currentTarget.select()} /><button className="player-row-menu-button" type="button" aria-label={`Player actions for ${player.name || `row ${originalIndex + 1}`}`} aria-expanded={openRowMenuId === player.id} onClick={(event) => toggleRowMenu(player.id, event.currentTarget)}>⋯</button></div>{duplicatePlayerIds.has(player.id) && <small className="duplicate-player-warning">Duplicate player in this round</small>}</td>{handicapMode && <td className="sticky-handicap handicap-cell"><input aria-label={`Handicap, row ${originalIndex + 1}`} type="text" inputMode="decimal" value={handicap ?? ""} title="Handicap" ref={(element) => { gridInputRefs.current[`${player.id}:1`] = element; }} onChange={(event) => changeHandicap(player.id, event.target.value)} onKeyDown={(event) => moveGridFocus(event, player.id, 1)} onFocus={(event) => event.currentTarget.select()} /></td>}{psgcMode && <td className="sticky-award-category award-category-cell"><input aria-label={`Flight, row ${originalIndex + 1}`} type="text" inputMode="text" maxLength={2} value={player.awardCategory ?? ""} ref={(element) => { if (awardCategoryColumn !== null) gridInputRefs.current[`${player.id}:${awardCategoryColumn}`] = element; }} onChange={(event) => updateAwardCategory(player.id, event.target.value)} onBlur={(event) => updateAwardCategory(player.id, event.target.value, true)} onKeyDown={(event) => { if (awardCategoryColumn !== null) moveGridFocus(event, player.id, awardCategoryColumn, true); }} onFocus={(event) => event.currentTarget.select()} /></td>}{jackpotEnabled && <><td className="sticky-jackpot-front jackpot-target-cell"><input aria-label="Target 1–9" type="text" inputMode="decimal" value={player.jackpotTargetFront ?? ""} ref={(element) => { gridInputRefs.current[player.id + ":" + targetStart] = element; }} onChange={(event) => updateJackpotTarget(player.id, "front", event.target.value)} onKeyDown={(event) => moveGridFocus(event, player.id, targetStart, true)} onFocus={(event) => event.currentTarget.select()} /></td><td className="sticky-jackpot-back jackpot-target-cell"><input aria-label="Target 10–18" type="text" inputMode="decimal" value={player.jackpotTargetBack ?? ""} ref={(element) => { gridInputRefs.current[player.id + ":" + (targetStart + 1)] = element; }} onChange={(event) => updateJackpotTarget(player.id, "back", event.target.value)} onKeyDown={(event) => moveGridFocus(event, player.id, targetStart + 1, true)} onFocus={(event) => event.currentTarget.select()} /></td></>}<td className="sticky-pairing pairing-cell"><input aria-label={`Pairing, row ${originalIndex + 1}`} type="text" value={player.pairing ?? ""} ref={(element) => { gridInputRefs.current[`${player.id}:${pairingColumn}`] = element; }} onChange={(event) => updatePairing(player.id, event.target.value)} onBlur={(event) => updatePairing(player.id, normalizedPairing(event.target.value))} onKeyDown={(event) => moveGridFocus(event, player.id, pairingColumn, true)} onFocus={(event) => event.currentTarget.select()} /></td>{player.scores.map((score, holeIndex) => { const difference = score === null ? null : score - course.pars![holeIndex]; const highlight = difference === null ? "" : difference <= -2 ? "score-eagle" : difference === -1 ? "score-birdie" : difference >= 2 ? "score-double-bogey" : difference >= 1 ? "score-bogey" : ""; const rangeStart = scoreSelection?.playerId === player.id ? Math.min(scoreSelection.startHole, scoreSelection.endHole) : -1; const rangeEnd = scoreSelection?.playerId === player.id ? Math.max(scoreSelection.startHole, scoreSelection.endHole) : -1; const inSelectedRange = holeIndex >= rangeStart && holeIndex <= rangeEnd; const rangeClass = inSelectedRange ? ` score-range-selected${holeIndex === rangeStart ? " score-range-start" : ""}${holeIndex === rangeEnd ? " score-range-end" : ""}` : ""; return <td className={"score-cell " + highlight + rangeClass + (jackpotRevealed && jackpotBlindHoles.includes(holeIndex + 1) ? " jackpot-blind-hole" : "")} key={holeIndex}><input aria-label={`${player.name || `Row ${originalIndex + 1}`}, hole ${holeIndex + 1}`} type="text" inputMode="numeric" value={score ?? ""} ref={(element) => { gridInputRefs.current[`${player.id}:${holeIndex + holeStart}`] = element; }} onChange={(event) => updateScore(player.id, holeIndex, event.target.value)} onKeyDown={(event) => moveGridFocus(event, player.id, holeIndex + holeStart)} onFocus={(event) => { if (scorePointerSelectionRef.current) scorePointerSelectionRef.current = false; else selectScoreCell(player.id, holeIndex); event.currentTarget.select(); }} onPointerDown={(event) => { if (event.button === 0) { scorePointerSelectionRef.current = true; selectScoreCell(player.id, holeIndex, event.shiftKey); } }} onPointerEnter={(event) => { if ((event.buttons & 1) === 1) selectScoreCell(player.id, holeIndex, true); }} onCopy={(event) => copyScoreRange(event, player, holeIndex)} onPaste={(event) => pasteScoreRange(event, player.id, holeIndex)} /></td>; })}<td className="summary-cell">{front ?? "—"}</td><td className="summary-cell">{back ?? "—"}</td><td className="summary-cell gross">{summary?.gross ?? "—"}</td>{!handicapMode && <td className="summary-cell">{(summary && "system36Handicap" in summary ? summary.system36Handicap : "—")}</td>}<td className="summary-cell nett">{summary?.nett ?? "—"}</td>{!handicapMode && <td className="summary-cell points">{(summary && "points" in summary ? summary.points : "—")}</td>}</tr>; })}</tbody></table></div> : <p className="no-player-found">No player found</p>}
    {openRowMenuId && rowMenuPosition && typeof document !== "undefined" && (() => {
      const player = players.find((item) => item.id === openRowMenuId);
      if (!player) return null;
      return createPortal(<div ref={rowMenuRef} className="player-row-menu player-row-menu-popover" data-placement={rowMenuPosition.placement} style={{ left: rowMenuPosition.left, top: rowMenuPosition.top }} role="menu"><button type="button" role="menuitem" onClick={() => clearPlayerScores(player.id)}>Clear H1–H18</button><button type="button" role="menuitem" onClick={() => { setPendingRemoval({ id: player.id, name: player.name, hasScores: player.scores.some((score) => score !== null), scope: "round" }); closeRowMenu(); }}>Remove from this round</button><button type="button" role="menuitem" onClick={() => { setPendingRemoval({ id: player.id, name: player.name, hasScores: player.scores.some((score) => score !== null), scope: "tournament" }); closeRowMenu(); }}>Remove from tournament</button></div>, document.body);
    })()}
    {pendingRemoval && <div className="reset-backdrop" role="presentation"><section className="reset-dialog player-remove-dialog" role="dialog" aria-modal="true" aria-labelledby="remove-player-title"><h2 id="remove-player-title">Remove {pendingRemoval.name || "this player"} {pendingRemoval.scope === "round" ? "from this round" : "from tournament"}?</h2><p>{pendingRemoval.scope === "round" ? `This removes the player only from Round ${rounds.findIndex((round) => round.id === activeRound.id) + 1}.` : "This removes the player and all of their scorecards from every round in this tournament."}</p>{pendingRemoval.hasScores && <p className="player-remove-warning">This player already has scoring data. Removing them will delete this scorecard.</p>}<div><button className="secondary-button" type="button" onClick={() => setPendingRemoval(null)}>Cancel</button><button className="reset-confirm-button" type="button" onClick={confirmPlayerRemoval}>Remove</button></div></section></div>}
    {showAddPlayerDialog && <div className="reset-backdrop" role="presentation"><section className="reset-dialog player-add-dialog" role="dialog" aria-modal="true" aria-labelledby="add-player-title"><h2 id="add-player-title">Add player</h2><p>Choose whether the new blank player participates only in this round or in every tournament round.</p><div><button className="secondary-button" type="button" onClick={() => setShowAddPlayerDialog(false)}>Cancel</button><button className="secondary-button" type="button" onClick={() => addPlayer("round")}>Add to this round</button><button className="primary-button" type="button" onClick={() => addPlayer("tournament")}>Add to tournament</button></div></section></div>}
    {(scoreImportPreview || scoreImportError) && <div className="reset-backdrop" role="presentation"><section className="reset-dialog score-import-dialog" role="dialog" aria-modal="true" aria-labelledby="score-import-title"><h2 id="score-import-title">Import scores</h2><p>{scoreImportFilename}</p>{scoreImportError ? <p className="score-import-error">{scoreImportError}</p> : scoreImportPreview && <><div className="score-import-summary"><span>{scoreImportPreview.rowsFound} rows found</span><span>{scoreImportPreview.entries.length} matched and valid</span><span>{scoreImportPreview.unmatched.length} unmatched</span><span>{scoreImportPreview.invalid.length} invalid</span><span>{scoreImportPreview.replacementCount} existing scorecards will be replaced</span></div>{scoreImportPreview.headerError && <p className="score-import-error">{scoreImportPreview.headerError}</p>}{scoreImportPreview.unmatched.length > 0 && <div className="score-import-issues"><b>Unmatched players</b>{scoreImportPreview.unmatched.map((issue) => <span key={`unmatched-${issue.rowNumber}`}>Row {issue.rowNumber}: {issue.name}</span>)}</div>}{scoreImportPreview.invalid.length > 0 && <div className="score-import-issues"><b>Invalid rows</b>{scoreImportPreview.invalid.map((issue) => <span key={`invalid-${issue.rowNumber}`}>Row {issue.rowNumber}: {issue.name} — {issue.reason}</span>)}</div>}</>}<div><button className="secondary-button" type="button" onClick={closeScoreImport}>Cancel</button><button className="primary-button" type="button" disabled={!scoreImportPreview?.entries.length} onClick={confirmScoreImport}>Import Scores</button></div></section></div>}    {lastRemoval && <div className="player-removal-toast" role="status"><span>{lastRemoval.label} removed</span><button type="button" onClick={undoPlayerRemoval}>Undo</button></div>}    <footer className="score-footer"><div className="score-footer-roster"><span>{players.length} players · Par {course.pars!.reduce((total, par) => total + par, 0)}</span><button className="secondary-button add-player-button" type="button" onClick={() => rounds.length === 1 ? addPlayer("round") : setShowAddPlayerDialog(true)}>+ Add Player</button></div><button className="primary-button" onClick={() => onContinue(scoresByRound)}>Continue to Winners →</button></footer>
  </section>;
}
