import assert from "node:assert/strict";
import test from "node:test";
import { clearScoreValues, formatScoreClipboard, parseScoreClipboard, pasteScoreValues } from "./score-clipboard.ts";
import { handicapScoreSummary, scoreSummary, type Player } from "./scoring.ts";
import { parseSavedTournament, serializeTournament, type SavedTournament } from "./tournament-storage.ts";

const blankScores = Array<number | null>(18).fill(null);
const sourceScores = Array.from({ length: 18 }, (_, index) => index % 5 + 3);

const paste = (scores: Array<number | null>, start: number, clipboard: string) => {
  const parsed = parseScoreClipboard(clipboard);
  assert.equal(parsed.ok, true);
  return pasteScoreValues(scores, start, parsed.values);
};

test("copies and pastes one score cell without affecting the rest of the card", () => {
  const result = paste(blankScores, 4, formatScoreClipboard(sourceScores, 2, 2));
  assert.equal(result[4], sourceScores[2]);
  assert.equal(result[3], null);
  assert.equal(result[5], null);
});

test("copies a multi-cell tab-separated range and clips it at H18", () => {
  const result = paste(blankScores, 15, "4\t5\t6\t7\t8");
  assert.deepEqual(result.slice(15), [4, 5, 6]);
});

test("copies and pastes a complete H1-H18 score row", () => {
  const clipboard = formatScoreClipboard(sourceScores, 0, 17);
  assert.equal(clipboard.split("\t").length, 18);
  assert.deepEqual(paste(blankScores, 0, clipboard), sourceScores);
});

test("rejects invalid clipboard text atomically", () => {
  const current = Array(18).fill(5) as Array<number | null>;
  const parsed = parseScoreClipboard("4\tbad\t6");
  assert.equal(parsed.ok, false);
  assert.deepEqual(current, Array(18).fill(5));
});

test("pasting scores preserves player metadata and recalculates through existing engines", () => {
  const player: Player = { id: "destination", name: "Destination", pairing: "2A", handicap: 9, awardCategory: "B", scores: blankScores };
  const scores = paste(player.scores, 0, Array(18).fill(4).join("\t"));
  const updated = { ...player, scores };
  assert.equal(updated.name, "Destination");
  assert.equal(updated.pairing, "2A");
  assert.equal(updated.handicap, 9);
  assert.equal(updated.awardCategory, "B");
  assert.equal(scoreSummary(updated.scores, Array(18).fill(4)).gross, 72);
  assert.equal(handicapScoreSummary(updated.scores, Array(18).fill(4), updated.handicap ?? 0).nett, 63);
});

test("pasted scorecards round-trip through existing tournament persistence", () => {
  const scores = paste(blankScores, 0, Array(18).fill(4).join("\t"));
  const tournament: SavedTournament = {
    version: 1, step: 2, name: "Clipboard test", roundCount: 1,
    rounds: [{ id: 1, courseId: 1, players: 1 }],
    tournamentScores: { 1: [{ id: "player", name: "Player", pairing: "1", scores }] },
    flights: 0, flightLimits: [], scoringSystem: "system36", tournamentFormat: "standard",
  };
  assert.deepEqual(parseSavedTournament(serializeTournament(tournament))?.tournamentScores[1][0].scores, scores);
});
test("a Shift-click range retains its active anchor and copies the contiguous score cells", () => {
  const anchor = 0;
  const shiftClicked = 17;
  const clipboard = formatScoreClipboard(sourceScores, anchor, shiftClicked);
  assert.deepEqual(paste(blankScores, 0, clipboard), sourceScores);
});

test("clearing a player scorecard removes only H1-H18 values", () => {
  const player: Player = { id: "player", name: "Player", pairing: "3A", handicap: 12, awardCategory: "C", scores: [...sourceScores] };
  const updated = { ...player, scores: clearScoreValues(player.scores) };
  assert.deepEqual(updated.scores, Array(18).fill(null));
  assert.equal(updated.name, "Player");
  assert.equal(updated.pairing, "3A");
  assert.equal(updated.handicap, 12);
  assert.equal(updated.awardCategory, "C");
});