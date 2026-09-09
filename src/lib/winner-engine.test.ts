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

const system36TiePlayer = (name: string, bogeyHoles: number[]) => player(name, scoresWith(Object.fromEntries(bogeyHoles.map((hole) => [hole, 5]))));
const system36NettAward = (players: ReturnType<typeof player>[], method: "lower-handicap" | "countback") => calculateTournamentWinners([round(1, [player("Gross champion"), ...players])], 1, [], { scoringSystem: "system36", nettTieBreakMethod: method }).awards.find((award) => award.code === "BNO");

test("System 36 Nett ties use the selected Tournament HCP36 or Countback method", () => {
  const lowerHcp = system36TiePlayer("Lower HCP36", [10]);
  const higherHcp = system36TiePlayer("Higher HCP36", [1, 2]);
  const lowerHcpResult = system36NettAward([lowerHcp, higherHcp], "lower-handicap");
  assert.equal(lowerHcpResult?.winner?.name, "Lower HCP36");
  assert.equal(lowerHcpResult?.countbackStage, "HCP");

  const sameHcpBackNineWorse = system36TiePlayer("Back nine worse", [10]);
  const sameHcpBackNineBetter = system36TiePlayer("Back nine better", [1]);
  const cb9Result = system36NettAward([sameHcpBackNineWorse, sameHcpBackNineBetter], "lower-handicap");
  assert.equal(cb9Result?.winner?.name, "Back nine better");
  assert.equal(cb9Result?.countbackStage, "CB9");

  const countbackResult = system36NettAward([lowerHcp, higherHcp], "countback");
  assert.equal(countbackResult?.winner?.name, "Higher HCP36");
  assert.equal(countbackResult?.countbackStage, "CB9");
});

test("System 36 Nett countback progresses through CB6, CB3, CB1, then Manual Decision", () => {
  const cb6 = system36NettAward([system36TiePlayer("CB6 better", [1, 10]), system36TiePlayer("CB6 worse", [1, 13])], "lower-handicap");
  assert.equal(cb6?.winner?.name, "CB6 better");
  assert.equal(cb6?.countbackStage, "CB6");

  const cb3 = system36NettAward([system36TiePlayer("CB3 better", [1, 15]), system36TiePlayer("CB3 worse", [1, 16])], "lower-handicap");
  assert.equal(cb3?.winner?.name, "CB3 better");
  assert.equal(cb3?.countbackStage, "CB3");

  const cb1 = system36NettAward([system36TiePlayer("CB1 better", [1, 17]), system36TiePlayer("CB1 worse", [1, 18])], "lower-handicap");
  assert.equal(cb1?.winner?.name, "CB1 better");
  assert.equal(cb1?.countbackStage, "CB1");

  const unresolved = system36NettAward([system36TiePlayer("Tie A", [1]), system36TiePlayer("Tie B", [1])], "countback");
  assert.equal(unresolved?.winner, undefined);
  assert.deepEqual(unresolved?.tied?.map((player) => player.name), ["Tie A", "Tie B"]);
});
const splitNineScores = (front: number, back: number) => {
  const values = Array(18).fill(4);
  values[8] += front - 36;
  values[17] += back - 36;
  return values;
};

const handicapPlayer = (id: string, handicap: number, front: number, back: number) => ({ id, name: id, handicap, scores: splitNineScores(front, back) });
const rawScores = (changes: Record<number, number>) => Array.from({ length: 18 }, (_, index) => changes[index + 1] ?? 4);
const rawPlayer = (name: string, scores: number[], handicap = 0) => ({ id: name, name, handicap, scores });

test("Split 9-Hole assigns BGO, BNO, then both nines while only the 1st Nine Champion is excluded from the 2nd Nine", () => {
  const result = calculateTournamentWinners([round(1, [
    handicapPlayer("BGO", 10, 35, 35),
    handicapPlayer("BNO", 30, 40, 37),
    handicapPlayer("First Champion", 20, 40, 50),
    handicapPlayer("First Runner 1", 20, 41, 37),
    handicapPlayer("First Runner 2", 20, 42, 50),
    handicapPlayer("Second Champion", 20, 60, 40),
    handicapPlayer("Second Runner 1", 20, 60, 41),
    handicapPlayer("Second Runner 2", 20, 60, 42),
  ])], 1, [], { scoringSystem: "handicap", tournamentFormat: "split9" });
  const split = result.splitNine!;
  assert.equal(result.awards.length, 0, "Split 9-Hole must not create normal Handicap awards");
  assert.equal(split.overallAwards.find((award) => award.code === "BGO")?.winner?.name, "BGO");
  assert.equal(split.overallAwards.find((award) => award.code === "BNO")?.winner?.name, "BNO", "BGO is excluded from BNO");
  assert.equal(split.firstAwards["First Champion"], "Champion");
  assert.equal(split.firstAwards["First Runner 1"], "Runner Up 1");
  assert.equal(split.firstAwards["First Runner 2"], "Runner Up 2");
  assert.equal(split.secondAwards["First Runner 1"], "Champion", "1st Nine Runner Up 1 remains eligible for the 2nd Nine");
  assert.equal(split.secondAwards["Second Champion"], "Runner Up 1");
  assert.equal(split.secondAwards["Second Runner 1"], "Runner Up 2");
  assert.equal(split.firstAwards.BGO, undefined, "Overall winners are excluded from the 1st Nine");
  assert.equal(split.firstAwards.BNO, undefined, "Overall winners are excluded from the 1st Nine");
  assert.equal(split.secondAwards["First Champion"], undefined, "Only the 1st Nine Champion is excluded from the 2nd Nine");
  assert.equal(split.secondAwards.BGO, undefined, "BGO remains excluded from the 2nd Nine");
  assert.equal(split.secondAwards.BNO, undefined, "BNO remains excluded from the 2nd Nine");
});

