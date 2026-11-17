import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { createWinnersPdf } from "./winner-pdf.ts";
import { winnerPdfFilename, winnerPdfPresentation, type WinnerPdfInput } from "./winner-pdf-model.ts";
import { calculateTournamentWinners } from "./winner-engine.ts";
import { calculateJackpotResults, calculateManualJackpotResultPair } from "./jackpot.ts";
import { loadCourseCatalog } from "./course-catalog.ts";
import { loadGobarHendraSplitNineFixture } from "./gobar-hendra-jaya-split9-fixture.ts";
import { loadPsgcRancamayaFixture } from "./psgc-rancamaya-fixture.ts";

const pars = Array(18).fill(4);
const players = Array.from({ length: 20 }, (_, index) => ({
  id: String(index), name: `Player ${index + 1}`, handicap: index + 2,
  scores: pars.map((par, hole) => par + (index + hole) % 3),
  jackpotTargetFront: 36, jackpotTargetBack: 36,
  jackpotManualFirstNine: 40 + index, jackpotManualSecondNine: 41 + index, jackpotManualNett: 70,
}));
const overall: Array<[string, string[]]> = [["Overall", ["BGO", "BNO"]], ["Flight A", ["BGA", "BN 1 A", "BN 2 A"]], ["Flight B", ["BGB", "BN 1 B", "BN 2 B"]]];
const base = { name: "EnkrypScore Tournament", rounds: ["Round 1 - The Manor Golf & Estate"], novelties: [] };
const standard: WinnerPdfInput = { ...base, scoringSystem: "handicap", tournamentFormat: "standard", awardSections: overall, result: calculateTournamentWinners([{ id: 1, pars, players }], 2, [12], { scoringSystem: "handicap" }) };
const courses = loadCourseCatalog();
const splitFixture = loadGobarHendraSplitNineFixture(courses)!;
const splitResult = calculateTournamentWinners(splitFixture.rounds.map((round) => ({ id: round.id, pars: courses.find((course) => course.id === round.courseId)!.pars!, players: splitFixture.scores[round.id] })), 0, [], { scoringSystem: "handicap", tournamentFormat: "split9" });
const psgcFixture = loadPsgcRancamayaFixture(courses)!;
const psgcResult = calculateTournamentWinners(psgcFixture.rounds.map((round) => ({ id: round.id, pars: courses.find((course) => course.id === round.courseId)!.pars!, players: psgcFixture.scores[round.id] })), 3, [14, 19], { scoringSystem: "handicap", tournamentFormat: "psgc" });
const manual = calculateManualJackpotResultPair(players);
export const pdfCases: Record<string, WinnerPdfInput> = {
  handicap: standard,
  system36: { ...standard, scoringSystem: "system36", result: calculateTournamentWinners([{ id: 1, pars, players }], 2, [12]) },
  "nett-only": { ...standard, awardSections: [["Best Nett", ["BN 1", "BN 2", "BN 3"]]], result: calculateTournamentWinners([{ id: 1, pars, players }], 0, [], { scoringSystem: "handicap", awardMode: "nett-only" }) },
  psgc: { ...standard, name: psgcFixture.name, rounds: psgcFixture.rounds.map((round, index) => `Round ${index + 1} - ${courses.find((course) => course.id === round.courseId)!.name}`), tournamentFormat: "psgc", result: psgcResult, awardSections: [["Overall", ["BGO", "BNO"]], ...["A","B","C","SS"].map((flight): [string,string[]] => [flight === "SS" ? "Super Senior" : "Flight " + flight, [`BG${flight}`, `BN 1 ${flight}`, `BN 2 ${flight}`, `BN 3 ${flight}`]])] },
  split9: { ...standard, name: splitFixture.name, tournamentFormat: "split9", result: splitResult },
  jackpot: { ...standard, jackpot: { label: "Blind Hole Jackpot", detail: "4 Blind Holes Locked", champions: ["Player 1", "Player 2"], front: calculateJackpotResults(players, pars, [1,2,10,11], "front"), back: calculateJackpotResults(players, pars, [1,2,10,11], "back") } },
  manual: { ...standard, jackpot: { label: "Manual Jackpot - Blind Hole", detail: "4 Blind Holes Locked", champions: [manual.front.find((row) => row.rank === 1)!.name, manual.back.find((row) => row.rank === 1)!.name], front: manual.front, back: manual.back }, novelties: Array.from({length: 30}, (_, i) => `Nearest to Pin - Player ${i + 1} - ${i + 2}.5 m`) },
};

test("PDF presentation follows existing winner results and omits empty award groups", () => {
  const model = winnerPdfPresentation(standard);
  assert.deepEqual(model.sections.flatMap((section) => section.rows.map((row) => row[0])), standard.result.awards.filter((award) => award.winner || award.tied?.length).map((award) => award.code));
  const empty = winnerPdfPresentation({ ...standard, result: { eligible: [], notEligible: 0, flights: {}, awards: [] } });
  assert.equal(empty.sections.length, 0);
  const nett = winnerPdfPresentation(pdfCases["nett-only"]);
  assert.ok(nett.sections.length > 0);
  assert.ok(nett.sections.every((section) => section.rows.every((row) => !row[0].startsWith("BG"))));
  const split = winnerPdfPresentation(pdfCases.split9);
  assert.deepEqual(split.sections.map((section) => section.title), ["Overall", "1st Nine Leaderboard", "2nd Nine Leaderboard"]);
  assert.ok(split.sections[1].rows.some((row) => row.at(-1) === "Champion"));
  assert.ok(winnerPdfPresentation(pdfCases.psgc).sections.some((section) => section.title === "Super Senior"));
  assert.deepEqual(winnerPdfPresentation(pdfCases.manual).sections.slice(-4).map((section) => section.title), ["Jackpot Winners / Champions - Manual Jackpot - Blind Hole", "Target 1–9", "Target 10–18", "Novelties"]);
});

test("all supported PDF formats generate A4 portrait and paginate long results", () => {
  for (const [name, input] of Object.entries(pdfCases)) {
    const pdf = createWinnersPdf(input);
    assert.ok(Math.abs(pdf.internal.pageSize.getWidth() - 210) < 0.1);
    assert.ok(Math.abs(pdf.internal.pageSize.getHeight() - 297) < 0.1);
    assert.ok(pdf.output().startsWith("%PDF-"));
    if (name === "manual") assert.ok(pdf.getNumberOfPages() >= 3);
    if (process.env.PDF_QA_OUTPUT) {
      mkdirSync("tmp/pdfs", { recursive: true });
      writeFileSync(`tmp/pdfs/${name}.pdf`, Buffer.from(pdf.output("arraybuffer")));
    }
  }
  assert.equal(winnerPdfFilename('GOBAR / PSGC: November 2026?'), "GOBAR-PSGC-November-2026-Winners.pdf");
});
