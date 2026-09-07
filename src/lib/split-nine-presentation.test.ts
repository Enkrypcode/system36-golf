import assert from "node:assert/strict";
import test from "node:test";
import { splitNineLeaderboardRows } from "./split-nine-presentation.ts";
import { calculateTournamentWinners } from "./winner-engine.ts";

const pars = Array(18).fill(4);
const scores = (front: number, back: number) => {
  const values = Array(18).fill(4);
  values[8] += front - 36;
  values[17] += back - 36;
  return values;
};
const player = (name: string, handicap: number, front: number, back: number) => ({ id: name, name, handicap, scores: scores(front, back) });

test("Split 9-Hole labels Champion and two runners up while export rows omit internal notes", () => {
  const result = calculateTournamentWinners([{ id: 1, pars, players: [
    player("Eddy Fritz", 20, 44, 42),
    player("Suyitno", 16, 45, 41),
    player("Rusman", 14, 46, 42),
    player("Player Four", 12, 47, 42),
  ] }], 1, [], { scoringSystem: "handicap", tournamentFormat: "split9" });
  const internalFront = splitNineLeaderboardRows(result.splitNine, "front", "app");
  const internalBack = splitNineLeaderboardRows(result.splitNine, "back", "app");
  assert.equal(internalFront.find((row) => row.player.name === "Eddy Fritz")?.award, "Champion");
  assert.equal(internalFront.find((row) => row.player.name === "Suyitno")?.award, "Runner Up 1");
  assert.equal(internalFront.find((row) => row.player.name === "Rusman")?.award, "Runner Up 2");
  assert.equal(internalBack.find((row) => row.player.name === "Suyitno")?.award, "Champion");
  assert.equal(internalBack.find((row) => row.player.name === "Rusman")?.award, "Runner Up 1");
  assert.equal(internalBack.find((row) => row.player.name === "Player Four")?.award, "Runner Up 2");
  assert.equal(internalBack.find((row) => row.player.name === "Eddy Fritz")?.notes.includes("Already won 1st Nine"), true);
  assert.equal(internalFront.find((row) => row.player.name === "Suyitno")?.notes.includes("Won 2nd Nine"), true);
  const exportedBack = splitNineLeaderboardRows(result.splitNine, "back", "export");
  assert.ok(exportedBack.some((row) => row.player.name === "Eddy Fritz"), "the full raw leaderboard remains in the image");
  assert.deepEqual(exportedBack.find((row) => row.player.name === "Eddy Fritz")?.notes, [], "the image hides internal eligibility notes");
});

const rawPlayer = (name: string, scores: number[]) => ({ id: name, name, handicap: 0, scores });
const rawScores = (changes: Record<number, number>) => Array.from({ length: 18 }, (_, index) => changes[index + 1] ?? 4);

test("Split 9-Hole preserves tied Nett ranks while CB6, CB3, and CB1 decide award recipients", () => {
  const frontCb6 = calculateTournamentWinners([{ id: 1, pars, players: [
    rawPlayer("Front CB6", rawScores({ 1: 6 })),
    rawPlayer("Front Other", rawScores({ 4: 6 })),
    rawPlayer("Front Third", rawScores({ 1: 7 })),
  ] }], 1, [], { scoringSystem: "handicap", tournamentFormat: "split9" });
  const frontRows = splitNineLeaderboardRows(frontCb6.splitNine, "front", "app");
  assert.equal(frontRows.find((row) => row.player.name === "Front CB6")?.rank, 1);
  assert.equal(frontRows.find((row) => row.player.name === "Front Other")?.rank, 1, "raw equal Nett scores remain tied in the leaderboard");
  assert.equal(frontCb6.splitNine?.firstChampion?.name, "Front CB6");
  assert.equal(frontCb6.splitNine?.firstAwardCountbacks["Front CB6"], "CB6");

  const backCb3 = calculateTournamentWinners([{ id: 1, pars, players: [
    rawPlayer("Back CB3", rawScores({ 13: 6 })),
    rawPlayer("Back Other", rawScores({ 16: 6 })),
    rawPlayer("Back Third", rawScores({ 10: 7 })),
  ] }], 1, [], { scoringSystem: "handicap", tournamentFormat: "split9" });
  assert.equal(backCb3.splitNine?.secondChampion?.name, "Back CB3");
  assert.equal(backCb3.splitNine?.secondAwardCountbacks["Back CB3"], "CB3");

  const backCb1 = calculateTournamentWinners([{ id: 1, pars, players: [
    rawPlayer("Back CB1", rawScores({ 16: 6 })),
    rawPlayer("Back Other", rawScores({ 18: 6 })),
    rawPlayer("Back Third", rawScores({ 10: 7 })),
  ] }], 1, [], { scoringSystem: "handicap", tournamentFormat: "split9" });
  assert.equal(backCb1.splitNine?.secondChampion?.name, "Back CB1");
  assert.equal(backCb1.splitNine?.secondAwardCountbacks["Back CB1"], "CB1");
});
