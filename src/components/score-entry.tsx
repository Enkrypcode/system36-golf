"use client";

import { useEffect, useMemo, useState } from "react";
import type { TournamentRound } from "@/components/app-client";
import type { ScoringCourse } from "@/lib/course-catalog";
import { pointForScore, scoreSummary, type Player } from "@/lib/scoring";

const makeBlankPlayers = (count: number): Player[] => Array.from({ length: count }, (_, index) => ({
  id: `player-${index + 1}`,
  name: "",
  handicap: 0,
  scores: Array(18).fill(null),
}));
type SortKey = "original" | "hcp" | "gross" | "nett";
type SortState = { key: SortKey; direction: "asc" | "desc" };
const originalSort: SortState = { key: "original", direction: "asc" };

const completeScorecard = (player: Player) => player.scores.length === 18 && player.scores.every((score) => score !== null);

export function ScoreEntry({ tournamentName, rounds, courses, savedScores, onScoresChange, onBack, onContinue }: { tournamentName: string; rounds: TournamentRound[]; courses: Map<number, ScoringCourse>; savedScores: Record<number, Player[]>; onScoresChange: (scores: Record<number, Player[]>) => void; onBack: () => void; onContinue: (scores: Record<number, Player[]>) => void }) {
  const [roundId, setRoundId] = useState(rounds[0].id);
  const [scoresByRound, setScoresByRound] = useState<Record<number, Player[]>>(() => Object.fromEntries(rounds.map((round) => {
    const restored = savedScores[round.id];
    return [round.id, restored?.length === round.players ? restored : makeBlankPlayers(round.players ?? 0)];
  })));
  useEffect(() => { onScoresChange(scoresByRound); }, [onScoresChange, scoresByRound]);
  const activeRound = rounds.find((round) => round.id === roundId) ?? rounds[0];
  const course = courses.get(activeRound.courseId ?? -1)!;
  const players = scoresByRound[activeRound.id];
  const [sortByRound, setSortByRound] = useState<Record<number, SortState>>({});
  const [searchByRound, setSearchByRound] = useState<Record<number, string>>({});
  const activeSort = sortByRound[activeRound.id] ?? originalSort;
  const searchQuery = searchByRound[activeRound.id] ?? "";
  const displayedPlayers = useMemo(() => {
    const indexed = players.map((player, originalIndex) => ({ player, originalIndex, summary: completeScorecard(player) ? scoreSummary(player.scores, course.pars!) : null }));
    if (activeSort.key === "original") return indexed;
    const valueFor = (item: typeof indexed[number]) => activeSort.key === "hcp" ? item.summary?.system36Handicap ?? null : activeSort.key === "gross" ? item.summary?.gross ?? null : item.summary?.nett ?? null;
    return indexed.sort((a, b) => {
      const aValue = valueFor(a); const bValue = valueFor(b);
      if (aValue === null && bValue === null) return a.originalIndex - b.originalIndex;
      if (aValue === null) return 1;
      if (bValue === null) return -1;
      return (aValue - bValue) * (activeSort.direction === "asc" ? 1 : -1) || a.originalIndex - b.originalIndex;
    });
  }, [activeSort, course.pars, players]);
  const chooseSort = (key: SortKey) => setSortByRound((current) => {
    const previous = current[activeRound.id] ?? originalSort;
    return { ...current, [activeRound.id]: key === "original" ? { key, direction: "asc" } : { key, direction: previous.key === key && previous.direction === "asc" ? "desc" : "asc" } };
  });
  const visiblePlayers = displayedPlayers.filter(({ player }) => player.name.toLocaleLowerCase().includes(searchQuery.trim().toLocaleLowerCase()));
  const updateScore = (playerId: string, hole: number, raw: string) => {
    if (raw !== "" && (!/^\d{1,2}$/.test(raw) || Number(raw) < 1 || Number(raw) > 15)) return;
    setScoresByRound((current) => ({ ...current, [activeRound.id]: current[activeRound.id].map((player) => player.id === playerId ? { ...player, scores: player.scores.map((score, index) => index === hole ? (raw === "" ? null : Number(raw)) : score) } : player) }));
  };
  const updatePlayerName = (playerId: string, name: string) => setScoresByRound((current) => ({ ...current, [activeRound.id]: current[activeRound.id].map((player) => player.id === playerId ? { ...player, name } : player) }));
  return <section className="scoring-step"><div className="score-step-heading"><div><p>STEP 2 · {tournamentName}</p><h1>Score entry</h1><span>Enter player names and scores left to right. Tab moves to the next cell; Shift + Tab moves back.</span></div><div className="score-heading-actions"><button className="secondary-button" onClick={onBack}>← Edit tournament</button></div></div>
    <div className="round-tabs">{rounds.map((round, index) => <button className={round.id === activeRound.id ? "active" : ""} key={round.id} onClick={() => setRoundId(round.id)}>Round {index + 1} — {courses.get(round.courseId ?? -1)?.name}</button>)}</div>
    <div className="score-toolbar"><label className="player-search"><input type="search" value={searchQuery} onChange={(event) => setSearchByRound((current) => ({ ...current, [activeRound.id]: event.target.value }))} placeholder="Search player..." aria-label="Search player" />{searchQuery && <button type="button" aria-label="Clear player search" onClick={() => setSearchByRound((current) => ({ ...current, [activeRound.id]: "" }))}>×</button>}</label><div className="score-sort-controls" aria-label="Sort score entry"><span>Sort:</span>{(["original", "hcp", "gross", "nett"] as SortKey[]).map((key) => { const label = key === "original" ? "Original" : key === "hcp" ? "HCP 36" : key[0].toUpperCase() + key.slice(1); const selected = activeSort.key === key; return <button type="button" className={selected ? "active" : ""} key={key} onClick={() => chooseSort(key)}>{label}{selected && key !== "original" ? activeSort.direction === "asc" ? " ↑" : " ↓" : ""}</button>; })}</div></div>
    {visiblePlayers.length ? <div className="score-table-wrap simple-score-table-wrap"><table className="score-table"><thead><tr className="par-row"><th className="sticky-number">Par</th><th className="sticky-player">{course.name.toUpperCase()}</th>{course.pars!.map((par, index) => <th key={index}>{par}</th>)}<th colSpan={6}>SYSTEM 36</th></tr><tr className="column-row"><th className="sticky-number">No</th><th className="sticky-player">Player Name</th>{Array.from({ length: 18 }, (_, index) => <th key={index}>{index + 1}</th>)}<th>Front</th><th>Back</th><th>Gross</th><th>HCP 36</th><th>Nett</th><th>Point</th></tr></thead><tbody>{visiblePlayers.map(({ player, originalIndex, summary }) => { const frontComplete = player.scores.slice(0, 9).every((score) => score !== null); const backComplete = player.scores.slice(9).every((score) => score !== null); const front = frontComplete ? player.scores.slice(0, 9).reduce<number>((total, score) => total + (score ?? 0), 0) : null; const back = backComplete ? player.scores.slice(9).reduce<number>((total, score) => total + (score ?? 0), 0) : null; return <tr key={player.id}><td className="sticky-number row-index">{originalIndex + 1}</td><td className="sticky-player player-name"><input aria-label={`Player name, row ${originalIndex + 1}`} type="text" value={player.name} onChange={(event) => updatePlayerName(player.id, event.target.value)} onFocus={(event) => event.currentTarget.select()} /></td>{player.scores.map((score, holeIndex) => { const highlight = score !== null && pointForScore(score, course.pars![holeIndex]) >= 3 ? "good-score" : ""; return <td className={`score-cell ${highlight}`} key={holeIndex}><input aria-label={`${player.name || `Row ${originalIndex + 1}`}, hole ${holeIndex + 1}`} type="text" inputMode="numeric" value={score ?? ""} onChange={(event) => updateScore(player.id, holeIndex, event.target.value)} onFocus={(event) => event.currentTarget.select()} /></td>; })}<td className="summary-cell">{front ?? "—"}</td><td className="summary-cell">{back ?? "—"}</td><td className="summary-cell gross">{summary?.gross ?? "—"}</td><td className="summary-cell">{summary?.system36Handicap ?? "—"}</td><td className="summary-cell nett">{summary?.nett ?? "—"}</td><td className="summary-cell points">{summary?.points ?? "—"}</td></tr>; })}</tbody></table></div> : <p className="no-player-found">No player found</p>}
    <footer className="score-footer"><span>{players.length} players · Par {course.pars!.reduce((total, par) => total + par, 0)}</span><button className="primary-button" onClick={() => onContinue(scoresByRound)}>Continue to Winners →</button></footer>
  </section>;
}
