import assert from "node:assert/strict";
import test from "node:test";
import { exportFilename, winnerCsv } from "./winner-export.ts";

const winner = { key: "a", name: "Abdul Manan", flight: "A", aggregateGross: 165, aggregateNett: 141, averageHcp36: 10.5, roundGross: [82, 83], roundNett: [71, 70], finalScores: Array(18).fill(4), finalHcp36: 11 };

test("winner CSV uses the proper round metric and includes countback opponents", () => {
  const csv = winnerCsv([{ code: "BGO", label: "", winner }, { code: "BNO", label: "", winner: { ...winner, name: "Elga Sinaga", aggregateNett: 142, roundNett: [72, 70] }, countbackStage: "CB9", tiedOpponents: [{ ...winner, key: "k", name: "Kukuh" }] }], 2);
  assert.match(csv, /"BGO","Abdul Manan","A","165","141","82","83","10.5"/);
  assert.match(csv, /"BNO","Elga Sinaga","A","165","142","72","70","10.5","CB9","Kukuh"/);
  assert.equal(exportFilename("PETRO GOLF 2026", "png"), "petro-golf-2026-winners.png");
});
