import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { readSheet } from "read-excel-file/node";
import { applyScoreImport, previewScoreImport, previewScoreImportFile } from "./score-import.ts";
import { handicapScoreSummary, scoreSummary, type Player } from "./scoring.ts";
import { parseSavedTournament, serializeTournament, type SavedTournament } from "./tournament-storage.ts";
import { scoreEntryFullCsv, scoreEntryResultsCsv } from "./score-entry-export.ts";

const players: Player[] = [
  { id: "fikri", name: "Fikri", pairing: "1A", scores: Array(18).fill(null) },
  { id: "kukuh", name: "Kukuh", pairing: "2A", handicap: 9, awardCategory: "A", scores: Array(18).fill(5) },
];
const holeHeaders = Array.from({ length: 18 }, (_, index) => index % 3 === 0 ? `Hole ${index + 1}` : index % 3 === 1 ? `H${index + 1}` : String(index + 1));
const scoreHeaders = ["Player Name", ...holeHeaders];
const fullHeaders = ["Name", "Handicap", "Flight", "Pairing", ...holeHeaders, "Front", "Back", "Gross", "Nett", "HCP36", "Point"];
const validScores = Array(18).fill(4);

test("Players + Scores normalizes names and preserves matched player metadata", () => {
  const preview = previewScoreImport([scoreHeaders, ["  FIKRI  ", ...validScores]], players, "players-scores");
  assert.equal(preview.rowsFound, 1);
  assert.equal(preview.entries.length, 1);
  const updated = applyScoreImport(players, preview.entries);
  assert.deepEqual(updated[0].scores, validScores);
  assert.equal(updated[0].pairing, "1A");
  assert.equal(updated[1].handicap, 9);
  assert.equal(updated[1].awardCategory, "A");
});

test("Players + Scores previews replacements, new players, invalid rows, and duplicate protection", () => {
  const preview = previewScoreImport([scoreHeaders, ["New Player", ...validScores], ["Kukuh", ...validScores], ["Fikri", ...validScores.slice(0, 17), "bad"], ["new   player", ...validScores]], players, "players-scores");
  assert.equal(preview.rowsFound, 4);
  assert.equal(preview.entries.length, 2);
  assert.equal(preview.newPlayerCount, 1);
  assert.equal(preview.matchedCount, 1);
  assert.equal(preview.invalid.length, 2);
  assert.match(preview.invalid[0].reason, /18 hole scores/);
  assert.match(preview.invalid[1].reason, /Duplicate player/);
  assert.equal(preview.replacementCount, 1);
  assert.equal(players[1].scores[0], 5);
});

test("XLSX and CSV score imports use Players + Scores headers", async () => {
  const rows = await readSheet(readFileSync(new URL("./fixtures/score-import.xlsx", import.meta.url)));
  const worksheetPreview = previewScoreImport(rows, players, "players-scores");
  assert.equal(worksheetPreview.entries[0].playerId, "fikri");
  const csv = [scoreHeaders, ["Fikri", ...validScores]].map((row) => row.join(",")).join("\n");
  const csvPreview = await previewScoreImportFile(new File([csv], "scores.csv", { type: "text/csv" }), players, "players-scores");
  assert.equal(csvPreview.entries[0].playerId, "fikri");
});

test("imported scorecards use the existing System 36 and Handicap summary engines", () => {
  const preview = previewScoreImport([scoreHeaders, ["Fikri", ...validScores], ["Kukuh", ...validScores]], players, "players-scores");
  const updated = applyScoreImport(players, preview.entries);
  assert.equal(scoreSummary(updated[0].scores, Array(18).fill(4)).gross, 72);
  assert.equal(handicapScoreSummary(updated[1].scores, Array(18).fill(4), updated[1].handicap ?? 0).nett, 63);
});

test("import application is current-round scoped by its supplied player roster", () => {
  const secondRound = [{ id: "fikri", name: "Fikri", pairing: "9A", scores: Array(18).fill(null) }];
  const preview = previewScoreImport([scoreHeaders, ["Fikri", ...validScores]], players, "players-scores");
  const firstRoundUpdated = applyScoreImport(players, preview.entries);
  assert.equal(firstRoundUpdated[0].scores[0], 4);
  assert.equal(secondRound[0].scores[0], null);
});

