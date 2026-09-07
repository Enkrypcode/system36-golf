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
  assert.equal(internalBack.find((row) => row.player.name === "Eddy Fritz")?.note, "Already won 1st Nine");
  assert.equal(internalFront.find((row) => row.player.name === "Suyitno")?.note, "Won 2nd Nine");
  const exportedBack = splitNineLeaderboardRows(result.splitNine, "back", "export");
  assert.ok(exportedBack.some((row) => row.player.name === "Eddy Fritz"), "the full raw leaderboard remains in the image");
  assert.equal(exportedBack.find((row) => row.player.name === "Eddy Fritz")?.note, undefined, "the image hides internal eligibility notes");
});
