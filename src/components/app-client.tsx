"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CourseCombobox } from "@/components/course-combobox";
import { ScoreEntry } from "@/components/score-entry";
import type { ScoringCourse } from "@/lib/course-catalog";
import type { Player } from "@/lib/scoring";
import { calculateTournamentWinners, type Award } from "@/lib/winner-engine";
import { parseSavedTournament, serializeTournament, TOURNAMENT_STORAGE_KEY, type SavedTournament } from "@/lib/tournament-storage";
import { loadKbpJngTestFixture } from "@/lib/real-test-fixture";
import { exportFilename, winnerCsv } from "@/lib/winner-export";

type Step = 1 | 2 | 3;
export type TournamentRound = { id: number; courseId: number | null; players: number | null };

const blankRound = (id: number): TournamentRound => ({ id, courseId: null, players: null });
const awardMetric = (award: Award) => award.code.startsWith("BG") ? "Gross" : "Nett";
const tieBreakStage = (award: Award) => award.countbackStage === "HCP" ? "Lower HCP" : award.countbackStage;
const tieBreakOpponents = (award: Award) => !award.tiedOpponents?.length ? "" : award.tiedOpponents.length <= 3 ? award.tiedOpponents.map((player) => player.name).join(", ") : `${award.tiedOpponents.length} tied players`;

