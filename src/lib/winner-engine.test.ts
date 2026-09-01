import assert from "node:assert/strict";
import test from "node:test";
import { calculateTournamentWinners, countbackValues, type TournamentPlayer } from "./winner-engine.ts";

const pars = Array(18).fill(4);
const player = (name: string, scores = Array(18).fill(4)) => ({ id: name, name, handicap: 0, scores });
const round = (id: number, players: ReturnType<typeof player>[]) => ({ id, pars, players });
const scoresWith = (changes: Record<number, number>) => pars.map((par, index) => changes[index + 1] ?? par);
const scoresForHcp = (bogeys: number, triples = 0) => pars.map((par, index) => index < bogeys ? par + 1 : index < bogeys + triples ? par + 3 : par);

test("eligibility, aggregates, average HCP 36, and one-round awards are calculated", () => {
  const result = calculateTournamentWinners([round(1, [player("A", scoresWith({ 1: 3 })), player("B", scoresWith({ 1: 5 }))])], 1);
  assert.equal(result.eligible.length, 2);
  assert.equal(result.eligible[0].aggregateGross, 71);
  assert.equal(result.eligible[0].aggregateNett, 71);
  assert.equal(result.eligible[0].averageHcp36, -1);
  assert.equal(result.awards.find((award) => award.code === "BGO")?.winner?.name, "A");
  assert.equal(result.awards.find((award) => award.code === "BNO")?.winner?.name, "B", "BGO is excluded from BNO");
});

test("two-round totals exclude players missing a round and allocate odd fields evenly", () => {
  const result = calculateTournamentWinners([
    round(1, [player("A"), player("B", scoresWith({ 1: 5 })), player("C"), player("Missing")]),
    round(2, [player("A"), player("B", scoresWith({ 2: 5 })), player("C", scoresWith({ 3: 5 }))]),
  ], 2, [0]);
  assert.equal(result.eligible.length, 3);
  assert.equal(result.notEligible, 1);
  assert.equal(result.eligible.find((item) => item.name === "B")?.aggregateGross, 146);
  assert.equal(result.eligible.find((item) => item.name === "B")?.aggregateNett, 144);
  assert.equal(result.eligible.find((item) => item.name === "B")?.averageHcp36, 1);
  assert.equal(result.flights.A.length, 1, "players on the HCP boundary stay in Flight A");
  assert.equal(result.flights.B.length, 2);
  const winners = result.awards.flatMap((award) => award.winner ? [award.winner.key] : []);
  assert.equal(new Set(winners).size, winners.length, "no player wins twice");
});

test("the same 50 complete players in both rounds are all eligible", () => {
  const fifty = Array.from({ length: 50 }, (_, index) => player(`P${index + 1}`));
  const result = calculateTournamentWinners([round(1, fifty), round(2, fifty.map((item) => ({ ...item, scores: [...item.scores] })))], 2, [0]);
  assert.equal(result.eligible.length, 50);
  assert.equal(result.notEligible, 0);
  assert.equal(result.flights.A.length, 50, "all Par players have HCP 0 and fit a Flight A boundary of 0");
  assert.equal(result.flights.B?.length ?? 0, 0);
});

test("three-flight handicap boundaries support decimals and reject invalid limits", () => {
  const result = calculateTournamentWinners([round(1, [player("A"), player("B", scoresWith({ 1: 5 })), player("C", scoresWith({ 1: 6 }))])], 3, [0.5, 1]);
  assert.equal(result.flights.A[0].name, "A");
  assert.equal(result.flights.B[0].name, "B");
  assert.equal(result.flights.C[0].name, "C");
  assert.ok(result.eligible.find((item) => item.name === "B")?.averageHcp36 === 1);
  assert.equal(calculateTournamentWinners([round(1, [player("A")])], 3, [12, 12]).validationError, "Flight handicap limits must increase.");
});

test("gross and nett countbacks use final-round rules and unresolved ties remain manual", () => {
  const grossResult = calculateTournamentWinners([round(1, [player("Back9 Better", scoresWith({ 1: 5, 10: 3 })), player("Back9 Worse")])], 1);
  assert.equal(grossResult.awards.find((award) => award.code === "BGO")?.winner?.name, "Back9 Better");
  assert.equal(grossResult.awards.find((award) => award.code === "BGO")?.countbackStage, "CB9");
  const candidate: TournamentPlayer = { key: "x", name: "X", aggregateGross: 72, aggregateNett: 72, averageHcp36: 2, roundGross: [72], roundNett: [72], finalScores: Array(18).fill(4), finalHcp36: 2 };
  assert.deepEqual(countbackValues(candidate, false), [36, 24, 12, 4]);
  assert.deepEqual(countbackValues(candidate, true), [35, 23.333333333333332, 11.666666666666666, 3.888888888888889]);
  const tieResult = calculateTournamentWinners([round(1, [player("Tie A"), player("Tie B")])], 1);
  assert.deepEqual(tieResult.awards.find((award) => award.code === "BGO")?.tied?.map((item) => item.name), ["Tie A", "Tie B"]);
});

