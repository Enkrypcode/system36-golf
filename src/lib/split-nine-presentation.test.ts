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

test("Split 9-Hole keeps 1st Nine runners-up eligible for 2nd Nine awards while app notes identify only the excluded champion", () => {
  const result = calculateTournamentWinners([{ id: 1, pars, players: [
    player("BGO", 10, 35, 35), player("BNO", 30, 40, 37),
    player("First Champion", 20, 40, 50), player("First Runner 1", 20, 41, 37), player("First Runner 2", 20, 42, 50),
    player("Second Champion", 20, 60, 40), player("Second Runner 1", 20, 60, 41), player("Second Runner 2", 20, 60, 42),
  ] }], 1, [], { scoringSystem: "handicap", tournamentFormat: "split9" });
  const internalFront = splitNineLeaderboardRows(result.splitNine, "front", "app");
  const internalBack = splitNineLeaderboardRows(result.splitNine, "back", "app");
  assert.equal(internalFront.find((row) => row.player.name === "First Champion")?.award, "Champion");
  assert.equal(internalFront.find((row) => row.player.name === "First Runner 1")?.award, "Runner Up 1");
  assert.equal(internalFront.find((row) => row.player.name === "First Runner 2")?.award, "Runner Up 2");
  assert.equal(internalBack.find((row) => row.player.name === "First Runner 1")?.award, "Champion");
  assert.equal(internalBack.find((row) => row.player.name === "Second Champion")?.award, "Runner Up 1");
  assert.equal(internalBack.find((row) => row.player.name === "Second Runner 1")?.award, "Runner Up 2");
  assert.equal(internalFront.find((row) => row.player.name === "BGO")?.notes.includes("Already won BGO"), true);
  assert.equal(internalBack.find((row) => row.player.name === "First Champion")?.notes.includes("Already won 1st Nine"), true);
  assert.equal(internalBack.find((row) => row.player.name === "First Runner 1")?.notes.includes("Already won 1st Nine"), false, "1st Nine Runner Up 1 stays eligible without an exclusion note");
  assert.equal(internalBack.find((row) => row.player.name === "First Runner 2")?.notes.includes("Already won 1st Nine"), false, "1st Nine Runner Up 2 stays eligible without an exclusion note");
  const exportedBack = splitNineLeaderboardRows(result.splitNine, "back", "export");
  assert.deepEqual(exportedBack.find((row) => row.player.name === "First Champion")?.notes, [], "the image hides internal eligibility notes");
});
const rawPlayer = (name: string, scores: number[], handicap = 0) => ({ id: name, name, handicap, scores });
const rawScores = (changes: Record<number, number>) => Array.from({ length: 18 }, (_, index) => changes[index + 1] ?? 4);

test("Split 9-Hole preserves raw tied ranks while countback decides an eligible award recipient", () => {
  const result = calculateTournamentWinners([{ id: 1, pars, players: [
    rawPlayer("BGO", rawScores({})), rawPlayer("BNO", rawScores({ 1: 5, 10: 5 }), 20),
    rawPlayer("Front CB6", rawScores({ 1: 6 })), rawPlayer("Front Other", rawScores({ 4: 6 })), rawPlayer("Front Runner 2", rawScores({ 1: 7 })),
    rawPlayer("Back Champion", rawScores({ 1: 10, 10: 7 })), rawPlayer("Back Runner 1", rawScores({ 1: 10, 10: 8 })), rawPlayer("Back Runner 2", rawScores({ 1: 10, 10: 9 })),
  ] }], 1, [], { scoringSystem: "handicap", tournamentFormat: "split9" });
  const appRows = splitNineLeaderboardRows(result.splitNine, "front", "app");
  assert.equal(appRows.find((row) => row.player.name === "Front CB6")?.rank, appRows.find((row) => row.player.name === "Front Other")?.rank, "raw equal Nett scores remain tied in the leaderboard");
  assert.equal(appRows.find((row) => row.player.name === "Front CB6")?.award, "Champion");
  assert.equal(appRows.find((row) => row.player.name === "Front CB6")?.notes.includes("Won on CB6"), true);
  const imageRows = splitNineLeaderboardRows(result.splitNine, "front", "export");
  assert.deepEqual(imageRows.find((row) => row.player.name === "Front CB6")?.notes, [], "the image omits countback notes");
});
