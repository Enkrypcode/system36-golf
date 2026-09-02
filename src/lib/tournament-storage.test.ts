import assert from "node:assert/strict";
import test from "node:test";
import { parseSavedTournament, serializeTournament, type SavedTournament } from "./tournament-storage.ts";

const saved: SavedTournament = {
  version: 1,
  step: 2,
  name: "PETRO GOLF",
  roundCount: 1,
  rounds: [{ id: 1, courseId: 10, players: 1 }],
  tournamentScores: { 1: [{ id: "player-1", name: "Imam Tajudi", pairing: "1A", handicap: 9, awardCategory: "A", scores: Array(18).fill(4) }] },
  flights: 2,
  flightLimits: [12],
  scoringSystem: "handicap",
  tournamentFormat: "psgc",
  nettTieBreakMethod: "lower-handicap",
};

test("saved tournament state round-trips without derived scoring data", () => {
  assert.deepEqual(parseSavedTournament(serializeTournament(saved)), saved);
});

test("malformed, obsolete, and incomplete saved tournament data is rejected", () => {
  assert.equal(parseSavedTournament("not JSON"), null);
  assert.equal(parseSavedTournament(JSON.stringify({ ...saved, version: 2 })), null);
  assert.equal(parseSavedTournament(JSON.stringify({ ...saved, tournamentScores: { 1: [{ ...saved.tournamentScores[1][0], scores: [4] }] } })), null);
});

test("older saved tournaments restore as System 36", () => {
  const older = { ...saved } as Record<string, unknown>;
  delete older.scoringSystem;
  delete older.tournamentFormat;
  const restored = parseSavedTournament(JSON.stringify(older));
  assert.equal(restored?.scoringSystem, "system36");
});

test("saved Handicap tie-break methods round-trip and older tournaments receive format defaults", () => {
  assert.equal(parseSavedTournament(serializeTournament({ ...saved, nettTieBreakMethod: "countback" }))?.nettTieBreakMethod, "countback");
  const olderPsgc = { ...saved } as Record<string, unknown>;
  delete olderPsgc.nettTieBreakMethod;
  assert.equal(parseSavedTournament(JSON.stringify(olderPsgc))?.nettTieBreakMethod, "lower-handicap");
  const olderStandard = { ...olderPsgc, tournamentFormat: "standard" };
  assert.equal(parseSavedTournament(JSON.stringify(olderStandard))?.nettTieBreakMethod, "countback");
});