test("imported scores round-trip through normal tournament persistence", () => {
  const preview = previewScoreImport([scoreHeaders, ["Fikri", ...validScores]], players, "players-scores");
  const tournament: SavedTournament = {
    version: 1, step: 2, name: "Import test", roundCount: 1,
    rounds: [{ id: 1, courseId: 1, players: 2 }], tournamentScores: { 1: applyScoreImport(players, preview.entries) },
    flights: 1, flightLimits: [], scoringSystem: "system36", tournamentFormat: "standard",
  };
  assert.deepEqual(parseSavedTournament(serializeTournament(tournament))?.tournamentScores[1][0].scores, validScores);
});

test("Players Only imports roster metadata without requiring or changing scorecards", () => {
  const rosterHeaders = ["Name", "Handicap", "Flight", "Pairing"];
  const preview = previewScoreImport([rosterHeaders, ["  FIKRI  ", "11.5", "b", " 3a "], ["New   Player", "", "", ""]], players, "players-only");
  assert.equal(preview.rowsFound, 2);
  assert.equal(preview.matchedCount, 1);
  assert.equal(preview.newPlayerCount, 1);
  assert.equal(preview.replacementCount, 0);
  const updated = applyScoreImport(players, preview.entries, { createPlayerId: (_entry, index) => `roster-${index}` });
  assert.deepEqual(updated[0].scores, Array(18).fill(null));
  assert.equal(updated[0].handicap, 11.5);
  assert.equal(updated[0].awardCategory, "B");
  assert.equal(updated[0].pairing, "3A");
  assert.deepEqual(updated[2], { id: "roster-0", name: "New Player", scores: Array(18).fill(null) });
});

test("Players + Scores adds safely unmatched players while preserving matched player metadata", () => {
  const preview = previewScoreImport([scoreHeaders, ["  FIKRI  ", ...validScores], ["New   Player", ...Array(18).fill(5)]], players, "players-scores");
  assert.equal(preview.rowsFound, 2);
  assert.equal(preview.matchedCount, 1);
  assert.equal(preview.newPlayerCount, 1);
  const updated = applyScoreImport(players, preview.entries, { createPlayerId: (_entry, index) => `new-${index}` });
  assert.equal(updated.length, 3);
  assert.equal(updated[0].id, "fikri");
  assert.equal(updated[0].pairing, "1A");
  assert.deepEqual(updated[0].scores, validScores);
  assert.deepEqual(updated[2], { id: "new-0", name: "New Player", scores: Array(18).fill(5) });
});

test("Full Roster + Scores imports metadata and scores while ignoring derived columns", () => {
  const preview = previewScoreImport([fullHeaders, ["Fikri", "12.5", "C", "4a", ...validScores, "999", "999", "999", "999", "999", "999"], ["New Player", "8", "A", "5B", ...Array(18).fill(5), "0", "0", "0", "0", "0", "0"]], players, "full-roster-scores");
  assert.equal(preview.matchedCount, 1);
  assert.equal(preview.newPlayerCount, 1);
  assert.equal(preview.replacementCount, 0);
  const updated = applyScoreImport(players, preview.entries, { createPlayerId: (_entry, index) => `full-${index}` });
  assert.deepEqual(updated[0], { id: "fikri", name: "Fikri", pairing: "4A", handicap: 12.5, awardCategory: "C", scores: validScores });
  assert.deepEqual(updated[2], { id: "full-0", name: "New Player", pairing: "5B", handicap: 8, awardCategory: "A", scores: Array(18).fill(5) });
  assert.equal(scoreSummary(updated[0].scores, Array(18).fill(4)).gross, 72, "derived columns in the source are ignored");
});

test("Full Roster + Scores accepts optional metadata and still checks Name and hole headers", () => {
  const missingMetadata = previewScoreImport([["Name", ...holeHeaders], ["Fikri", ...validScores]], players, "full-roster-scores");
  assert.equal(missingMetadata.headerError, undefined);
  assert.equal(missingMetadata.entries.length, 1);
  assert.match(previewScoreImport([holeHeaders, validScores], players, "full-roster-scores").headerError ?? "", /Name/);
  const missingScores = previewScoreImport([["Name", "Handicap", "Flight", "Pairing"], ["Fikri", 9, "A", "1A"]], players, "full-roster-scores");
  assert.match(missingScores.headerError ?? "", /H1–H18/);
});

