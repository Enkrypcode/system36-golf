import assert from "node:assert/strict";
import test from "node:test";
import { nettAdjustmentForScore, pointForScore, scoreSummary } from "./scoring.ts";

const pars = Array(18).fill(4);
const roundWith = (firstHoleScore: number) => [firstHoleScore, ...Array(17).fill(4)];

test("residual nett adjustments avoid double-counting scores over par", () => {
  assert.equal(nettAdjustmentForScore(1, 4), -2, "Albatross needs only the residual -2 after HCP 36");
  assert.equal(nettAdjustmentForScore(2, 4), -2, "Eagle");
  assert.equal(nettAdjustmentForScore(3, 4), -1, "Birdie");
  assert.equal(nettAdjustmentForScore(4, 4), 0, "Par");
  assert.equal(nettAdjustmentForScore(5, 4), 0, "Bogey");
  assert.equal(nettAdjustmentForScore(6, 4), 0, "Double Bogey");
  assert.equal(nettAdjustmentForScore(7, 4), 0, "Triple Bogey is already reflected by Gross - HCP 36");
  assert.equal(nettAdjustmentForScore(8, 4), 0, "Quadruple Bogey is already reflected by Gross - HCP 36");
});

test("full Par 72 round nett outcomes match the System 36 regression cases", () => {
  const scenarios = [
    [4, 72, 36, 0, 72, "All Par"],
    [3, 71, 37, -1, 71, "One Birdie"],
    [2, 70, 38, -2, 70, "One Eagle"],
    [1, 69, 38, -2, 69, "One Albatross"],
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
    assert.equal(summary.nett, nett, `${label}: final Nett`);
  }
});

test("existing point rules remain unchanged", () => {
  assert.equal(pointForScore(2, 4), 4, "Eagle or better");
  assert.equal(pointForScore(3, 4), 3, "Birdie");
  assert.equal(pointForScore(4, 4), 2, "Par");
  assert.equal(pointForScore(5, 4), 1, "Bogey");
  assert.equal(pointForScore(6, 4), 0, "Double Bogey");
});
