import assert from "node:assert/strict";
import test from "node:test";
import { parseSavedTournament, serializeTournament, type SavedTournament } from "./tournament-storage.ts";

const saved: SavedTournament = {
  version: 1,
  step: 2,
  name: "PETRO GOLF",
  roundCount: 1,
  rounds: [{ id: 1, courseId: 10, players: 1 }],
  tournamentScores: { 1: [{ id: "player-1", name: "Imam Tajudi", pairing: "1A", handicap: 9, awardCategory: "A", jackpotTargetFront: 36, jackpotTargetBack: 37, scores: Array(18).fill(4) }] },
  flights: 2,
  flightLimits: [12],
  scoringSystem: "handicap",
  tournamentFormat: "psgc",
  overallAwards: true,
  awardMode: "gross-nett",
  system36AwardMode: "gross-nett",
  handicapAwardMode: "gross-nett",
  nettTieBreakMethod: "lower-handicap",
  system36NettTieBreakMethod: "lower-handicap",
  handicapNettTieBreakMethod: "lower-handicap",
  jackpot: { enabled: true, blindHoles: [3, 5, 13, 17], locked: true, revealed: false },
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

test("saved scoring-system tie-break methods round-trip independently and older tournaments receive defaults", () => {
  const roundTrip = parseSavedTournament(serializeTournament({ ...saved, system36NettTieBreakMethod: "countback", handicapNettTieBreakMethod: "lower-handicap" }));
  assert.equal(roundTrip?.system36NettTieBreakMethod, "countback");
  assert.equal(roundTrip?.handicapNettTieBreakMethod, "lower-handicap");
  const olderPsgc = { ...saved } as Record<string, unknown>;
  delete olderPsgc.nettTieBreakMethod;
  delete olderPsgc.system36NettTieBreakMethod;
  delete olderPsgc.handicapNettTieBreakMethod;
  assert.equal(parseSavedTournament(JSON.stringify(olderPsgc))?.nettTieBreakMethod, "lower-handicap");
  const olderStandard = { ...olderPsgc, tournamentFormat: "standard" };
  assert.equal(parseSavedTournament(JSON.stringify(olderStandard))?.nettTieBreakMethod, "countback");
  const olderSystem36 = { ...olderPsgc, scoringSystem: "system36", nettTieBreakMethod: "countback" };
  assert.equal(parseSavedTournament(JSON.stringify(olderSystem36))?.nettTieBreakMethod, "lower-handicap");
});
test("Jackpot settings and targets persist, while older tournaments default to Jackpot off", () => {
  const restored = parseSavedTournament(serializeTournament(saved));
  assert.deepEqual(restored?.jackpot, saved.jackpot);
  assert.equal(restored?.tournamentScores[1][0].jackpotTargetFront, 36);
  const older = { ...saved } as Record<string, unknown>;
  delete older.jackpot;
  assert.deepEqual(parseSavedTournament(JSON.stringify(older))?.jackpot, { enabled: false, blindHoles: [], locked: false, revealed: false });
});
test("Split 9-Hole format persists as a Handicap tournament format", () => {
  const splitNine = { ...saved, tournamentFormat: "split9" as const, handicapNettTieBreakMethod: "countback" as const };
  const restored = parseSavedTournament(serializeTournament(splitNine));
  assert.equal(restored?.tournamentFormat, "split9");
  assert.equal(restored?.scoringSystem, "handicap");
});
test("Award Mode persists for Handicap tournaments and older saves default to Gross + Nett", () => {
  const nettOnly = parseSavedTournament(serializeTournament({ ...saved, awardMode: "nett-only" }));
  assert.equal(nettOnly?.awardMode, "nett-only");
  const older = { ...saved } as Record<string, unknown>;
  delete older.awardMode;
  assert.equal(parseSavedTournament(JSON.stringify(older))?.awardMode, "gross-nett");
});
test("Award Mode stores separate selections for System 36 and Handicap", () => {
  const restored = parseSavedTournament(serializeTournament({ ...saved, system36AwardMode: "nett-only", handicapAwardMode: "gross-nett" }));
  assert.equal(restored?.system36AwardMode, "nett-only");
  assert.equal(restored?.handicapAwardMode, "gross-nett");
  const legacySystem36 = { ...saved, scoringSystem: "system36", awardMode: "nett-only" } as Record<string, unknown>;
  delete legacySystem36.system36AwardMode;
  delete legacySystem36.handicapAwardMode;
  const legacyRestored = parseSavedTournament(JSON.stringify(legacySystem36));
  assert.equal(legacyRestored?.system36AwardMode, "nett-only");
  assert.equal(legacyRestored?.handicapAwardMode, "gross-nett");
});
test("zero Flights with no boundaries and disabled Overall Awards persist", () => {
  const restored = parseSavedTournament(serializeTournament({ ...saved, flights: 0, flightLimits: [], overallAwards: false }));
  assert.equal(restored?.flights, 0);
  assert.deepEqual(restored?.flightLimits, []);
  assert.equal(restored?.overallAwards, false);
});
