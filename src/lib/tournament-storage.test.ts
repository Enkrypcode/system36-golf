import assert from "node:assert/strict";
import test from "node:test";
import { parseSavedTournament, serializeTournament, type SavedTournament } from "./tournament-storage.ts";

const saved: SavedTournament = {
  version: 1,
  step: 2,
  name: "PETRO GOLF",
  roundCount: 1,
  rounds: [{ id: 1, courseId: 10, players: 1 }],
  tournamentScores: { 1: [{ id: "player-1", name: "Imam Tajudi", pairing: "1A", handicap: 0, scores: Array(18).fill(4) }] },
  flights: 2,
  flightLimits: [12],
};

test("saved tournament state round-trips without derived scoring data", () => {
  assert.deepEqual(parseSavedTournament(serializeTournament(saved)), saved);
});

test("malformed, obsolete, and incomplete saved tournament data is rejected", () => {
  assert.equal(parseSavedTournament("not JSON"), null);
  assert.equal(parseSavedTournament(JSON.stringify({ ...saved, version: 2 })), null);
  assert.equal(parseSavedTournament(JSON.stringify({ ...saved, tournamentScores: { 1: [{ ...saved.tournamentScores[1][0], scores: [4] }] } })), null);
});
