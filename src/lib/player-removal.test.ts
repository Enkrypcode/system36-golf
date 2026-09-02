import assert from "node:assert/strict";
import test from "node:test";

import { addPlayerToRound, addPlayerToTournament, blankPlayer, playerSnapshots, removePlayerFromRound, removePlayerFromTournament, restorePlayerSnapshots, synchronizeRoundPlayerCounts } from "./player-removal.ts";
import type { Player } from "./scoring.ts";
import { calculateTournamentWinners } from "./winner-engine.ts";
import { parseSavedTournament, serializeTournament } from "./tournament-storage.ts";

const scores = Array<number>(18).fill(4);
const player = (id: string, name: string, extras: Partial<Player> = {}): Player => ({ id, name, pairing: "2A", scores, ...extras });

test("removing from a round preserves the same player and metadata in other rounds", () => {
  const initial = {
    1: [player("imam", "Imam Tajudi", { handicap: 9, awardCategory: "A" })],
    2: [player("imam", "Imam Tajudi", { handicap: 9, awardCategory: "A" })],
  };
  const removed = removePlayerFromRound(initial, 1, "imam");

  assert.deepEqual(removed[1], []);
  assert.equal(removed[2][0].id, "imam");
  assert.equal(removed[2][0].handicap, 9);
  assert.equal(removed[2][0].awardCategory, "A");
});

test("removing a player from the tournament removes every scorecard and winner candidate", () => {
  const initial = {
    1: [player("winner", "Winner"), player("other", "Other")],
    2: [player("winner", "Winner"), player("other", "Other")],
  };
  const removed = removePlayerFromTournament(initial, "winner");
  const result = calculateTournamentWinners([
    { id: 1, pars: scores, players: removed[1] },
    { id: 2, pars: scores, players: removed[2] },
  ], 1, [], { scoringSystem: "system36" });

  assert.equal(Object.values(removed).flat().some((item) => item.id === "winner"), false);
  assert.equal(result.eligible.some((item) => item.key === "winner"), false);
  assert.equal(result.awards.some((award) => award.winner?.key === "winner"), false);
});

test("removing a player from one required round makes that player ineligible", () => {
  const initial = { 1: [player("imam", "Imam Tajudi")], 2: [player("imam", "Imam Tajudi")] };
  const removed = removePlayerFromRound(initial, 2, "imam");
  const result = calculateTournamentWinners([
    { id: 1, pars: scores, players: removed[1] },
    { id: 2, pars: scores, players: removed[2] },
  ], 1, [], { scoringSystem: "system36" });

  assert.equal(result.eligible.length, 0);
  assert.equal(result.notEligible, 1);
});

test("removal uses the stable player ID regardless of sorted or filtered row order", () => {
  const initial = { 1: [player("a", "Zaki"), player("b", "Aji"), player("c", "Kukuh")] };
  const visibleSorted = [...initial[1]].sort((left, right) => left.name.localeCompare(right.name));
  const targetId = visibleSorted[0].id;
  const removed = removePlayerFromRound(initial, 1, targetId);

  assert.equal(targetId, "b");
  assert.deepEqual(removed[1].map((item) => item.id), ["a", "c"]);
});

test("removing a PSGC player removes that player from the explicit category and its awards", () => {
  const initial = {
    1: [
      player("a", "Flight A", { handicap: 9, awardCategory: "A" }),
      player("ss", "Super Senior", { handicap: 11, awardCategory: "SS" }),
    ],
  };
  const removed = removePlayerFromTournament(initial, "ss");
  const result = calculateTournamentWinners([{ id: 1, pars: scores, players: removed[1] }], 3, [14, 19], { scoringSystem: "handicap", tournamentFormat: "psgc" });

  assert.equal(result.flights.SS.length, 0);
  assert.equal(result.awards.some((award) => award.winner?.key === "ss"), false);
});

test("a reduced round roster remains reduced after persistence restore", () => {
  const saved = {
    version: 1 as const, step: 2 as const, name: "Removal test", roundCount: 1,
    rounds: [{ id: 1, courseId: 44, players: 2 }], tournamentScores: { 1: [player("a", "Aji")] },
    flights: 1, flightLimits: [], scoringSystem: "system36" as const, tournamentFormat: "standard" as const,
  };
  const restored = parseSavedTournament(serializeTournament(saved));

  assert.equal(restored?.tournamentScores[1].length, 1);
  assert.equal(restored?.tournamentScores[1][0].id, "a");
});
test("roster counts follow 40 → remove → undo and can never remain stale", () => {
  const roster = Array.from({ length: 40 }, (_, index) => player(`player-${index + 1}`, `Player ${index + 1}`));
  const rounds = [{ id: 1, players: 40 }];
  const removed = removePlayerFromRound({ 1: roster }, 1, "player-1");
  const snapshots = playerSnapshots({ 1: roster }, "player-1", [1]);
  const restored = restorePlayerSnapshots(removed, snapshots);

  assert.equal(synchronizeRoundPlayerCounts(rounds, removed)[0].players, 39);
  assert.equal(synchronizeRoundPlayerCounts(rounds, restored)[0].players, 40);
  assert.equal(restored[1][0].id, "player-1");
});

test("Add Player creates blank stable identities for one round or every round", () => {
  const added = blankPlayer("new-player");
  const singleRound = addPlayerToRound({ 1: [player("a", "Aji")] }, 1, added);
  const tournament = addPlayerToTournament({ 1: [player("a", "Aji")], 2: [player("a", "Aji")] }, [1, 2], added);

  assert.equal(singleRound[1].at(-1)?.id, "new-player");
  assert.equal(singleRound[1].at(-1)?.name, "");
  assert.equal(singleRound[1].at(-1)?.scores.every((score) => score === null), true);
  assert.equal(tournament[1].at(-1)?.id, "new-player");
  assert.equal(tournament[2].at(-1)?.id, "new-player");
  assert.notEqual(tournament[1].at(-1)?.scores, tournament[2].at(-1)?.scores);
});

test("Undo restores PSGC Flight and Super Senior metadata in the original position", () => {
  const ss = player("ss", "Tato K. Sudarto", { handicap: 18, pairing: "6B", awardCategory: "SS" });
  const initial = { 1: [player("a", "Aji", { awardCategory: "A" }), ss] };
  const snapshots = playerSnapshots(initial, "ss", [1]);
  const restored = restorePlayerSnapshots(removePlayerFromTournament(initial, "ss"), snapshots);

  assert.equal(restored[1][1].id, "ss");
  assert.equal(restored[1][1].awardCategory, "SS");
  assert.equal(restored[1][1].handicap, 18);
  assert.equal(restored[1][1].pairing, "6B");
});

test("the roster after add, remove, and undo persists with its exact IDs", () => {
  const before = { 1: [player("a", "Aji"), player("b", "Bambang")] };
  const snapshots = playerSnapshots(before, "a", [1]);
  const finalRoster = addPlayerToRound(restorePlayerSnapshots(removePlayerFromRound(before, 1, "a"), snapshots), 1, blankPlayer("new"));
  const saved = { version: 1 as const, step: 2 as const, name: "Roster persistence", roundCount: 1, rounds: [{ id: 1, courseId: 44, players: 3 }], tournamentScores: finalRoster, flights: 1, flightLimits: [], scoringSystem: "system36" as const, tournamentFormat: "standard" as const };
  const restored = parseSavedTournament(serializeTournament(saved));

  assert.deepEqual(restored?.tournamentScores[1].map((item) => item.id), ["a", "b", "new"]);
});