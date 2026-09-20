import assert from "node:assert/strict";
import test from "node:test";
import { pointForScore, scoreSummary } from "./scoring.ts";

const pars = Array(18).fill(4);
const roundWith = (firstHoleScore: number) => [firstHoleScore, ...Array(17).fill(4)];

test("System 36 assigns two points for Par or better and has no Nett adjustment", () => {
  const scenarios = [
    [4, 72, 36, 0, 72, "All Par"],
    [3, 71, 36, 0, 71, "One Birdie"],
    [2, 70, 36, 0, 70, "One Eagle"],
    [1, 69, 36, 0, 69, "One Albatross"],
    [5, 73, 35, 1, 72, "One Bogey"],
    [6, 74, 34, 2, 72, "One Double Bogey"],
    [7, 75, 34, 2, 73, "One Triple Bogey"],
    [8, 76, 34, 2, 74, "One Quadruple Bogey"],
  ] as const;

  for (const [score, gross, points, hcp36, nett, label] of scenarios) {
    const summary = scoreSummary(roundWith(score), pars);
    assert.equal(summary.gross, gross, `${label}: Gross`);
    assert.equal(summary.points, points, `${label}: Points`);
    assert.equal(summary.system36Handicap, hcp36, `${label}: HCP 36`);
    assert.equal(summary.nett, nett, `${label}: Nett = Gross - HCP 36`);
    assert.equal("nettAdjustment" in summary, false, `${label}: no residual Nett adjustment is exposed`);
  }
});

test("System 36 point mapping uses the corrected values", () => {
  assert.equal(pointForScore(1, 4), 2, "Albatross");
  assert.equal(pointForScore(2, 4), 2, "Eagle");
  assert.equal(pointForScore(3, 4), 2, "Birdie");
  assert.equal(pointForScore(4, 4), 2, "Par");
  assert.equal(pointForScore(5, 4), 1, "Bogey");
  assert.equal(pointForScore(6, 4), 0, "Double Bogey");
  assert.equal(pointForScore(7, 4), 0, "Triple Bogey");
  assert.equal(pointForScore(8, 4), 0, "Quadruple Bogey");
});

test("the Gross 79 System 36 fixture produces Point 28, HCP36 8, and Nett 71", () => {
  const summary = scoreSummary([3, ...Array(10).fill(4), ...Array(6).fill(5), 6], pars);
  assert.deepEqual(summary, { front: 35, back: 44, gross: 79, points: 28, system36Handicap: 8, nett: 71 });
});