test("Split 9-Hole keeps tied Nett ranks while countback decides the eligible award order", () => {
  const result = calculateTournamentWinners([round(1, [
    rawPlayer("BGO", rawScores({})),
    rawPlayer("BNO", rawScores({ 1: 5, 10: 5 }), 20),
    rawPlayer("Front CB6", rawScores({ 1: 6 })),
    rawPlayer("Front Other", rawScores({ 4: 6 })),
    rawPlayer("Front Runner 2", rawScores({ 1: 7 })),
    rawPlayer("Back Champion", rawScores({ 1: 10, 10: 7 })),
    rawPlayer("Back Runner 1", rawScores({ 1: 10, 10: 8 })),
    rawPlayer("Back Runner 2", rawScores({ 1: 10, 10: 9 })),
  ])], 1, [], { scoringSystem: "handicap", tournamentFormat: "split9" });
  const split = result.splitNine!;
  const firstTieA = split.leaderboard.find((player) => player.name === "Front CB6")!;
  const firstTieB = split.leaderboard.find((player) => player.name === "Front Other")!;
  assert.equal(firstTieA.frontRank, firstTieB.frontRank, "raw equal Nett scores remain visibly tied");
  assert.equal(split.firstAwards["Front CB6"], "Champion");
  assert.equal(split.firstAwardCountbacks["Front CB6"], "CB6");
  assert.equal(split.firstAwards["Front Other"], "Runner Up 1", "the next tied player cascades to Runner Up 1");
  assert.equal(split.secondAwards["Front CB6"], undefined, "the 1st Nine Champion cannot receive a 2nd Nine award");
});
test("Handicap Nett Only assigns three Nett positions and removes Gross awards", () => {
  const field = [
    handicapPlayer("Nett 1", 20, 40, 40),
    handicapPlayer("Nett 2", 18, 40, 40),
    handicapPlayer("Nett 3", 16, 40, 40),
    handicapPlayer("Flight Nett 1", 14, 40, 40),
    handicapPlayer("Flight Nett 2", 12, 40, 40),
    handicapPlayer("Flight Nett 3", 10, 40, 40),
  ];
  const nettOnly = calculateTournamentWinners([round(1, field)], 1, [], { scoringSystem: "handicap", tournamentFormat: "standard", awardMode: "nett-only" });
  assert.deepEqual(nettOnly.awards.map((award) => award.code), ["BN 1", "BN 2", "BN 3", "BN 1 A", "BN 2 A", "BN 3 A"]);
  assert.deepEqual(nettOnly.awards.map((award) => award.winner?.name), ["Nett 1", "Nett 2", "Nett 3", "Flight Nett 1", "Flight Nett 2", "Flight Nett 3"]);
  assert.equal(nettOnly.awards.some((award) => award.code.startsWith("BG")), false);
});

test("Handicap Gross + Nett mode remains the default award structure", () => {
  const field = [
    handicapPlayer("Gross winner", 0, 35, 35),
    handicapPlayer("Nett winner", 20, 40, 40),
    handicapPlayer("Flight candidate", 10, 45, 45),
    handicapPlayer("Flight candidate 2", 8, 46, 46),
  ];
  const implicit = calculateTournamentWinners([round(1, field)], 1, [], { scoringSystem: "handicap", tournamentFormat: "standard" });
  const explicit = calculateTournamentWinners([round(1, field)], 1, [], { scoringSystem: "handicap", tournamentFormat: "standard", awardMode: "gross-nett" });
  assert.deepEqual(implicit.awards.map((award) => award.code), ["BGO", "BNO", "BGA", "BN 1 A", "BN 2 A"]);
  assert.deepEqual(explicit.awards.map((award) => award.code), implicit.awards.map((award) => award.code));
});

test("Handicap Nett Only uses the selected Nett tie-break method", () => {
  const lowerHandicap = rawPlayer("Lower Handicap", rawScores({ 1: 2, 2: 3, 10: 5 }), 6);
  const higherHandicap = rawPlayer("Higher Handicap", rawScores({ 1: 7, 10: 3 }), 10);
  const lowerHandicapResult = calculateTournamentWinners([round(1, [lowerHandicap, higherHandicap])], 1, [], { scoringSystem: "handicap", awardMode: "nett-only", nettTieBreakMethod: "lower-handicap" });
  assert.equal(lowerHandicapResult.awards.find((award) => award.code === "BN 1")?.winner?.name, "Lower Handicap");
  assert.equal(lowerHandicapResult.awards.find((award) => award.code === "BN 1")?.countbackStage, "HANDICAP");

  const countbackResult = calculateTournamentWinners([round(1, [lowerHandicap, higherHandicap])], 1, [], { scoringSystem: "handicap", awardMode: "nett-only", nettTieBreakMethod: "countback" });
  assert.equal(countbackResult.awards.find((award) => award.code === "BN 1")?.winner?.name, "Higher Handicap");
  assert.equal(countbackResult.awards.find((award) => award.code === "BN 1")?.countbackStage, "CB9");
});
