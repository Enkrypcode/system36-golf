import assert from "node:assert/strict";
import test from "node:test";
import { handicapScoreSummary } from "./scoring.ts";
import { calculateTournamentWinners } from "./winner-engine.ts";

const pars = Array(18).fill(4);
const scores = (gross: number) => { const values = Array(18).fill(4); values[0] += gross - 72; return values; };
const player = (name: string, gross: number, handicap: number, id = name) => ({ id, name, handicap, scores: scores(gross) });
const round = (id: number, players: ReturnType<typeof player>[]) => ({ id, pars, players });

test("manual Handicap summary uses the manual Handicap directly", () => {
  const summary = handicapScoreSummary(scores(82), pars, 9);
  assert.equal(summary.handicap, 9);
  assert.equal(summary.gross, 82);
  assert.equal(summary.nett, 73);
});

test("Handicap tournaments aggregate nett across completed rounds using one player Handicap", () => {
  const result = calculateTournamentWinners([
    round(1, [player("Kukuh", 82, 9, "kukuh")]),
    round(2, [player("Kukuh", 85, 9, "kukuh")]),
  ], 1, [], { scoringSystem: "handicap" });
  const kukuh = result.eligible[0];
  assert.equal(kukuh.handicap, 9);
  assert.deepEqual(kukuh.roundNett, [73, 76]);
  assert.equal(kukuh.aggregateNett, 149);
});

test("Handicap nett awards use lower Handicap before countback", () => {
  const result = calculateTournamentWinners([round(1, [
    player("Gross champion", 70, 0),
    player("Lower handicap", 82, 9),
    player("Higher handicap", 85, 12),
  ])], 1, [], { scoringSystem: "handicap" });
  const nett = result.awards.find((award) => award.code === "BNO");
  assert.equal(nett?.winner?.name, "Lower handicap");
  assert.equal(nett?.countbackStage, "HANDICAP");
  assert.deepEqual(nett?.tiedOpponents?.map((candidate) => candidate.name), ["Higher handicap"]);
});

test("equal Handicap nett uses CB9 while gross awards ignore Handicap", () => {
  const a = { ...player("A", 72, 9), scores: [5, ...Array(8).fill(4), 3, ...Array(8).fill(4)] };
  const b = { ...player("B", 72, 9), scores: [3, ...Array(8).fill(4), 5, ...Array(8).fill(4)] };
  const result = calculateTournamentWinners([round(1, [player("Gross champion", 70, 0), a, b])], 1, [], { scoringSystem: "handicap" });
  const nett = result.awards.find((award) => award.code === "BNO");
  assert.equal(nett?.winner?.name, "A");
  assert.equal(nett?.countbackStage, "CB9");
  const gross = calculateTournamentWinners([round(1, [player("Lower handicap", 72, 1), player("Higher handicap", 72, 30)])], 1, [], { scoringSystem: "handicap" });
  assert.deepEqual(gross.awards.find((award) => award.code === "BGO")?.tied?.map((candidate) => candidate.name), ["Lower handicap", "Higher handicap"]);
});

test("Handicap flight assignment uses the manual Handicap", () => {
  const result = calculateTournamentWinners([round(1, [player("A", 90, 9), player("B", 95, 18), player("C", 96, 30)])], 3, [12, 18], { scoringSystem: "handicap" });
  assert.deepEqual(result.flights.A.map((candidate) => candidate.name), ["A"]);
  assert.deepEqual(result.flights.B.map((candidate) => candidate.name), ["B"]);
  assert.deepEqual(result.flights.C.map((candidate) => candidate.name), ["C"]);
});