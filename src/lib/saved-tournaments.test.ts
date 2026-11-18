import assert from "node:assert/strict";
import test from "node:test";
import { SAVED_TOURNAMENTS_KEY, saveTournamentSnapshot, readTournamentSnapshots, renameTournamentSnapshot, deleteTournamentSnapshot } from "./saved-tournaments.ts";
import { parseSavedTournament, serializeTournament, TOURNAMENT_STORAGE_KEY, type SavedTournament } from "./tournament-storage.ts";
import { calculateTournamentWinners } from "./winner-engine.ts";

function memoryStore() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}
const player = {
  id: "stable-player", name: "KUKUH", handicap: 9, awardCategory: "A" as const, pairing: "7A",
  jackpotTargetFront: 40, jackpotTargetBack: 41,
  jackpotManualFirstNine: 42, jackpotManualSecondNine: 43, jackpotManualNett: 71, scores: Array(18).fill(4),
};
const state: SavedTournament = {
  version: 1, step: 2, name: "Snapshot Cup", roundCount: 2, playDate: "2026-11-18",
  rounds: [{ id: 1, courseId: 99999, players: 1 }, { id: 2, courseId: 99999, players: 1 }],
  courseData: [{ id: 99999, name: "Recorded Course", pars: Array(18).fill(4) }],
  tournamentScores: { 1: [player], 2: [{ ...player, scores: Array(18).fill(5) }] },
  flights: 0, flightLimits: [], overallAwards: true, additionalNettAwards: 3,
  scoringSystem: "handicap", tournamentFormat: "standard", awardMode: "nett-only",
  handicapAwardMode: "nett-only", system36AwardMode: "gross-nett",
  handicapNettTieBreakMethod: "countback", system36NettTieBreakMethod: "lower-handicap",
  nettTieBreakMethod: "countback", pairingGroups: { 1: ["7A", "8B"] },
  jackpot: { enabled: true, mode: "manual", blindHoles: [1, 2, 10, 11], locked: true, revealed: false },
  novelties: [{ id: "novelty-1", type: "NTTP", playerId: player.id, hole: 3, distance: "1.5" }],
};

test("snapshots use canonical state, preserve source data and stable IDs, and reload from their own storage key", () => {
  const store = memoryStore();
  store.setItem(TOURNAMENT_STORAGE_KEY, serializeTournament(state));
  const beforeActive = store.getItem(TOURNAMENT_STORAGE_KEY);
  const snapshot = saveTournamentSnapshot(store, "Example", state, "first");
  const reloaded = readTournamentSnapshots(store)[0];
  assert.deepEqual(reloaded, snapshot);
  assert.deepEqual(reloaded.state, parseSavedTournament(serializeTournament(state)));
  assert.equal(store.getItem(TOURNAMENT_STORAGE_KEY), beforeActive);
  assert.ok(store.getItem(SAVED_TOURNAMENTS_KEY));
  assert.equal(reloaded.state.tournamentScores[2][0].id, player.id);
  assert.deepEqual(reloaded.state.tournamentScores[1][0], player);
  const result = (saved: SavedTournament) => calculateTournamentWinners(saved.rounds.map((round) => ({
    id: round.id, pars: saved.courseData![0].pars!, players: saved.tournamentScores[round.id],
  })), saved.flights, saved.flightLimits, { scoringSystem: saved.scoringSystem, awardMode: saved.awardMode, overallAwards: saved.overallAwards, additionalNettAwards: saved.additionalNettAwards, nettTieBreakMethod: saved.nettTieBreakMethod });
  assert.deepEqual(result(reloaded.state), result(state));
});

test("saving again creates a distinct snapshot and rename/delete leave the working copy intact", () => {
  const store = memoryStore();
  store.setItem(TOURNAMENT_STORAGE_KEY, serializeTournament(state));
  saveTournamentSnapshot(store, "Same Name", state, "first");
  saveTournamentSnapshot(store, "Same Name", state, "second");
  assert.equal(readTournamentSnapshots(store).length, 2);
  renameTournamentSnapshot(store, "first", "Renamed");
  assert.equal(readTournamentSnapshots(store).find((snapshot) => snapshot.id === "first")?.name, "Renamed");
  assert.equal(readTournamentSnapshots(store)[0].name, "Same Name");
  deleteTournamentSnapshot(store, "first");
  assert.equal(readTournamentSnapshots(store).length, 1);
  assert.equal(store.getItem(TOURNAMENT_STORAGE_KEY), serializeTournament(state));
  assert.throws(() => saveTournamentSnapshot(store, "Another", state, "second"), /identity/);
  assert.throws(() => renameTournamentSnapshot(store, "second", " "), /name/);
});

test("invalid courses and corrupt snapshot libraries are rejected without overwriting storage", () => {
  assert.equal(parseSavedTournament(serializeTournament({ ...state, courseData: [{ id: 1, name: "Invalid", pars: [4] }] })), null);
  const store = memoryStore();
  store.setItem(SAVED_TOURNAMENTS_KEY, "corrupt");
  assert.throws(() => saveTournamentSnapshot(store, "Example", state));
  assert.equal(store.getItem(SAVED_TOURNAMENTS_KEY), "corrupt");
});
