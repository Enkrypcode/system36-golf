import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { readSheet } from "read-excel-file/node";
import { previewPairingImport, previewPairingImportFile, applyPairingImport } from "./pairing-import.ts";
import { createPairingDraft, applyPairingDraft } from "./pairing-builder.ts";
import { parseSavedTournament, serializeTournament } from "./tournament-storage.ts";
import type { Player } from "./scoring.ts";

const players: Player[] = [
  { id: "a", name: "KUNCORO KUKUH", pairing: "6A", handicap: 9, awardCategory: "A", jackpotTargetFront: 40, jackpotTargetBack: 41, scores: Array(18).fill(4) },
  { id: "b", name: "AJI PRAYUDI", pairing: "1A", scores: Array(18).fill(5) },
];

test("pairing CSV matches exact normalized names, quoted names, aliases, and normalized codes", async () => {
  for (const name of ["Name", "Player Name", "Nama"]) {
    for (const pairing of ["Pairing", "Group", "Pair"]) {
      const preview = await previewPairingImportFile(new File([
        `\uFEFF${name},${pairing}\r\n" kuncoro   kukuh ", 7a \r\nAJI PRAYUDI,1b\r\nUnknown,2A`,
      ], "pairings.csv"), players);
      assert.equal(preview.rowsFound, 3);
      assert.equal(preview.entries.length, 2);
      assert.equal(preview.entries[0].pairing, "7A");
      assert.equal(preview.entries[0].previous, "6A");
      assert.equal(preview.replacementCount, 2);
      assert.equal(preview.unmatched[0].name, "Unknown");
      assert.equal(preview.invalid.length, 0);
    }
  }
  const preview = previewPairingImport([["Name", "Pairing"], ["KUNCORO KUKU", "7A"]], players);
  assert.equal(preview.entries.length, 0, "names are not fuzzy matched");
});

test("all duplicate/conflicting rows are excluded and ambiguous roster names are invalid", () => {
  const preview = previewPairingImport([
    ["Name", "Pairing"], ["KUNCORO KUKUH", "7A"], ["kuncoro  kukuh", "8A"], ["AJI PRAYUDI", "1A"],
  ], players);
  assert.equal(preview.invalid.length, 2);
  assert.deepEqual(preview.entries.map((entry) => entry.playerId), ["b"]);
  const ambiguous = previewPairingImport([["Name", "Group"], ["AJI PRAYUDI", "3B"]], [...players, { ...players[1], id: "c" }]);
  assert.equal(ambiguous.invalid.length, 1);
  assert.equal(ambiguous.entries.length, 0);
  assert.ok(previewPairingImport([["Name"], ["Someone"]], players).headerError);
});

test("blank Pairing clears assignment and import preserves every other player field", () => {
  const preview = previewPairingImport([["Name", "Pairing", "Gross"], ["KUNCORO KUKUH", "7a", 999], ["AJI PRAYUDI", "", 999]], players);
  const draft = applyPairingImport(createPairingDraft(players), preview.entries);
  assert.equal(draft.assignments.a, "7A");
  assert.equal(draft.assignments.b, "");
  assert.ok(draft.codes.includes("7A"), "the imported group appears immediately");
  const updated = applyPairingDraft(players, draft);
  updated.forEach((player, index) => assert.deepEqual({ ...player, pairing: players[index].pairing }, players[index]));
  assert.equal(updated.length, players.length);
  assert.equal(players[0].pairing, "6A", "preview leaves the source untouched");
  const saved = parseSavedTournament(serializeTournament({
    version: 1, step: 2, name: "Pairings", roundCount: 1, rounds: [{ id: 1, courseId: 1, players: 2 }],
    tournamentScores: { 1: updated }, pairingGroups: { 1: draft.codes }, flights: 0, flightLimits: [],
  }));
  assert.ok(saved);
  assert.deepEqual(createPairingDraft(saved.tournamentScores[1], saved.pairingGroups?.[1]), draft);
});

test("XLSX pairing worksheet imports Nama and Pair headers including blank assignments", async () => {
  const rows = await readSheet(readFileSync(new URL("./fixtures/pairing-import.xlsx", import.meta.url)));
  const preview = previewPairingImport(rows, [
    { id: "0", name: "Browser Player 0", pairing: "1A", scores: Array(18).fill(null) },
    { id: "1", name: "Browser Player 1", pairing: "2A", scores: Array(18).fill(null) },
  ]);
  assert.equal(preview.entries.length, 2);
  assert.deepEqual(preview.entries.map((entry) => entry.pairing), ["8B", ""]);
  assert.equal(preview.replacementCount, 2);
});
