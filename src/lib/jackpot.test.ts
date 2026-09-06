import assert from "node:assert/strict";
import test from "node:test";
import { adjustedJackpotTotal, calculateJackpotResults, defaultJackpotSettings, isValidBlindHoles } from "./jackpot.ts";
import { handicapScoreSummary, scoreSummary, type Player } from "./scoring.ts";

const pars = Array(18).fill(4);
const player = (id: string, scores: number[], front?: number, back?: number): Player => ({ id, name: id, scores, ...(front === undefined ? {} : { jackpotTargetFront: front }), ...(back === undefined ? {} : { jackpotTargetBack: back }) });
const holes = [3, 5, 13, 17];

test("Jackpot defaults off and requires exactly two Front and two Back blind holes", () => {
  assert.deepEqual(defaultJackpotSettings(), { enabled: false, blindHoles: [], locked: false, revealed: false });
  assert.equal(isValidBlindHoles(holes), true);
  assert.equal(isValidBlindHoles([1, 2, 3, 13]), false);
  assert.equal(isValidBlindHoles([1, 2, 12, 12]), false);
});

test("Blind-hole PAR substitution affects only Jackpot calculations", () => {
  const scores = Array(18).fill(4); scores[2] = 7; scores[4] = 6;
  assert.equal(adjustedJackpotTotal(scores, pars, holes, "front"), 36);
  assert.equal(scoreSummary(scores, pars).gross, 77);
  assert.equal(handicapScoreSummary(scores, pars, 9).nett, 68);
});

test("Jackpot ranks the closest non-negative deltas, keeps ties, and disqualifies below-target scores", () => {
  const exact = player("Exact", Array(18).fill(4), 36, 36);
  const tied = player("Tied", Array(18).fill(4), 36, 36);
  const above = player("Above", Array(18).fill(4), 35, 35);
  const dis = player("Dis", Array(18).fill(4), 37, 37);
  const front = calculateJackpotResults([exact, tied, above, dis], pars, holes, "front");
  assert.deepEqual(front.map(({ name, delta, result, rank }) => ({ name, delta, result, rank })), [
    { name: "Exact", delta: 0, result: "ELIGIBLE", rank: 1 }, { name: "Tied", delta: 0, result: "ELIGIBLE", rank: 1 },
    { name: "Above", delta: 1, result: "ELIGIBLE", rank: 3 }, { name: "Dis", delta: -1, result: "DIS", rank: null },
  ]);
  assert.deepEqual(calculateJackpotResults([above], pars, holes, "back")[0].delta, 1);
});
test("Jackpot works alongside System 36, Handicap, and PSGC metadata without changing primary results", () => {
  const scores = Array(18).fill(4); scores[2] = 6;
  const psgcPlayer: Player = { id: "PSGC", name: "PSGC Player", handicap: 18, awardCategory: "SS", jackpotTargetFront: 36, jackpotTargetBack: 36, scores };
  const system36Before = scoreSummary(scores, pars);
  const handicapBefore = handicapScoreSummary(scores, pars, psgcPlayer.handicap!);
  const [front] = calculateJackpotResults([psgcPlayer], pars, holes, "front");
  assert.equal(front.final, 36);
  assert.equal(front.result, "ELIGIBLE");
  assert.equal(psgcPlayer.awardCategory, "SS");
  assert.deepEqual(scoreSummary(scores, pars), system36Before);
  assert.deepEqual(handicapScoreSummary(scores, pars, psgcPlayer.handicap!), handicapBefore);
});