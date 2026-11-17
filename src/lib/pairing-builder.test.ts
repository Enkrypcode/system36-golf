import assert from "node:assert/strict";
import test from "node:test";
import { addPairing, applyPairingDraft, assignPairing, createPairingDraft, pairingSearchText, sortPairingCodes } from "./pairing-builder.ts";
import { parseSavedTournament, serializeTournament } from "./tournament-storage.ts";
import { scoreSummary, type Player } from "./scoring.ts";

const roster: Player[] = [
  { id: "a", name: "KUNCORO KUKUH", pairing: "7a", handicap: 9, awardCategory: "A", scores: Array(18).fill(4) },
  { id: "b", name: "Other player", pairing: "", handicap: 13, scores: Array(18).fill(5) },
];

test("pairing creation normalizes codes and prevents blank or duplicate groups", () => {
  const draft = createPairingDraft(roster);
  assert.deepEqual(draft.codes, ["7A"]);
  assert.deepEqual(addPairing(draft, " 1b ").draft.codes, ["1B", "7A"]);
  assert.match(addPairing(draft, "7a").error!, /already exists/);
  assert.ok(addPairing(draft, " ").error);
  assert.deepEqual(sortPairingCodes(["10A", "2B", "1B", "2A", "1A"]), ["1A", "1B", "2A", "2B", "10A"]);
  assert.ok(pairingSearchText(roster[0].name).includes(pairingSearchText(" KUK ")));
  assert.equal(pairingSearchText(" Other   player "), "other player");
});

test("assign, move, and remove use one assignment per stable player identity", () => {
  let draft = addPairing(createPairingDraft(roster), "1A").draft;
  draft = assignPairing(draft, "b", "1A");
  draft = assignPairing(draft, "b", "7A");
  assert.equal(Object.values(draft.assignments).filter((code) => code === "1A").length, 0);
  assert.equal(draft.assignments.b, "7A");
  draft = assignPairing(draft, "b", "");
  assert.equal(draft.assignments.b, "");
  assert.equal(Object.values(draft.assignments).filter(Boolean).length, 1);
  assert.equal(assignPairing(draft, "unknown", "1A"), draft);
  assert.equal(assignPairing(draft, "a", "unknown"), draft);
  assert.equal(roster[0].pairing, "7a", "draft editing leaves source untouched");
});

test("applying a large roster changes only Pairing and persists with existing storage", () => {
  for (const size of [20, 40, 69, 100]) {
    const players = Array.from({ length: size }, (_, index) => ({ ...roster[index % 2], id: String(index), name: `Player ${index}` }));
    let draft = addPairing(createPairingDraft(players), "10A").draft;
    for (const player of players) draft = assignPairing(draft, player.id, "10A");
    const applied = applyPairingDraft(players, draft);
    assert.equal(applied.length, size);
    assert.equal(new Set(applied.map((player) => player.id)).size, size);
    assert.ok(applied.every((player) => player.pairing === "10A"));
    applied.forEach((player, index) => {
      assert.deepEqual({ ...player, pairing: players[index].pairing }, players[index]);
      assert.deepEqual(scoreSummary(player.scores, Array(18).fill(4)), scoreSummary(players[index].scores, Array(18).fill(4)));
    });
    const restored = parseSavedTournament(serializeTournament({
      version: 1, step: 2, name: "Pairing test", roundCount: 1, rounds: [{ id: 1, courseId: 1, players: size }],
      tournamentScores: { 1: applied }, flights: 0, flightLimits: [],
    }));
    assert.ok(restored);
    const reopened = createPairingDraft(restored.tournamentScores[1]);
    assert.deepEqual(reopened.assignments, draft.assignments);
    assert.deepEqual(reopened.codes, ["10A"], "reopening reconstructs groups from persisted player Pairing values");
  }
});
