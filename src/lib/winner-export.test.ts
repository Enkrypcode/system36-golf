import assert from "node:assert/strict";
import test from "node:test";
import { exportFilename, tournamentResultsCsv, winnerCsv } from "./winner-export.ts";

const winner = { key: "a", name: "Abdul Manan", flight: "A", aggregateGross: 165, aggregateNett: 141, averageHcp36: 10.5, roundGross: [82, 83], roundNett: [71, 70], finalScores: Array(18).fill(4), finalHcp36: 11 };

test("winner CSV uses the proper round metric and includes countback opponents", () => {
  const csv = winnerCsv([{ code: "BGO", label: "", winner }, { code: "BNO", label: "", winner: { ...winner, name: "Elga Sinaga", aggregateNett: 142, roundNett: [72, 70] }, countbackStage: "CB9", tiedOpponents: [{ ...winner, key: "k", name: "Kukuh" }] }], 2);
  assert.match(csv, /"BGO","Abdul Manan","A","165","141","82","83","10.5"/);
  assert.match(csv, /"BNO","Elga Sinaga","A","165","142","72","70","10.5","CB9","Kukuh"/);
  assert.equal(exportFilename("PETRO GOLF 2026", "png"), "petro-golf-2026-winners.png");
});

test("Handicap winner CSV exports the single manual Handicap", () => {
  const csv = winnerCsv([{ code: "BNO", label: "", winner: { ...winner, handicap: 9 } }], 2, "handicap");
  assert.match(csv, /"Handicap"/);
  assert.match(csv, /"BNO","Abdul Manan","A","165","141","71","70","9"/);
});
test("Nett Only winner CSV includes only the assigned Nett award positions", () => {
  const csv = winnerCsv([{ code: "BN 1", label: "Best Nett 1", winner: { ...winner, handicap: 9 } }, { code: "BN 2", label: "Best Nett 2", winner: { ...winner, key: "b", name: "Fikri", handicap: 10 } }], 1, "handicap");
  assert.match(csv, /"BN 1"/);
  assert.match(csv, /"BN 2"/);
  assert.doesNotMatch(csv, /"BG[OABC]"/);
});

test("results CSV includes Split 9-Hole calculated award positions", () => {
  const results = tournamentResultsCsv({
    eligible: [], notEligible: 0, flights: {}, awards: [], splitNine: {
      leaderboard: [{ key: "a", name: "FIKRI", frontGross: 36, backGross: 37, halfHandicap: 4.5, frontNett: 31.5, backNett: 32.5, frontRank: 1, backRank: 1 }],
      overallAwards: [], firstAwards: { a: "Champion" }, secondAwards: { a: "Runner Up 1" }, firstAwardCountbacks: {}, secondAwardCountbacks: { a: "CB3" },
    },
  }, 1, "handicap");
  assert.match(results, /"Champion","FIKRI","1st Nine","36","31.5","4.5","1",""/);
  assert.match(results, /"Runner Up 1","FIKRI","2nd Nine","37","32.5","4.5","1","CB3"/);
});