export function SimpleTournamentTool({ courses }: { courses: ScoringCourse[] }) {
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState("");
  const [roundCount, setRoundCount] = useState(1);
  const [rounds, setRounds] = useState<TournamentRound[]>([blankRound(1)]);
  const [flights, setFlights] = useState(2);
  const [flightLimits, setFlightLimits] = useState<number[]>([12]);
  const [expandedFlights, setExpandedFlights] = useState<Record<string, boolean>>({});
  const [tournamentScores, setTournamentScores] = useState<Record<number, Player[]>>({});
  const [storageReady, setStorageReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saving" | "saved" | "failed">("saved");
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [showLoadDataDialog, setShowLoadDataDialog] = useState(false);
  const [showReplaceDataDialog, setShowReplaceDataDialog] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [fixtureLoadError, setFixtureLoadError] = useState("");
  const [scoreEntryRevision, setScoreEntryRevision] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [exportTimestamp, setExportTimestamp] = useState("");
  const restoreTimerRef = useRef<number | null>(null);
  const restoreHandledRef = useRef(false);
  const exportSheetRef = useRef<HTMLDivElement | null>(null);
  const courseById = useMemo(() => new Map(courses.map((course) => [course.id, course])), [courses]);

  const updateRound = (id: number, patch: Partial<TournamentRound>) => {
    setRounds((current) => current.map((round) => round.id === id ? { ...round, ...patch } : round));
    if (patch.courseId !== undefined || patch.players !== undefined) setTournamentScores((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  };
  const changeRoundCount = (count: number) => {
    setRoundCount(count);
    setRounds((current) => Array.from({ length: count }, (_, index) => current[index] ?? blankRound(index + 1)));
    setTournamentScores((current) => Object.fromEntries(Object.entries(current).filter(([id]) => Number(id) <= count)));
  };
  const canScore = name.trim().length > 0 && rounds.length === roundCount && rounds.every((round) => typeof round.players === "number" && round.players > 0 && round.courseId !== null && courseById.get(round.courseId)?.pars);
  const winnerResult = useMemo(() => calculateTournamentWinners(rounds.map((round) => ({ id: round.id, pars: courseById.get(round.courseId ?? -1)?.pars ?? [], players: tournamentScores[round.id] ?? [] })), flights, flightLimits), [courseById, flightLimits, flights, rounds, tournamentScores]);
  const hcpRange = winnerResult.eligible.length ? `${Math.min(...winnerResult.eligible.map((player) => player.averageHcp36)).toFixed(1)}–${Math.max(...winnerResult.eligible.map((player) => player.averageHcp36)).toFixed(1)}` : "—";
  const flightRange = (index: number) => index === 0
    ? `HCP ≤ ${flightLimits[0]}`
    : index === flights - 1
      ? `HCP > ${flightLimits[index - 1]}`
      : `HCP ${flightLimits[index - 1]}–${flightLimits[index]}`;
  const hasTournamentData = name.trim().length > 0 || rounds.some((round) => round.courseId !== null || round.players !== null) || Object.keys(tournamentScores).length > 0;
  const hasMeaningfulTournament = name.trim().length > 0 || rounds.some((round) => round.courseId !== null) || Object.values(tournamentScores).some((players) => players.some((player) => player.name.trim().length > 0 || player.scores.some((score) => score !== null)));
  const flightAwardSections = Array.from({ length: flights }, (_, index): [string, string[]] => {
    const flight = String.fromCharCode(65 + index);
    return [`Flight ${flight}`, [`BG${flight}`, `BN 1 ${flight}`, `BN 2 ${flight}`]];
  });
  const awardSections: Array<[string, string[]]> = [["Overall", ["BGO", "BNO"]], ...flightAwardSections];
  const roundSummary = rounds.map((round, index) => `Round ${index + 1} — ${courseById.get(round.courseId ?? -1)?.name ?? "Course not selected"}`);

  useEffect(() => {
    restoreTimerRef.current = window.setTimeout(() => {
      if (restoreHandledRef.current) return;
      restoreHandledRef.current = true;
      const saved = parseSavedTournament(window.localStorage.getItem(TOURNAMENT_STORAGE_KEY));
      if (saved) {
        const restoredRounds = saved.rounds.map((round) => ({ ...round, courseId: round.courseId !== null && courseById.has(round.courseId) ? round.courseId : null }));
        setStep(saved.step);
        setName(saved.name);
        setRoundCount(saved.roundCount);
        setRounds(restoredRounds);
        setTournamentScores(saved.tournamentScores);
        setFlights(saved.flights);
        setFlightLimits(saved.flightLimits);
      }
      setStorageReady(true);
    }, 0);
    return () => { if (restoreTimerRef.current !== null) window.clearTimeout(restoreTimerRef.current); };
  }, [courseById]);

  useEffect(() => {
    if (!storageReady || !hasTournamentData) return;
    const timeout = window.setTimeout(() => {
      const saved: SavedTournament = { version: 1, step, name, roundCount, rounds, tournamentScores, flights, flightLimits };
      try { window.localStorage.setItem(TOURNAMENT_STORAGE_KEY, serializeTournament(saved)); setSaveStatus("saved"); } catch { setSaveStatus("failed"); }
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [flightLimits, flights, hasTournamentData, name, roundCount, rounds, step, storageReady, tournamentScores]);

  const startNewTournament = () => {
    if (resetting) return;
    setResetting(true);
    restoreHandledRef.current = true;
    if (restoreTimerRef.current !== null) window.clearTimeout(restoreTimerRef.current);
    try { window.localStorage.removeItem(TOURNAMENT_STORAGE_KEY); } catch { /* The in-memory reset still succeeds. */ }
    setStep(1);
    setName("");
    setRoundCount(1);
    setRounds([blankRound(1)]);
    setTournamentScores({});
    setFlights(2);
    setFlightLimits([12]);
    setExpandedFlights({});
    setShowResetDialog(false);
    setResetting(false);
  };
  const loadKbpJngTestData = () => {
    restoreHandledRef.current = true;
    if (restoreTimerRef.current !== null) window.clearTimeout(restoreTimerRef.current);
    setStorageReady(true);
    const fixture = loadKbpJngTestFixture(courses);
    if (!fixture) { setFixtureLoadError("Historical data could not be matched to the local course catalog."); return; }
    setName(fixture.name);
    setRoundCount(fixture.rounds.length);
    setRounds(fixture.rounds);
    setTournamentScores(fixture.scores);
    setFlights(2);
    setFlightLimits([12]);
    setExpandedFlights({});
    setFixtureLoadError("");
    setScoreEntryRevision((current) => current + 1);
    setShowLoadDataDialog(false);
    setShowReplaceDataDialog(false);
    setStep(2);
  };
  const requestHistoricalDataLoad = () => {
    if (hasMeaningfulTournament) { setShowLoadDataDialog(false); setShowReplaceDataDialog(true); return; }
    loadKbpJngTestData();
  };
  const download = (url: string, filename: string) => {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const exportCsv = () => {
    const blob = new Blob([winnerCsv(winnerResult.awards, rounds.length)], { type: "text/csv;charset=utf-8" });
    download(URL.createObjectURL(blob), exportFilename(name, "csv"));
  };
  const saveWinnersImage = async () => {
    if (!exportSheetRef.current || isExporting) return;
    setIsExporting(true);
    setExportError("");
    setExportTimestamp(new Date().toLocaleString());
    try {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(exportSheetRef.current, { backgroundColor: "#ffffff", cacheBust: true, pixelRatio: 1 });
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = exportFilename(name, "png");
      link.click();
    } catch {
      setExportError("Could not create the Winners image. Please try again.");
    } finally { setIsExporting(false); }
  };

  return <main className="simple-tool">
    <header className="simple-header"><div className="simple-brand"><b>36</b><span>System 36 <small>Tournament Scoring</small></span></div><div className="stepper">{([1, 2, 3] as Step[]).map((item) => <span className={step === item ? "active" : step > item ? "done" : ""} key={item}><b>{item}</b>{item === 1 ? "Tournament" : item === 2 ? "Score Entry" : "Winners"}</span>)}</div><span className={`autosave-status ${saveStatus}`} role="status">{saveStatus === "saving" ? "Saving..." : saveStatus === "failed" ? "Save failed" : "✓ Saved"}</span><button className="load-data-button" type="button" onClick={() => setShowLoadDataDialog(true)}>Load Data</button><button className="new-tournament-button" type="button" onClick={() => setShowResetDialog(true)}>New Tournament</button></header>
    <section className="simple-content">
      {step === 1 && <section className="setup-step"><div className="step-intro"><p>STEP 1</p><h1>Tournament setup</h1><span>Choose the tournament and its rounds. Course pars load automatically.</span></div>{fixtureLoadError && <p className="validation-error">{fixtureLoadError}</p>}
        <label className="wide-field">Tournament name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Enter tournament name" /></label>
        <label className="round-count">How many rounds?<select value={roundCount} onChange={(event) => changeRoundCount(Number(event.target.value))}>{[1,2,3,4,5].map((count) => <option key={count} value={count}>{count}</option>)}</select></label>
        <div className="round-setup-list">{rounds.map((round, index) => { const course = round.courseId === null ? undefined : courseById.get(round.courseId); return <article key={round.id} className="round-setup"><b>Round {index + 1}</b><label>Golf course<CourseCombobox courses={courses} selectedCourse={course} onSelect={(selected) => updateRound(round.id, { courseId: selected.id })} /></label><label>Number of players<input type="text" inputMode="numeric" value={round.players ?? ""} placeholder="Enter number of players" onChange={(event) => { if (event.target.value === "") { updateRound(round.id, { players: null }); return; } const value = Number(event.target.value); if (Number.isInteger(value) && value >= 1 && value <= 200) updateRound(round.id, { players: value }); }} /></label><span className={course ? (course.pars ? "par-ready" : "par-missing") : "par-empty"}>{course ? (course.pars ? `Par ${course.pars.reduce((total, par) => total + par, 0)} loaded automatically` : "Unavailable for scoring — missing or invalid PAR data") : "Select a course to load PAR"}</span></article>; })}</div>
        <div className="step-action"><button className="primary-button" disabled={!canScore} onClick={() => setStep(2)}>Continue to Score Entry →</button>{!canScore && <small>Choose valid courses with complete hole PAR data to continue.</small>}</div>
      </section>}
      {step === 2 && <ScoreEntry key={scoreEntryRevision} tournamentName={name} rounds={rounds} courses={courseById} savedScores={tournamentScores} onScoresChange={setTournamentScores} onBack={() => setStep(1)} onContinue={(scores) => { setTournamentScores(scores); setStep(3); }} />}
      {step === 3 && <section className="awards-step">
        <div className="step-intro"><p>STEP 3</p><h1>Winners & awards</h1><span>Only players with a complete scorecard in every round are eligible for final awards.</span></div>
        <div className="winner-export-actions"><button className="secondary-button" type="button" disabled={isExporting} onClick={saveWinnersImage}>{isExporting ? "Saving…" : "Save as Image"}</button><button className="secondary-button" type="button" onClick={exportCsv}>Export CSV</button></div>
        {exportError && <p className="validation-error">{exportError}</p>}
        <label className="round-count">Number of flights
          <select value={flights} onChange={(event) => {
            const count = Number(event.target.value);
            setFlights(count);
            setFlightLimits((current) => Array.from({ length: count - 1 }, (_, index) => current[index] ?? (index + 1) * 12));
          }}>{[1, 2, 3].map((count) => <option key={count} value={count}>{count}</option>)}</select>
        </label>
        {flightLimits.map((limit, index) => <label className="flight-limit" key={index}>Maximum Handicap — Flight {String.fromCharCode(65 + index)}
          <input type="text" inputMode="decimal" value={limit} onChange={(event) => {
            const value = Number(event.target.value);
            if (!Number.isNaN(value)) setFlightLimits((current) => current.map((item, itemIndex) => itemIndex === index ? value : item));
          }} />
        </label>)}
        <p className="flight-ranges">{Array.from({ length: flights }, (_, index) => `Flight ${String.fromCharCode(65 + index)}: ${flightRange(index)}`).join(" · ")}</p>
        <p className="flight-ranges">Tournament HCP: {hcpRange} · {Array.from({ length: flights }, (_, index) => `Flight ${String.fromCharCode(65 + index)}: ${winnerResult.flights[String.fromCharCode(65 + index)]?.length ?? 0} players`).join(" · ")}</p>
        {winnerResult.validationError && <p className="validation-error">{winnerResult.validationError}</p>}
        <p className="eligibility-summary">Eligible: <b>{winnerResult.eligible.length}</b> players <span>•</span> Not eligible: <b>{winnerResult.notEligible}</b> players</p><aside className="tie-break-rules"><b>Tie-break Rules</b><span><strong>Nett awards</strong> Lower HCP → CB9 → CB6 → CB3 → CB1</span><span><strong>Gross awards</strong> CB9 → CB6 → CB3 → CB1</span><small>Applied only when the primary result is tied.</small></aside>
        <div className="flight-memberships">
          {Array.from({ length: flights }, (_, index) => {
            const flight = String.fromCharCode(65 + index);
            const members = winnerResult.flights[flight] ?? [];
            const expanded = expandedFlights[flight] ?? false;
            return <section className="flight-membership" key={flight}>
              <button type="button" onClick={() => setExpandedFlights((current) => ({ ...current, [flight]: !expanded }))}>
                <span>Flight {flight} — {members.length} players <small>· {flightRange(index)}</small></span>
                <b>{expanded ? "Hide players" : "View players"}</b>
              </button>
              {expanded && <ol>{members.map((player) => <li key={player.key}><span>{player.name}</span><small>HCP {player.averageHcp36.toFixed(1)}</small></li>)}</ol>}
            </section>;
          })}
        </div>
        <div className="award-grid">
          {awardSections.map(([title, codes]) => <article key={title}>
            <p>{title}</p>
            {codes.map((code) => {
              const award = winnerResult.awards.find((item) => item.code === code);
              return <div className="award-result" key={code}><b>{code}</b>{award?.winner ? <span>
                <strong>{award.winner.name}</strong>
                <small>{awardMetric(award)} {awardMetric(award) === "Gross" ? award.winner.aggregateGross : award.winner.aggregateNett}</small>
                <em>{(awardMetric(award) === "Gross" ? award.winner.roundGross : award.winner.roundNett).map((value, index) => `R${index + 1} ${value}`).join(" + ")}</em>
                {award.countbackStage && <em>Tie-break: {tieBreakStage(award)}{tieBreakOpponents(award) && <><br />vs {tieBreakOpponents(award)}</>}</em>}
              </span> : <span>{award?.tied ? "TIE — Manual Decision" : title === "Overall" ? "No eligible player" : "No player in this flight"}</span>}</div>;
            })}
          </article>)}
        </div>
        <button className="secondary-button" onClick={() => setStep(2)}>← Back to Score Entry</button>
      </section>}
    </section>
    {showResetDialog && <div className="reset-backdrop" role="presentation"><section className="reset-dialog" role="dialog" aria-modal="true" aria-labelledby="reset-title"><h2 id="reset-title">Start a new tournament?</h2><p>Your current tournament data, player names, scores, rounds, and winner settings will be cleared. This action cannot be undone.</p><div><button className="secondary-button" type="button" disabled={resetting} onClick={() => setShowResetDialog(false)}>Cancel</button><button className="reset-confirm-button" type="button" disabled={resetting} onClick={startNewTournament}>{resetting ? "Starting…" : "Start New Tournament"}</button></div></section></div>}
    {showLoadDataDialog && <div className="reset-backdrop" role="presentation"><section className="load-data-dialog" role="dialog" aria-modal="true" aria-labelledby="load-data-title"><h2 id="load-data-title">Load Tournament Data</h2><article><h3>KBP &amp; JNG Historical Data</h3><p>Round 1: Parahyangan Golf Bandung <b>40 players</b></p><p>Round 2: Jatinangor National Golf &amp; Resort <b>29 players</b></p></article><div><button className="secondary-button" type="button" onClick={() => setShowLoadDataDialog(false)}>Cancel</button><button className="primary-button" type="button" onClick={requestHistoricalDataLoad}>Load</button></div></section></div>}
    {showReplaceDataDialog && <div className="reset-backdrop" role="presentation"><section className="reset-dialog" role="dialog" aria-modal="true" aria-labelledby="replace-data-title"><h2 id="replace-data-title">Replace current tournament?</h2><p>Loading this data will replace the current tournament, player names, scores, rounds, and winner settings.</p><div><button className="secondary-button" type="button" onClick={() => setShowReplaceDataDialog(false)}>Cancel</button><button className="reset-confirm-button" type="button" onClick={loadKbpJngTestData}>Replace &amp; Load</button></div></section></div>}
    <div className="winner-export-canvas" aria-hidden="true"><section className="winner-export-sheet" ref={exportSheetRef}><header><p>System 36 Tournament Scoring</p><h1>{name || "System 36 Tournament"}</h1><span>{rounds.length} {rounds.length === 1 ? "Round" : "Rounds"} · {roundSummary.join("  |  ")}</span></header><div className="winner-export-summary"><div><b>{winnerResult.eligible.length}</b><span>Eligible players</span></div><div><b>{winnerResult.notEligible}</b><span>Not eligible</span></div><div><b>{flights}</b><span>{flights === 1 ? "Flight" : "Flights"}</span></div></div><p className="winner-export-ranges">{Array.from({ length: flights }, (_, index) => `Flight ${String.fromCharCode(65 + index)}: ${flightRange(index)}`).join(" · ")}</p><div className="winner-export-awards">{awardSections.map(([title, codes]) => <article key={title}><h2>{title}</h2>{codes.map((code) => { const award = winnerResult.awards.find((item) => item.code === code); const metric = award ? awardMetric(award) : ""; return <div className="winner-export-award" key={code}><b>{code}</b>{award?.winner ? <span><strong>{award.winner.name}</strong><small>{metric} {metric === "Gross" ? award.winner.aggregateGross : award.winner.aggregateNett}</small><em>{(metric === "Gross" ? award.winner.roundGross : award.winner.roundNett).map((value, index) => `R${index + 1} ${value}`).join(" + ")}</em>{award.countbackStage && <i>Tie-break: {tieBreakStage(award)}{tieBreakOpponents(award) && <><br />vs {tieBreakOpponents(award)}</>}</i>}</span> : <span>{award?.tied ? "TIE — Manual Decision" : "No player awarded"}</span>}</div>; })}</article>)}</div><footer>Generated by System 36 Tournament Scoring · {exportTimestamp}</footer></section></div>
  </main>;
}





