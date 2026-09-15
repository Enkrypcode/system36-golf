import assert from "node:assert/strict";
import test from "node:test";

import { scoreEntryGrossCsv, scoreEntryGrossFilename, scoreEntryScoresCsv, scoreEntryScoresFilename } from "./score-entry-export.ts";

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

test("System 36 score CSV exports the current roster with raw scores and engine summaries", () => {
  const csv = scoreEntryScoresCsv(
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
  assert.equal(novaCells[2], "2");
  assert.deepEqual(novaCells.slice(3, 21), Array(18).fill("4"));
  assert.deepEqual(novaCells.slice(21), ["36", "36", "72", "0", "72", "36"]);
  assert.equal(incompleteCells[1], "INCOMPLETE");
  assert.equal(incompleteCells[20], "");
  assert.deepEqual(incompleteCells.slice(-6), Array(6).fill(""));
  assert.equal(scoreEntryScoresFilename("GOBAR CHIP IN GOLF CLUB - VOL 4", 1), "GOBAR-CHIP-IN-GOLF-CLUB-VOL-4-Round-1-Scores.csv");
});

test("Handicap score CSV includes handicap, omits non-applicable Flight, and preserves decimal results", () => {
  const csv = scoreEntryScoresCsv(
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

  const psgcHeader = scoreEntryScoresCsv(
    [{ id: "eddy", name: "EDDY", handicap: 9.5, pairing: "3", awardCategory: "A", scores: Array<number>(18).fill(4) }],
    pars,
    { scoringSystem: "handicap", tournamentFormat: "psgc" },
  ).split("\r\n")[0].replace(/^\uFEFF/, "").split(",");
  assert.deepEqual(psgcHeader.slice(0, 5), ["No", "Name", "Handicap", "Flight", "Pairing"]);
});