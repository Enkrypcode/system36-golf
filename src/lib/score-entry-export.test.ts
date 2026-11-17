import assert from "node:assert/strict";
import test from "node:test";
import { scoreEntryFullCsv, scoreEntryFullFilename } from "./score-entry-export.ts";
import { parseCsv } from "./score-import.ts";
import type { Player } from "./scoring.ts";

import { scoreEntryGrossCsv, scoreEntryGrossFilename, scoreEntryResultsCsv, scoreEntryResultsFilename, scoreEntryScoresCsv, scoreEntryScoresFilename } from "./score-entry-export.ts";

const pars = Array<number>(18).fill(4);

test("Full Export retains every roster player and exactly the editable input columns", () => {
  const roster: Player[] = [
    { id: "z", name: 'ZAIDY, "PSGC"', handicap: 9.5, awardCategory: "D", jackpotTargetFront: 40.5, jackpotTargetBack: 42, pairing: "7A", scores: Array.from({ length: 18 }, (_, hole) => hole % 8 + 1) },
    { id: "a", name: "INCOMPLETE", handicap: 0, awardCategory: "SS", jackpotTargetFront: 0, jackpotTargetBack: 45, pairing: "2B", scores: [5, ...Array(17).fill(null)] },
    { id: "blank", name: "NO SCORES", scores: Array(18).fill(null) },
  ];
  const csv = scoreEntryFullCsv(roster);
  assert.ok(csv.startsWith("\uFEFF"));
  const [header, first, incomplete, blank] = parseCsv(csv);
  assert.deepEqual(header.map((cell) => cell.replace(/^\uFEFF/, "")), [
    "No", "Player Name", "Handicap", "Flight", "Target 1–9", "Target 10–18", "Pairing",
    ...Array.from({ length: 18 }, (_, hole) => `H${hole + 1}`),
  ]);
  assert.equal(header.length, 25);
  assert.deepEqual(first, ["1", roster[0].name, "9.5", "D", "40.5", "42", "7A", ...roster[0].scores.map(String)]);
  assert.deepEqual(incomplete, ["2", "INCOMPLETE", "0", "SS", "0", "45", "2B", "5", ...Array(17).fill("")]);
  assert.deepEqual(blank, ["3", "NO SCORES", ...Array(23).fill("")]);
  assert.equal(parseCsv(csv).length, roster.length + 1);
  assert.equal(scoreEntryFullFilename("GOBAR PSGC 17 November 2026", 1), "GOBAR-PSGC-17-November-2026-Round-1-Full.csv");
});

const completePlayer = (name: string, gross: number) => ({
  id: name,
  name,
  scores: [...Array<number>(17).fill(4), gross - 68],
});

test("Score Entry Gross CSV exports only complete players with Name and Gross", () => {
  const csv = scoreEntryGrossCsv(
    [
      completePlayer("ADRIANSYAH", 99),
      { id: "incomplete", name: "INCOMPLETE", scores: [...Array<number>(17).fill(4), null] },
      completePlayer('M. NUR, "PSGC"', 87),
    ],
    pars,
  );
  assert.match(csv, /^\uFEFFName,Gross\r\n/);
  assert.match(csv, /ADRIANSYAH,99/);
  assert.match(csv, /"M\. NUR, ""PSGC""",87/);
  assert.equal(csv.includes("INCOMPLETE"), false);
  assert.equal(csv.includes("Handicap"), false);
  assert.equal(scoreEntryGrossFilename("Gobar PSGC Rancamaya", 1), "Gobar-PSGC-Rancamaya-Round-1-Gross.csv");
});

test("Scores CSV exports every selected-round player as Name plus raw H1-H18 only", () => {
  const csv = scoreEntryScoresCsv([
    { id: "nova", name: "NOVA", pairing: "2", handicap: 9, scores: Array<number>(18).fill(4) },
    { id: "blank", name: "INCOMPLETE", pairing: "1", scores: [...Array<number>(17).fill(4), null] },
  ]);
  const [header, nova, incomplete] = csv.split("\r\n");
  assert.deepEqual(header.replace(/^\uFEFF/, "").split(","), ["Name", ...Array.from({ length: 18 }, (_, index) => `H${index + 1}`)]);
  assert.deepEqual(nova.split(","), ["NOVA", ...Array(18).fill("4")]);
  assert.equal(incomplete.split(",").at(-1), "");
  assert.equal(csv.includes("Pairing"), false);
  assert.equal(csv.includes("Gross"), false);
  assert.equal(scoreEntryScoresFilename("test", 1), "test-Round-1-Scores.csv");
});

test("System 36 results CSV exports the full roster with current engine summaries", () => {
  const csv = scoreEntryResultsCsv(
    [
      { id: "nova", name: "NOVA", pairing: "2", scores: Array<number>(18).fill(4) },
      { id: "blank", name: "INCOMPLETE", pairing: "1", scores: [...Array<number>(17).fill(4), null] },
    ],
    pars,
    { scoringSystem: "system36", tournamentFormat: "standard" },
  );
  const [header, nova, incomplete] = csv.split("\r\n");
  const columns = header.replace(/^\uFEFF/, "").split(",");
  const novaCells = nova.split(",");
  const incompleteCells = incomplete.split(",");
  assert.deepEqual(columns, ["No", "Name", "Pairing", ...Array.from({ length: 18 }, (_, index) => `H${index + 1}`), "Front", "Back", "Gross", "HCP36", "Nett", "Point"]);
  assert.equal(novaCells[0], "1");
  assert.equal(novaCells[1], "NOVA");
  assert.deepEqual(novaCells.slice(21), ["36", "36", "72", "0", "72", "36"]);
  assert.deepEqual(incompleteCells.slice(-6), Array(6).fill(""));
  assert.equal(scoreEntryResultsFilename("test", 1), "test-Round-1-Results.csv");
});

test("Handicap results CSV includes handicap, omits non-applicable Flight, and preserves decimal results", () => {
  const csv = scoreEntryResultsCsv(
    [{ id: "eddy", name: "EDDY", handicap: 9.5, pairing: "3", awardCategory: "A", scores: [...Array<number>(17).fill(4), 5] }],
    pars,
    { scoringSystem: "handicap", tournamentFormat: "standard" },
  );
  const [header, eddy] = csv.split("\r\n");
  const columns = header.replace(/^\uFEFF/, "").split(",");
  const cells = eddy.split(",");
  assert.deepEqual(columns, ["No", "Name", "Handicap", "Pairing", ...Array.from({ length: 18 }, (_, index) => `H${index + 1}`), "Front", "Back", "Gross", "Nett"]);
  assert.equal(columns.includes("Flight"), false);
  assert.deepEqual(cells.slice(-4), ["36", "37", "73", "63.5"]);
  const psgcHeader = scoreEntryResultsCsv(
    [{ id: "eddy", name: "EDDY", handicap: 9.5, pairing: "3", awardCategory: "A", scores: Array<number>(18).fill(4) }],
    pars,
    { scoringSystem: "handicap", tournamentFormat: "psgc" },
  ).split("\r\n")[0].replace(/^\uFEFF/, "").split(",");
  assert.deepEqual(psgcHeader.slice(0, 5), ["No", "Name", "Handicap", "Flight", "Pairing"]);
});
