"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CourseCombobox } from "@/components/course-combobox";
import { ScoreEntry } from "@/components/score-entry";
import type { ScoringCourse } from "@/lib/course-catalog";
import type { NettTieBreakMethod, Player, ScoringSystem, TournamentFormat } from "@/lib/scoring";
import { calculateTournamentWinners, type Award } from "@/lib/winner-engine";
import { parseSavedTournament, serializeTournament, TOURNAMENT_STORAGE_KEY, type SavedTournament } from "@/lib/tournament-storage";
import { loadKbpJngTestFixture } from "@/lib/real-test-fixture";
import { loadPsgcRancamayaFixture, PSGC_FIXTURE_NAME, PSGC_SOURCE_NOTE } from "@/lib/psgc-rancamaya-fixture";
import { exportFilename, winnerCsv } from "@/lib/winner-export";
import { synchronizeRoundPlayerCounts } from "@/lib/player-removal";
import { blankNovelty, noveltyText, noveltyTypes, type NoveltyEntry, type NoveltyType } from "@/lib/novelties";

type Step = 1 | 2 | 3;
type HistoricalDataset = "kbp-jng" | "psgc-rancamaya";
const PSGC_SOURCE_NOTE_DISMISSED_KEY = "golf-scoring:psgc-rancamaya-source-note-dismissed";
export type TournamentRound = { id: number; courseId: number | null; players: number | null };

const blankRound = (id: number): TournamentRound => ({ id, courseId: null, players: null });
const defaultNettTieBreakMethod = (scoringSystem: ScoringSystem, tournamentFormat: TournamentFormat): NettTieBreakMethod => scoringSystem === "handicap" && tournamentFormat === "psgc" ? "lower-handicap" : "countback";
const awardMetric = (award: Award) => award.code.startsWith("BG") ? "Gross" : "Nett";
const tieBreakStage = (award: Award) => award.countbackStage === "HCP" ? "Lower HCP36" : award.countbackStage === "HANDICAP" ? "Lower Handicap" : award.countbackStage;
const tieBreakOpponents = (award: Award) => !award.tiedOpponents?.length ? "" : award.tiedOpponents.length <= 3 ? award.tiedOpponents.map((player) => player.name).join(", ") : `${award.tiedOpponents.length} tied players`;