test("flight membership is complete, exclusive, and follows the configured boundary", () => {
  const fifty = Array.from({ length: 50 }, (_, index) => player(`P${index + 1}`, scoresForHcp(Math.min(index, 18), Math.max(0, index - 18))));
  const result = calculateTournamentWinners([round(1, fifty), round(2, fifty.map((item) => ({ ...item, scores: [...item.scores] })))], 2, [12]);
  const members = Object.values(result.flights).flat();
  assert.equal(result.eligible.length, 50);
  assert.equal(result.flights.A.length + result.flights.B.length, result.eligible.length);
  assert.equal(new Set(members.map((member) => member.key)).size, 50, "each eligible player belongs to one flight only");
  assert.ok(result.flights.A.every((member) => member.averageHcp36 <= 12));
  assert.ok(result.flights.B.every((member) => member.averageHcp36 > 12));
});

test("changing a flight boundary recalculates the same member arrays used for awards", () => {
  const field = Array.from({ length: 18 }, (_, index) => player(`P${index}`, scoresForHcp(index)));
  const atTwelve = calculateTournamentWinners([round(1, field)], 2, [12]);
  const atFifteen = calculateTournamentWinners([round(1, field)], 2, [15]);
  assert.equal(atTwelve.flights.A.length, 13);
  assert.equal(atTwelve.flights.B.length, 5);
  assert.equal(atFifteen.flights.A.length, 16);
  assert.equal(atFifteen.flights.B.length, 2);
  assert.ok(atFifteen.flights.B.every((member) => member.averageHcp36 > 15));
  const bgb = atFifteen.awards.find((award) => award.code === "BGB")?.winner;
  assert.ok(bgb && atFifteen.flights.B.some((member) => member.key === bgb.key));
});

test("Flight B awards use Flight B members after only individual earlier winners are excluded", () => {
  const field = [
    player("A low", scoresForHcp(1)),
    player("A mid", scoresForHcp(4)),
    player("B gross", scoresForHcp(11, 1)), // HCP 13, Nett 73
    player("B nett 1", scoresForHcp(12, 1)), // HCP 14, Nett 73
    player("B nett 2", scoresForHcp(11, 2)), // HCP 15, Nett 74
    player("B other", scoresForHcp(14, 1)), // HCP 16, Nett 73
  ];
  const result = calculateTournamentWinners([round(1, field), round(2, field.map((item) => ({ ...item, scores: [...item.scores] })))], 2, [12]);
  const flightBKeys = new Set(result.flights.B.map((member) => member.key));
  assert.equal(result.flights.B.length, 4);
  for (const code of ["BGB", "BN 1 B", "BN 2 B"]) {
    const winner = result.awards.find((award) => award.code === code)?.winner;
    assert.ok(winner, `${code} is selected from a populated Flight B`);
    assert.ok(flightBKeys.has(winner.key), `${code} winner belongs to Flight B`);
  }
  const winnerKeys = result.awards.flatMap((award) => award.winner ? [award.winner.key] : []);
  assert.equal(new Set(winnerKeys).size, winnerKeys.length, "overall winners remove only themselves from later pools");
});

test("countback notes expose the opponent list only when a countback resolves a tie", () => {
  const result = calculateTournamentWinners([round(1, [
    player("Winner", scoresWith({ 1: 5, 10: 3 })),
    player("Opponent", scoresWith({ 1: 3, 10: 5 })),
  ])], 1);
  const award = result.awards.find((item) => item.code === "BGO");
  assert.equal(award?.countbackStage, "CB9");
  assert.deepEqual(award?.tiedOpponents?.map((item) => item.name), ["Opponent"]);
  const noTie = calculateTournamentWinners([round(1, [player("Clear winner", scoresWith({ 1: 3 })), player("Other")])], 1);
  assert.equal(noTie.awards.find((item) => item.code === "BGO")?.countbackStage, undefined);
});
