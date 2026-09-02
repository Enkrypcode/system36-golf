import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { readSheet } from "read-excel-file/node";
import { applyScoreImport, previewScoreImport, previewScoreImportFile } from "./score-import.ts";
import { handicapScoreSummary, scoreSummary, type Player } from "./scoring.ts";
import { parseSavedTournament, serializeTournament, type SavedTournament } from "./tournament-storage.ts";

const players: Player[] = [
  { id: "fikri", name: "Fikri", pairing: "1A", scores: Array(18).fill(null) },
  { id: "kukuh", name: "Kukuh", pairing: "2A", handicap: 9, awardCategory: "A", scores: Array(18).fill(5) },
];
const headers = ["Player Name", ...Array.from({ length: 18 }, (_, index) => index % 3 === 0 ? `Hole ${index + 1}` : index % 3 === 1 ? `H${index + 1}` : String(index + 1))];
const validScores = Array(18).fill(4);

test("score import normalizes headers, names, and leaves non-score player data intact", () => {
  const preview = previewScoreImport([headers, ["  FIKRI  ", ...validScores]], players);
  assert.equal(preview.rowsFound, 1);
  assert.equal(preview.entries.length, 1);
  const updated = applyScoreImport(players, preview.entries);
  assert.deepEqual(updated[0].scores, validScores);
  assert.equal(updated[0].pairing, "1A");
  assert.equal(updated[1].handicap, 9);
  assert.equal(updated[1].awardCategory, "A");
});

test("score import previews unmatched, invalid, and replacement rows without applying them", () => {
  const preview = previewScoreImport([headers, ["Unknown Player", ...validScores], ["Kukuh", ...validScores], ["Fikri", ...validScores.slice(0, 17), "bad"]], players);
  assert.equal(preview.rowsFound, 3);
  assert.equal(preview.entries.length, 1);
  assert.equal(preview.unmatched[0].name, "Unknown Player");
  assert.match(preview.invalid[0].reason, /18 hole scores/);
  assert.equal(preview.replacementCount, 1);
  assert.equal(players[1].scores[0], 5);
});

test("XLSX score import reads the first worksheet", async () => {
  const rows = await readSheet(readFileSync(new URL("./fixtures/score-import.xlsx", import.meta.url)));
  const preview = previewScoreImport(rows, players);
  assert.equal(preview.entries[0].playerId, "fikri");
});

test("CSV score import reads a score file", async () => {
  const csv = [headers, ["Fikri", ...validScores]].map((row) => row.join(",")).join("\n");
  const preview = await previewScoreImportFile(new File([csv], "scores.csv", { type: "text/csv" }), players);
  assert.equal(preview.entries[0].playerId, "fikri");
});

test("imported scorecards use the existing System 36 and Handicap summary engines", () => {
  const preview = previewScoreImport([headers, ["Fikri", ...validScores], ["Kukuh", ...validScores]], players);
  const updated = applyScoreImport(players, preview.entries);
  assert.equal(scoreSummary(updated[0].scores, Array(18).fill(4)).gross, 72);
  assert.equal(handicapScoreSummary(updated[1].scores, Array(18).fill(4), updated[1].handicap ?? 0).nett, 63);
});

test("import application is current-round scoped by its supplied player roster", () => {
  const secondRound = [{ id: "fikri", name: "Fikri", pairing: "9A", scores: Array(18).fill(null) }];
  const preview = previewScoreImport([headers, ["Fikri", ...validScores]], players);
  const firstRoundUpdated = applyScoreImport(players, preview.entries);
  assert.equal(firstRoundUpdated[0].scores[0], 4);
  assert.equal(secondRound[0].scores[0], null);
});

test("imported scores round-trip through normal tournament persistence", () => {
  const preview = previewScoreImport([headers, ["Fikri", ...validScores]], players);
  const tournament: SavedTournament = {
    version: 1, step: 2, name: "Import test", roundCount: 1,
    rounds: [{ id: 1, courseId: 1, players: 2 }], tournamentScores: { 1: applyScoreImport(players, preview.entries) },
    flights: 1, flightLimits: [], scoringSystem: "system36", tournamentFormat: "standard",
  };
  assert.deepEqual(parseSavedTournament(serializeTournament(tournament))?.tournamentScores[1][0].scores, validScores);
});