export function SimpleTournamentTool({ courses }: { courses: ScoringCourse[] }) {
  const [step, setStep] = useState<Step>(1);
  const [showWelcome, setShowWelcome] = useState(true);
  const [name, setName] = useState("");
  const [roundCount, setRoundCount] = useState(1);
  const [rounds, setRounds] = useState<TournamentRound[]>([blankRound(1)]);
  const [scoringSystem, setScoringSystem] = useState<ScoringSystem>("system36");
  const [tournamentFormat, setTournamentFormat] = useState<TournamentFormat>("standard");
  const [system36NettTieBreakMethod, setSystem36NettTieBreakMethod] = useState<NettTieBreakMethod>("lower-handicap");
  const [handicapNettTieBreakMethod, setHandicapNettTieBreakMethod] = useState<NettTieBreakMethod>("countback");
  const nettTieBreakMethod = scoringSystem === "system36" ? system36NettTieBreakMethod : handicapNettTieBreakMethod;
  const [flights, setFlights] = useState(2);
  const [flightLimits, setFlightLimits] = useState<number[]>([12]);
  const [expandedFlights, setExpandedFlights] = useState<Record<string, boolean>>({});
  const [tournamentScores, setTournamentScores] = useState<Record<number, Player[]>>({});
  const [novelties, setNovelties] = useState<NoveltyEntry[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saving" | "saved" | "failed">("saved");
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [showLoadDataDialog, setShowLoadDataDialog] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminDialog, setShowAdminDialog] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminError, setAdminError] = useState("");
  const [adminAuthenticating, setAdminAuthenticating] = useState(false);
  const [showReplaceDataDialog, setShowReplaceDataDialog] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [fixtureLoadError, setFixtureLoadError] = useState("");
  const [fixtureLoadNotice, setFixtureLoadNotice] = useState("");
  const [psgcSourceNoteDismissed, setPsgcSourceNoteDismissed] = useState(false);
  const [selectedDataset, setSelectedDataset] = useState<HistoricalDataset | null>(null);
  const [scoreEntryRevision, setScoreEntryRevision] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [exportTimestamp, setExportTimestamp] = useState("");
  const restoreTimerRef = useRef<number | null>(null);
  const restoreHandledRef = useRef(false);
  const exportSheetRef = useRef<HTMLDivElement | null>(null);
  const courseById = useMemo(() => new Map(courses.map((course) => [course.id, course])), [courses]);

  const updateTournamentScores = useCallback((scores: Record<number, Player[]>) => {
    setTournamentScores(scores);
    const rosterIds = new Set(Object.values(scores).flat().map((player) => player.id));
    setNovelties((current) => current.filter((novelty) => !novelty.playerId || rosterIds.has(novelty.playerId)));
    setRounds((current) => synchronizeRoundPlayerCounts(current, scores));
  }, []);
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
  const winnerResult = useMemo(() => calculateTournamentWinners(rounds.map((round) => ({ id: round.id, pars: courseById.get(round.courseId ?? -1)?.pars ?? [], players: tournamentScores[round.id] ?? [] })), flights, flightLimits, { scoringSystem, tournamentFormat, nettTieBreakMethod }), [courseById, flightLimits, flights, rounds, scoringSystem, tournamentFormat, nettTieBreakMethod, tournamentScores]);
  const hcpValues = winnerResult.eligible.map((player) => scoringSystem === "handicap" ? player.handicap ?? 0 : player.averageHcp36);
  const hcpRange = hcpValues.length ? `${Math.min(...hcpValues).toFixed(1)}–${Math.max(...hcpValues).toFixed(1)}` : "—";
  const flightRange = (index: number) => index === 0
    ? `HCP ≤ ${flightLimits[0]}`
    : index === flights - 1
      ? `HCP > ${flightLimits[index - 1]}`
      : `HCP ${flightLimits[index - 1]}–${flightLimits[index]}`;
  const hasTournamentData = name.trim().length > 0 || rounds.some((round) => round.courseId !== null || round.players !== null) || Object.keys(tournamentScores).length > 0;
  const hasMeaningfulTournament = name.trim().length > 0 || rounds.some((round) => round.courseId !== null) || Object.values(tournamentScores).some((players) => players.some((player) => player.name.trim().length > 0 || player.scores.some((score) => score !== null)));
  const psgcMode = scoringSystem === "handicap" && tournamentFormat === "psgc";
  const noveltyPlayers = useMemo(() => Array.from(new Map(Object.values(tournamentScores).flat().map((player) => [player.id, player] as const)).values()).sort((left, right) => (left.name || "Unnamed player").localeCompare(right.name || "Unnamed player")), [tournamentScores]);
  const noveltyPlayerNames = useMemo(() => new Map(noveltyPlayers.map((player) => [player.id, player.name.trim() || "Unnamed player"])), [noveltyPlayers]);
  const completedNovelties = novelties.filter((novelty) => novelty.playerId && novelty.distance.trim() && noveltyPlayerNames.has(novelty.playerId));
  const flightAwardSections: Array<[string, string[]]> = psgcMode
    ? [["Flight A", ["BGA", "BN 1 A", "BN 2 A"]], ["Flight B", ["BGB", "BN 1 B", "BN 2 B"]], ["Flight C", ["BGC", "BN 1 C", "BN 2 C"]], ["Super Senior", ["BN 1 SS", "BN 2 SS", "BN 3 SS"]]]
    : Array.from({ length: flights }, (_, index): [string, string[]] => { const flight = String.fromCharCode(65 + index); return [`Flight ${flight}`, [`BG${flight}`, `BN 1 ${flight}`, `BN 2 ${flight}`]]; });
  const awardSections: Array<[string, string[]]> = [["Overall", ["BGO", "BNO"]], ...flightAwardSections];
  const displayedFlightKeys = psgcMode ? ["A", "B", "C", "SS"] : Array.from({ length: flights }, (_, index) => String.fromCharCode(65 + index));
  const displayedFlightName = (flight: string) => flight === "SS" ? "Super Senior" : `Flight ${flight}`;
  const roundSummary = rounds.map((round, index) => `Round ${index + 1} — ${courseById.get(round.courseId ?? -1)?.name ?? "Course not selected"}`);

  useEffect(() => { const timeout = window.setTimeout(() => setShowWelcome(false), 2500); return () => window.clearTimeout(timeout); }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/admin/session", { cache: "no-store" }).then(async (response) => response.ok ? response.json() as Promise<{ admin?: boolean }> : { admin: false }).then((session) => {
      if (!cancelled) setIsAdmin(session.admin === true);
    }).catch(() => { if (!cancelled) setIsAdmin(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    restoreTimerRef.current = window.setTimeout(() => {
      if (restoreHandledRef.current) return;
      restoreHandledRef.current = true;
      const saved = parseSavedTournament(window.localStorage.getItem(TOURNAMENT_STORAGE_KEY));
      const dismissedPsgcSourceNote = window.localStorage.getItem(PSGC_SOURCE_NOTE_DISMISSED_KEY) === "dismissed";
      setPsgcSourceNoteDismissed(dismissedPsgcSourceNote);
      if (saved) {
        const restoredRounds = saved.rounds.map((round) => ({ ...round, courseId: round.courseId !== null && courseById.has(round.courseId) ? round.courseId : null }));
        setStep(saved.step);
        setName(saved.name);
        setRoundCount(saved.roundCount);
        setRounds(synchronizeRoundPlayerCounts(restoredRounds, saved.tournamentScores));
        setTournamentScores(saved.tournamentScores);
        setNovelties(saved.novelties ?? []);
        setFlights(saved.flights);
        setFlightLimits(saved.flightLimits);
        setScoringSystem(saved.scoringSystem ?? "system36");
        setTournamentFormat(saved.tournamentFormat ?? "standard");
        setSystem36NettTieBreakMethod(saved.system36NettTieBreakMethod ?? "lower-handicap"); setHandicapNettTieBreakMethod(saved.handicapNettTieBreakMethod ?? (saved.scoringSystem === "handicap" ? saved.nettTieBreakMethod ?? defaultNettTieBreakMethod("handicap", saved.tournamentFormat ?? "standard") : defaultNettTieBreakMethod("handicap", saved.tournamentFormat ?? "standard")));
        setFixtureLoadNotice(saved.name === PSGC_FIXTURE_NAME && saved.tournamentFormat === "psgc" && !dismissedPsgcSourceNote ? PSGC_SOURCE_NOTE : "");
      }
      setStorageReady(true);
    }, 0);
    return () => { if (restoreTimerRef.current !== null) window.clearTimeout(restoreTimerRef.current); };
  }, [courseById]);

  useEffect(() => {
    if (!storageReady || !hasTournamentData) return;
    const timeout = window.setTimeout(() => {
      const saved: SavedTournament = { version: 1, step, name, roundCount, rounds, tournamentScores, flights, flightLimits, scoringSystem, tournamentFormat, nettTieBreakMethod, system36NettTieBreakMethod, handicapNettTieBreakMethod, novelties };
      try { window.localStorage.setItem(TOURNAMENT_STORAGE_KEY, serializeTournament(saved)); setSaveStatus("saved"); } catch { setSaveStatus("failed"); }
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [flightLimits, flights, hasTournamentData, name, roundCount, rounds, scoringSystem, step, storageReady, tournamentFormat, nettTieBreakMethod, system36NettTieBreakMethod, handicapNettTieBreakMethod, tournamentScores, novelties]);

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
    setNovelties([]);
    setScoringSystem("system36");
    setTournamentFormat("standard");
    setFlights(2);
    setFlightLimits([12]);
    setExpandedFlights({});
    setShowResetDialog(false);
    setResetting(false);
  };
  const beginFixtureLoad = () => {
    restoreHandledRef.current = true;
    if (restoreTimerRef.current !== null) window.clearTimeout(restoreTimerRef.current);
    setStorageReady(true);
  };
  const finishFixtureLoad = () => {
    setScoreEntryRevision((current) => current + 1);
    setShowLoadDataDialog(false);
    setShowReplaceDataDialog(false);
    setSelectedDataset(null);
    setStep(2);
  };
  const loadKbpJngTestData = () => {
    beginFixtureLoad();
    const fixture = loadKbpJngTestFixture(courses);
    if (!fixture) { setFixtureLoadError("Historical data could not be matched to the local course catalog."); return; }
    setName(fixture.name); setRoundCount(fixture.rounds.length); setRounds(fixture.rounds); setTournamentScores(fixture.scores); setNovelties([]);
    setScoringSystem("system36"); setTournamentFormat("standard"); setSystem36NettTieBreakMethod("lower-handicap"); setHandicapNettTieBreakMethod("countback"); setFlights(2); setFlightLimits([12]); setExpandedFlights({});
    setFixtureLoadError(""); setFixtureLoadNotice(""); finishFixtureLoad();
  };
  const loadPsgcRancamayaData = () => {
    beginFixtureLoad();
    const fixture = loadPsgcRancamayaFixture(courses);
    if (!fixture) { setFixtureLoadError("Rancamaya could not be matched to a valid local course with complete PAR data."); return; }
    setName(fixture.name); setRoundCount(1); setRounds(fixture.rounds); setTournamentScores(fixture.scores); setNovelties([]);
    setScoringSystem("handicap"); setTournamentFormat("psgc"); setHandicapNettTieBreakMethod("lower-handicap"); setFlights(3); setFlightLimits([14, 19]); setExpandedFlights({});
    try { window.localStorage.removeItem(PSGC_SOURCE_NOTE_DISMISSED_KEY); } catch { /* The note still appears for this session. */ }
    setPsgcSourceNoteDismissed(false);
    setFixtureLoadError(""); setFixtureLoadNotice(fixture.dataNotice); finishFixtureLoad();
  };
  const loadSelectedDataset = () => {
    if (!isAdmin) { setShowReplaceDataDialog(false); return; }
    if (selectedDataset === "psgc-rancamaya") loadPsgcRancamayaData();
    else loadKbpJngTestData();
  };
  const requestHistoricalDataLoad = (dataset: HistoricalDataset) => {
    if (!isAdmin) return;
    setSelectedDataset(dataset);
    if (hasMeaningfulTournament) { setShowLoadDataDialog(false); setShowReplaceDataDialog(true); return; }
    if (dataset === "psgc-rancamaya") loadPsgcRancamayaData(); else loadKbpJngTestData();
  };
  const unlockAdmin = async () => {
    if (adminAuthenticating) return;
    setAdminAuthenticating(true);
    setAdminError("");
    try {
      const response = await fetch("/api/admin/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: adminPassword }) });
      const session: { admin?: boolean } = await response.json().catch(() => ({}));
      if (!response.ok || session.admin !== true) { setAdminError("Admin Mode could not be unlocked."); return; }
      setIsAdmin(true);
      setAdminPassword("");
      setShowAdminDialog(false);
    } catch { setAdminError("Admin Mode could not be unlocked."); } finally { setAdminAuthenticating(false); }
  };
  const lockAdmin = async () => {
    try { await fetch("/api/admin/session", { method: "DELETE" }); } finally {
      setIsAdmin(false);
      setShowLoadDataDialog(false);
      setShowReplaceDataDialog(false);
      setSelectedDataset(null);
    }
  };
  const download = (url: string, filename: string) => {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const exportCsv = () => {
    const blob = new Blob([winnerCsv(winnerResult.awards, rounds.length, scoringSystem)], { type: "text/csv;charset=utf-8" });
    download(URL.createObjectURL(blob), exportFilename(name, "csv"));
  };
  const addNovelty = () => setNovelties((current) => [...current, blankNovelty(`novelty-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)]);
  const updateNovelty = (id: string, patch: Partial<NoveltyEntry>) => setNovelties((current) => current.map((novelty) => novelty.id === id ? { ...novelty, ...patch } : novelty));
  const removeNovelty = (id: string) => setNovelties((current) => current.filter((novelty) => novelty.id !== id));
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
    {showWelcome && <section className="welcome-splash" aria-label="Golf Scoring System"><div className="welcome-mark"><Image src="/golf-scoring-icon.png" alt="" width={116} height={116} priority /></div><strong>Golf Scoring System</strong><span>Tournament Scoring</span><small>Designed &amp; Built by Fikri · AI-assisted</small></section>}<header className="simple-header"><div className="simple-brand"><Image src="/golf-scoring-logo.svg" alt="Golf Scoring System — Tournament Scoring" width={300} height={52} priority /></div><div className="stepper">{([1, 2, 3] as Step[]).map((item) => <span className={step === item ? "active" : step > item ? "done" : ""} key={item}><b>{item}</b>{item === 1 ? "Tournament" : item === 2 ? "Score Entry" : "Winners"}</span>)}</div><span className={`autosave-status ${saveStatus}`} role="status">{saveStatus === "saving" ? "Saving..." : saveStatus === "failed" ? "Save failed" : "✓ Saved"}</span>{isAdmin ? <><button className="load-data-button" type="button" onClick={() => setShowLoadDataDialog(true)}>Load Data</button><button className="admin-mode-button" type="button" onClick={() => void lockAdmin()}>Lock Admin</button></> : <button className="admin-mode-button" type="button" onClick={() => { setAdminError(""); setShowAdminDialog(true); }}>Admin</button>}<button className="new-tournament-button" type="button" onClick={() => setShowResetDialog(true)}>New Tournament</button></header>
    <section className="simple-content">
      {step === 1 && <section className="setup-step"><div className="step-intro"><p>STEP 1</p><h1>Tournament setup</h1><span>Choose the tournament and its rounds. Course pars load automatically.</span><p className="device-recommendation">Best viewed on tablet or desktop. Mobile is supported with horizontal scrolling.</p></div>{fixtureLoadError && <p className="validation-error">{fixtureLoadError}</p>}
        <label className="wide-field">Tournament name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Enter tournament name" /></label>
        <div className="setup-inline-fields">
          <div className="setup-scoring-field"><span>Scoring system</span><div className="scoring-system-toggle" role="group" aria-label="Scoring system"><button type="button" className={scoringSystem === "system36" ? "active" : ""} aria-pressed={scoringSystem === "system36"} onClick={() => { setScoringSystem("system36"); setTournamentFormat("standard"); }}>System 36</button><button type="button" className={scoringSystem === "handicap" ? "active" : ""} aria-pressed={scoringSystem === "handicap"} onClick={() => setScoringSystem("handicap")}>Handicap</button></div>{scoringSystem === "handicap" && <small>Manual tournament / playing handicap</small>}</div>
          <label className="setup-round-count">Number of rounds?<select value={roundCount} onChange={(event) => changeRoundCount(Number(event.target.value))}>{[1,2,3,4,5].map((count) => <option key={count} value={count}>{count}</option>)}</select></label>
          {scoringSystem === "handicap" && <label className="setup-format">Tournament format<select value={tournamentFormat} onChange={(event) => { const format = event.target.value as TournamentFormat; setTournamentFormat(format); setHandicapNettTieBreakMethod(defaultNettTieBreakMethod("handicap", format)); }}><option value="standard">Standard</option><option value="psgc">PSGC</option></select></label>}<div className="setup-scoring-field nett-tie-break-field"><span>Nett tie-break method</span><div className="scoring-system-toggle" role="group" aria-label="Nett tie-break method"><button type="button" className={nettTieBreakMethod === "lower-handicap" ? "active" : ""} aria-pressed={nettTieBreakMethod === "lower-handicap"} onClick={() => scoringSystem === "system36" ? setSystem36NettTieBreakMethod("lower-handicap") : setHandicapNettTieBreakMethod("lower-handicap")}>{scoringSystem === "system36" ? "Lower HCP36" : "Lower Handicap"}</button><button type="button" className={nettTieBreakMethod === "countback" ? "active" : ""} aria-pressed={nettTieBreakMethod === "countback"} onClick={() => scoringSystem === "system36" ? setSystem36NettTieBreakMethod("countback") : setHandicapNettTieBreakMethod("countback")}>Countback</button></div></div>
        </div>
        <div className="round-setup-list">{rounds.map((round, index) => { const course = round.courseId === null ? undefined : courseById.get(round.courseId); return <article key={round.id} className="round-setup"><b>Round {index + 1}</b><label>Golf course<CourseCombobox courses={courses} selectedCourse={course} onSelect={(selected) => updateRound(round.id, { courseId: selected.id })} /></label><label>Number of players<input type="text" inputMode="numeric" value={tournamentScores[round.id]?.length ?? round.players ?? ""} placeholder="Enter number of players" readOnly={tournamentScores[round.id] !== undefined} title={tournamentScores[round.id] !== undefined ? "Managed from the Score Entry roster" : undefined} onChange={(event) => { if (event.target.value === "") { updateRound(round.id, { players: null }); return; } const value = Number(event.target.value); if (Number.isInteger(value) && value >= 1 && value <= 200) updateRound(round.id, { players: value }); }} /></label><span className={course ? (course.pars ? "par-ready" : "par-missing") : "par-empty"}>{course ? (course.pars ? `Par ${course.pars.reduce((total, par) => total + par, 0)} loaded automatically` : "Unavailable for scoring — missing or invalid PAR data") : "Select a course to load PAR"}</span></article>; })}</div>
        <div className="step-action"><button className="primary-button" disabled={!canScore} onClick={() => setStep(2)}>Continue to Score Entry →</button>{!canScore && <small>Choose valid courses with complete hole PAR data to continue.</small>}</div>
      </section>}
      {step === 2 && <>{fixtureLoadNotice && !psgcSourceNoteDismissed && <div className="fixture-load-notice" role="status"><span>{fixtureLoadNotice}</span><button type="button" aria-label="Dismiss source note" title="Dismiss source note" onClick={() => { setPsgcSourceNoteDismissed(true); try { window.localStorage.setItem(PSGC_SOURCE_NOTE_DISMISSED_KEY, "dismissed"); } catch { /* Dismissal still applies for this session. */ } }}>×</button></div>}<ScoreEntry key={scoreEntryRevision} tournamentName={name} rounds={rounds} courses={courseById} savedScores={tournamentScores} scoringSystem={scoringSystem} tournamentFormat={tournamentFormat} onScoresChange={updateTournamentScores} onHandicapChange={(playerId, handicap) => setTournamentScores((current) => Object.fromEntries(Object.entries(current).map(([round, players]) => [round, players.map((player) => player.id === playerId ? { ...player, handicap } : player)])))} onBack={() => setStep(1)} onContinue={(scores) => { updateTournamentScores(scores); setStep(3); }} /></>}
      {step === 3 && <section className="awards-step">
        <div className="awards-page-header"><div className="step-intro"><p>STEP 3</p><h1>Winners & awards</h1><span>Only players with a complete scorecard in every round are eligible for final awards.</span></div><div className="winner-export-actions"><button className="secondary-button" type="button" disabled={isExporting} onClick={saveWinnersImage}>{isExporting ? "Saving…" : "Save as Image"}</button><button className="secondary-button" type="button" onClick={exportCsv}>Export CSV</button></div></div>
        {exportError && <p className="validation-error">{exportError}</p>}
        <div className="awards-overview">
          {psgcMode ? <section className="awards-panel award-setup-panel"><h2>PSGC Award Profile</h2><p>Explicit imported categories are used for Flight A, Flight B, Flight C, and Super Senior. Handicap boundaries do not reassign players.</p></section> : <section className="awards-panel award-setup-panel"><h2>Award Setup</h2><label>Number of flights<select value={flights} onChange={(event) => { const count = Number(event.target.value); setFlights(count); setFlightLimits((current) => Array.from({ length: count - 1 }, (_, index) => current[index] ?? (index + 1) * 12)); }}>{[1, 2, 3].map((count) => <option key={count} value={count}>{count}</option>)}</select></label>{flightLimits.map((limit, index) => <label key={index}>Maximum Handicap — Flight {String.fromCharCode(65 + index)}<input type="text" inputMode="decimal" value={limit} onChange={(event) => { const value = Number(event.target.value); if (!Number.isNaN(value)) setFlightLimits((current) => current.map((item, itemIndex) => itemIndex === index ? value : item)); }} /></label>)}<p>{Array.from({ length: flights }, (_, index) => `Flight ${String.fromCharCode(65 + index)}: ${flightRange(index)}`).join(" · ")}</p></section>}
          <section className="awards-panel tournament-summary-panel"><h2>Tournament Summary</h2><dl><div><dt>Eligible</dt><dd>{winnerResult.eligible.length}</dd></div><div><dt>Not eligible</dt><dd>{winnerResult.notEligible}</dd></div><div><dt>{scoringSystem === "handicap" ? "Handicap" : "Tournament HCP"} range</dt><dd>{hcpRange}</dd></div>{displayedFlightKeys.map((flight) => <div key={flight}><dt>{displayedFlightName(flight)}</dt><dd>{winnerResult.flights[flight]?.length ?? 0}</dd></div>)}</dl></section>
        </div>        {winnerResult.validationError && <p className="validation-error">{winnerResult.validationError}</p>}
        <aside className="tie-break-rules"><b>Tie-break Rules</b><span><strong>Nett</strong> {nettTieBreakMethod === "lower-handicap" ? scoringSystem === "system36" ? "Lower HCP36 → CB9 → CB6 → CB3 → CB1" : "Lower Handicap → CB9 → CB6 → CB3 → CB1" : "CB9 → CB6 → CB3 → CB1"}</span><span><strong>Gross</strong> CB9 → CB6 → CB3 → CB1</span><small>Applied only when the primary result is tied.</small></aside>
        <div className="flight-memberships">{displayedFlightKeys.map((flight, index) => { const members = winnerResult.flights[flight] ?? []; const expanded = expandedFlights[flight] ?? false; const descriptor = psgcMode ? "Explicit PSGC category" : flightRange(index); return <section className="flight-membership" key={flight}><button type="button" onClick={() => setExpandedFlights((current) => ({ ...current, [flight]: !expanded }))}><span>{displayedFlightName(flight)} — {members.length} players <small>· {descriptor}</small></span><b>{expanded ? "Hide players" : "View players"}</b></button>{expanded && <ol>{members.map((player) => <li key={player.key}><span>{player.name}</span><small>{scoringSystem === "handicap" ? `HCP ${player.handicap ?? 0}` : `HCP ${player.averageHcp36.toFixed(1)}`}</small></li>)}</ol>}</section>; })}</div>        <section className="winner-results"><h2>Award Winners</h2><div className="award-grid">{awardSections.map(([title, codes]) => <article key={title}><p>{title}</p>{codes.map((code) => { const award = winnerResult.awards.find((item) => item.code === code); return <div className="award-result" key={code}><b>{code}</b>{award?.winner ? <span><strong>{award.winner.name}</strong><small>{awardMetric(award)} {awardMetric(award) === "Gross" ? award.winner.aggregateGross : award.winner.aggregateNett}</small><em>{(awardMetric(award) === "Gross" ? award.winner.roundGross : award.winner.roundNett).map((value, index) => `R${index + 1} ${value}`).join(" + ")}</em>{award.countbackStage && <em>Tie-break: {tieBreakStage(award)}{tieBreakOpponents(award) && <><br />vs {tieBreakOpponents(award)}</>}</em>}</span> : <span>{award?.tied ? "TIE — Manual Decision" : title === "Overall" ? "No eligible player" : "No player in this flight"}</span>}</div>; })}</article>)}</div></section>
        <section className="novelty-section"><div className="novelty-section-header"><h2>Novelties</h2><button className="secondary-button" type="button" onClick={addNovelty}>+ Add Novelty</button></div>{novelties.length ? <div className="novelty-editors">{novelties.map((novelty) => <div className="novelty-editor" key={novelty.id}><label>Type<select value={novelty.type} onChange={(event) => updateNovelty(novelty.id, { type: event.target.value as NoveltyType })}>{noveltyTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label><label>Hole<select value={novelty.hole ?? ""} onChange={(event) => updateNovelty(novelty.id, { hole: event.target.value === "" ? null : Number(event.target.value) })}><option value="">—</option>{Array.from({ length: 18 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select></label><label>Player<select value={novelty.playerId} onChange={(event) => updateNovelty(novelty.id, { playerId: event.target.value })}><option value="">Select player</option>{noveltyPlayers.map((player) => <option key={player.id} value={player.id}>{player.name.trim() || "Unnamed player"}</option>)}</select></label><label>Distance (m)<input type="text" inputMode="decimal" value={novelty.distance} placeholder="e.g. 1.8" onChange={(event) => { if (/^\d*(?:\.\d*)?$/.test(event.target.value)) updateNovelty(novelty.id, { distance: event.target.value }); }} /></label><button className="novelty-remove-button" type="button" aria-label={`Remove ${novelty.type} novelty`} onClick={() => removeNovelty(novelty.id)}>Remove</button></div>)}</div> : <p className="novelty-empty">No novelties entered.</p>}{completedNovelties.length > 0 && <div className="novelty-results">{completedNovelties.map((novelty) => <p key={novelty.id}>{noveltyText(novelty, noveltyPlayerNames.get(novelty.playerId)!)}</p>)}</div>}</section>        <button className="secondary-button awards-back-button" onClick={() => setStep(2)}>← Back to Score Entry</button>
      </section>}
    </section>
    {showResetDialog && <div className="reset-backdrop" role="presentation"><section className="reset-dialog" role="dialog" aria-modal="true" aria-labelledby="reset-title"><h2 id="reset-title">Start a new tournament?</h2><p>Your current tournament data, player names, scores, rounds, and winner settings will be cleared. This action cannot be undone.</p><div><button className="secondary-button" type="button" disabled={resetting} onClick={() => setShowResetDialog(false)}>Cancel</button><button className="reset-confirm-button" type="button" disabled={resetting} onClick={startNewTournament}>{resetting ? "Starting…" : "Start New Tournament"}</button></div></section></div>}
    {showAdminDialog && <div className="reset-backdrop" role="presentation"><form className="reset-dialog admin-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-title" onSubmit={(event) => { event.preventDefault(); void unlockAdmin(); }}><h2 id="admin-title">Unlock Admin Mode</h2><p>Use the administrator password to access historical test data.</p><label>Password<input type="password" autoComplete="current-password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} autoFocus /></label>{adminError && <p className="validation-error">{adminError}</p>}<div><button className="secondary-button" type="button" disabled={adminAuthenticating} onClick={() => { setAdminPassword(""); setAdminError(""); setShowAdminDialog(false); }}>Cancel</button><button className="primary-button" type="submit" disabled={!adminPassword || adminAuthenticating}>{adminAuthenticating ? "Unlocking…" : "Unlock"}</button></div></form></div>}
    {showLoadDataDialog && isAdmin && <div className="reset-backdrop" role="presentation"><section className="load-data-dialog" role="dialog" aria-modal="true" aria-labelledby="load-data-title"><h2 id="load-data-title">Load Tournament Data</h2><article><h3>KBP &amp; JNG Historical Data</h3><p>Round 1: Parahyangan Golf Bandung <b>40 players</b></p><p>Round 2: Jatinangor National Golf &amp; Resort <b>29 players</b></p><button className="primary-button" type="button" onClick={() => requestHistoricalDataLoad("kbp-jng")}>Load</button></article><article><h3>PSGC — Gobar Rancamaya · 2 September 2026</h3><p>Rancamaya Golf Course <b>60 players</b></p><p>Handicap scoring · PSGC award profile</p><button className="primary-button" type="button" onClick={() => requestHistoricalDataLoad("psgc-rancamaya")}>Load</button></article><div><button className="secondary-button" type="button" onClick={() => setShowLoadDataDialog(false)}>Cancel</button></div></section></div>}
    {showReplaceDataDialog && <div className="reset-backdrop" role="presentation"><section className="reset-dialog" role="dialog" aria-modal="true" aria-labelledby="replace-data-title"><h2 id="replace-data-title">Replace current tournament?</h2><p>Loading this data will replace the current tournament, player names, scores, rounds, and winner settings.</p><div><button className="secondary-button" type="button" onClick={() => setShowReplaceDataDialog(false)}>Cancel</button><button className="reset-confirm-button" type="button" onClick={loadSelectedDataset}>Replace &amp; Load</button></div></section></div>}
    <div className="winner-export-canvas" aria-hidden="true"><section className="winner-export-sheet" ref={exportSheetRef}><header><p>Golf Scoring System</p><h1>{name || "Golf Tournament"}</h1><span>{rounds.length} {rounds.length === 1 ? "Round" : "Rounds"} · {roundSummary.join("  |  ")}</span></header><div className="winner-export-summary"><div><b>{winnerResult.eligible.length}</b><span>Eligible players</span></div><div><b>{winnerResult.notEligible}</b><span>Not eligible</span></div><div><b>{psgcMode ? 4 : flights}</b><span>{psgcMode ? "Award categories" : flights === 1 ? "Flight" : "Flights"}</span></div></div><p className="winner-export-ranges">{psgcMode ? "PSGC explicit categories: Flight A · Flight B · Flight C · Super Senior" : Array.from({ length: flights }, (_, index) => `Flight ${String.fromCharCode(65 + index)}: ${flightRange(index)}`).join(" · ")}</p><div className="winner-export-awards">{awardSections.map(([title, codes]) => <article key={title}><h2>{title}</h2>{codes.map((code) => { const award = winnerResult.awards.find((item) => item.code === code); const metric = award ? awardMetric(award) : ""; return <div className="winner-export-award" key={code}><b>{code}</b>{award?.winner ? <span><strong>{award.winner.name}</strong><small>{metric} {metric === "Gross" ? award.winner.aggregateGross : award.winner.aggregateNett}</small><em>{(metric === "Gross" ? award.winner.roundGross : award.winner.roundNett).map((value, index) => `R${index + 1} ${value}`).join(" + ")}</em>{award.countbackStage && <i>Tie-break: {tieBreakStage(award)}{tieBreakOpponents(award) && <><br />vs {tieBreakOpponents(award)}</>}</i>}</span> : <span>{award?.tied ? "TIE — Manual Decision" : "No player awarded"}</span>}</div>; })}</article>)}</div>{completedNovelties.length > 0 && <section className="winner-export-novelties"><h2>Novelties</h2>{completedNovelties.map((novelty) => <p key={novelty.id}>{noveltyText(novelty, noveltyPlayerNames.get(novelty.playerId)!)}</p>)}</section>}<footer>Generated by Golf Scoring System · {exportTimestamp}</footer></section></div>
  </main>;
}
