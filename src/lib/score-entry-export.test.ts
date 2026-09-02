import assert from "node:assert/strict";
import test from "node:test";

import { scoreEntryGrossCsv, scoreEntryGrossFilename } from "./score-entry-export.ts";

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