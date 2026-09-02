import assert from "node:assert/strict";
import test from "node:test";
import { loadCourseCatalog } from "./course-catalog.ts";
import { loadPsgcRancamayaFixture, PSGC_SOURCE_NOTE } from "./psgc-rancamaya-fixture.ts";
import { calculateTournamentWinners } from "./winner-engine.ts";

test("PSGC Rancamaya fixture preserves all master categories and pairing aliases", () => {
  const fixture = loadPsgcRancamayaFixture(loadCourseCatalog());
  assert.ok(fixture);
  const players = fixture.scores[1];
  assert.equal(fixture.dataNotice, PSGC_SOURCE_NOTE);
  assert.equal(players.length, 63);
  assert.equal(fixture.pairingMatched, 63);
  assert.deepEqual(fixture.unmatchedPairingNames, []);
  assert.deepEqual(Object.fromEntries(["A", "B", "C", "SS"].map((category) => [category, players.filter((player) => player.awardCategory === category).length])), { A: 17, B: 19, C: 19, SS: 8 });
  assert.ok(players.every((player) => player.scores.every((score) => score === null)));
  assert.equal(players.find((player) => player.name === "TATO K. SUDARTO")?.awardCategory, "SS");
  assert.equal(players.find((player) => player.name === "TATO K. SUDARTO")?.pairing, "6B");
  const ali = players.find((player) => player.name === "ALI MUNDAKIR");
  assert.equal(ali?.handicap, 20);
  assert.equal(ali?.awardCategory, "B");
});

test("PSGC profile uses explicit categories and Super Senior receives Nett awards only", () => {
  const fixture = loadPsgcRancamayaFixture(loadCourseCatalog());
  assert.ok(fixture);
  const players = fixture.scores[1].map((player) => ({ ...player, scores: Array(18).fill(4) }));
  const course = loadCourseCatalog().find((candidate) => candidate.id === fixture.rounds[0].courseId);
  assert.ok(course?.pars);
  const result = calculateTournamentWinners([{ id: 1, pars: course.pars, players }], 3, [14, 19], { scoringSystem: "handicap", tournamentFormat: "psgc" });
  assert.deepEqual(Object.fromEntries(["A", "B", "C", "SS"].map((category) => [category, result.flights[category].length])), { A: 17, B: 19, C: 19, SS: 8 });
  const codes = result.awards.map((award) => award.code);
  assert.ok(codes.includes("BN 1 SS") && codes.includes("BN 2 SS") && codes.includes("BN 3 SS"));
  assert.equal(codes.includes("BGSS"), false);
  assert.equal(result.flights.B.some((player) => player.name === "ALI MUNDAKIR"), true);
});