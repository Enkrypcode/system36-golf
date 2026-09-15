import assert from "node:assert/strict";
import test from "node:test";

import { scoreEntryGrossCsv, scoreEntryGrossFilename, scoreEntryResultsCsv, scoreEntryResultsFilename, scoreEntryScoresCsv, scoreEntryScoresFilename } from "./score-entry-export.ts";

const pars = Array<number>(18).fill(4);

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