test("Full Roster + Scores accepts all blank holes and preserves them as unplayed", () => {
  const preview = previewScoreImport([fullHeaders, ["Kukuh", "", "", "", ...Array(18).fill("")]], players, "full-roster-scores");
  assert.equal(preview.invalid.length, 0);
  assert.equal(preview.entries.length, 1);
  const updated = applyScoreImport(players, preview.entries);
  assert.deepEqual(updated[1].scores, Array(18).fill(null));
  assert.equal(updated[1].handicap, undefined);
  assert.equal(updated[1].awardCategory, undefined);
  assert.equal(updated[1].pairing, "");
  assert.equal(preview.replacementCount, 1);
});

test("Full Roster + Scores supports partial and complete cards with per-hole validation", () => {
  for (const scores of [[4, "", 5, null, ...Array(14).fill(" ")], validScores]) {
    const preview = previewScoreImport([fullHeaders, ["Fikri", 9, "A", "1A", ...scores]], players, "full-roster-scores");
    assert.equal(preview.invalid.length, 0);
    assert.deepEqual(applyScoreImport(players, preview.entries)[0].scores, scores.map((score) => typeof score === "number" ? score : null));
  }
  for (const invalid of ["bad", 0, 16, -1, 4.5]) {
    const preview = previewScoreImport([fullHeaders, ["Fikri", 9, "A", "1A", ...Array(17).fill(""), invalid]], players, "full-roster-scores");
    assert.equal(preview.invalid.length, 1);
    assert.equal(preview.entries.length, 0);
    assert.match(preview.invalid[0].reason, /whole numbers from 1 to 15/);
    assert.deepEqual(applyScoreImport(players, preview.entries), players);
  }
});

test("Full Export imports back with targets and incomplete scores through normal persistence", async () => {
  const source: Player[] = [
    { id: "a", name: "Unplayed", handicap: 0, awardCategory: "D", pairing: "7A", jackpotTargetFront: 0, jackpotTargetBack: 42.5, scores: Array(18).fill(null) },
    { id: "b", name: "Partial", handicap: 9.5, awardCategory: "A", pairing: "2B", jackpotTargetFront: 40, jackpotTargetBack: 43, scores: [...Array(9).fill(4), ...Array(9).fill(null)] },
    { id: "c", name: "Complete", handicap: 12, awardCategory: "SS", scores: validScores },
  ];
  const preview = await previewScoreImportFile(new File([scoreEntryFullCsv(source)], "backup.csv"), [], "full-roster-scores");
  assert.equal(preview.invalid.length, 0);
  assert.equal(preview.newPlayerCount, 3);
  const restored = applyScoreImport([], preview.entries, { createPlayerId: (_entry, index) => source[index].id });
  source.forEach((player, index) => {
    assert.deepEqual(restored[index].scores, player.scores);
    assert.equal(restored[index].handicap, player.handicap);
    assert.equal(restored[index].awardCategory, player.awardCategory);
    assert.equal(restored[index].pairing ?? "", player.pairing ?? "");
    assert.equal(restored[index].jackpotTargetFront, player.jackpotTargetFront);
    assert.equal(restored[index].jackpotTargetBack, player.jackpotTargetBack);
  });
  for (const scoringSystem of ["handicap", "system36"] as const) {
    const resultRows = scoreEntryResultsCsv(restored, Array(18).fill(4), { scoringSystem, tournamentFormat: "standard" }).split("\r\n");
    const derivedCount = scoringSystem === "handicap" ? 4 : 6;
    assert.deepEqual(resultRows[1].split(",").slice(-derivedCount), Array(derivedCount).fill(""));
    assert.deepEqual(resultRows[2].split(",").slice(-derivedCount), Array(derivedCount).fill(""));
    assert.ok(resultRows[3].split(",").slice(-derivedCount).every((cell) => cell !== ""));
  }
  const saved = parseSavedTournament(serializeTournament({
    version: 1, step: 2, name: "Backup", roundCount: 1, rounds: [{ id: 1, courseId: 1, players: 3 }],
    tournamentScores: { 1: restored }, flights: 0, flightLimits: [],
  }));
  assert.deepEqual(saved?.tournamentScores[1], JSON.parse(JSON.stringify(restored)), "serialization omits undefined optional fields while preserving all input values");
});
