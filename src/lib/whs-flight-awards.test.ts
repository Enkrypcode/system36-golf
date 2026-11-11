import assert from "node:assert/strict";
import test from "node:test";
import { calculateTournamentWinners } from "./winner-engine.ts";
import { scoreEntryResultsCsv } from "./score-entry-export.ts";
import { tournamentResultsCsv } from "./winner-export.ts";
import { parseWhsRoster, rosterPlayers, type WhsFlightFormat, type WhsRoster } from "./whs-roster.ts";
import type { Player } from "./scoring.ts";

const pars = Array(18).fill(4);
const categories = (format: WhsFlightFormat, withSs: boolean) => [...(format === "A-C" ? ["A", "B", "C"] : ["A", "B", "C", "D"]), ...(withSs ? ["SS"] : [])] as Array<"A" | "B" | "C" | "D" | "SS">;
const completedScores = (index: number) => pars.map((par, hole) => par + (hole < index % 18 ? 1 : 0) + Math.floor(index / 18));
const fixture = (format: WhsFlightFormat, withSs = true) => {
  const flights = categories(format, withSs);
  const roster: WhsRoster = { format: "whs-play-setup-v1", tournamentName: "WHS Flight Cup", playDate: "2026-11-11", course: "Test Course", flightFormat: format,
    players: Array.from({ length: 72 }, (_, index) => ({ playerId: `id-${index}`, name: `Player ${index}`, handicap: index === 0 ? 18 : [6, 12, 20, 28, 18][index % 5], flight: flights[index % flights.length], tee: "White", ...(index === 0 ? { provisionalHandicap: 18 } : {}) })) };
  const imported = rosterPlayers(parseWhsRoster(JSON.stringify(roster)));
  const players: Player[] = imported.map((player, index) => ({ ...player, pairing: `Group ${index % 18}`, scores: completedScores(index) }));
  const result = calculateTournamentWinners([{ id: 1, pars, players }], 0, [], { scoringSystem: "handicap", tournamentFormat: "whs", whsFlightFormat: format, awardMode: "gross-nett", overallAwards: true });
  return { roster, imported, players, result, flights };
};

for (const format of ["A-C", "A-D"] as const) test(`WHS ${format} awards use 72 assigned Flights and effective HC`, () => {
  const { imported, players, result, flights } = fixture(format);
  assert.equal(imported.length, 72);
  assert.ok(imported.every((player) => player.pairing === "" && player.scores.every((score) => score === null)));
  assert.equal(result.validationError, undefined);
  assert.equal(result.eligible.length, 72);
  assert.equal(Object.values(result.flights).reduce((count, members) => count + members.length, 0), 72);
  assert.deepEqual(Object.keys(result.flights), flights);
  for (const flight of flights) {
    const expected = players.filter((player) => player.awardCategory === flight);
    assert.equal(result.flights[flight].length, expected.length);
    assert.ok(result.flights[flight].every((player) => player.awardCategory === flight && player.flight === flight));
  }
  assert.ok(result.flights.SS.every((player) => !result.flights.A.some((member) => member.key === player.key)));
  assert.equal(result.flights.D?.length ?? 0, format === "A-C" ? 0 : players.filter((player) => player.awardCategory === "D").length);
  const first = result.eligible.find((player) => player.key === "whs:id-0");
  assert.equal(first?.handicap, 18);
  assert.equal(first?.aggregateGross, players[0].scores.reduce<number>((sum, score) => sum + (score ?? 0), 0));
  assert.equal(first?.aggregateNett, first!.aggregateGross - 18);
  assert.equal(players[0].pairing, "Group 0");
  assert.equal(result.awards.some((award) => award.code === "BGSS"), false);
  assert.ok(result.awards.some((award) => award.code === "BN 1 SS"));
  assert.equal(result.awards.some((award) => award.code === "BGD"), format === "A-D");
  for (const award of result.awards) {
    const flight = award.code.match(/(?:BG|BN \d )([ABCD]|SS)$/)?.[1];
    if (flight && award.winner) assert.equal(award.winner.flight, flight, `${award.code} belongs to its assigned Flight`);
  }
  const winnerKeys = result.awards.flatMap((award) => award.winner ? [award.winner.key] : []);
  assert.equal(new Set(winnerKeys).size, winnerKeys.length, "one player cannot receive two awards");
  const roundCsv = scoreEntryResultsCsv(players, pars, { scoringSystem: "handicap", tournamentFormat: "whs" });
  assert.match(roundCsv.split("\r\n")[0], /Handicap,Flight,Pairing/);
  assert.match(roundCsv, /Group 0/);
  if (format === "A-D") assert.match(roundCsv, /,D,Group/);
  else assert.doesNotMatch(roundCsv, /,D,Group/);
  const awardsCsv = tournamentResultsCsv(result, 1, "handicap");
  assert.match(awardsCsv, /"Flight"/);
  if (format === "A-D") assert.match(awardsCsv, /"D"/);
});

test("WHS Super Senior is optional; existing award switches still control Gross and Overall awards", () => {
  const { players } = fixture("A-C", false);
  const result = calculateTournamentWinners([{ id: 1, pars, players }], 0, [], { scoringSystem: "handicap", tournamentFormat: "whs", whsFlightFormat: "A-C", awardMode: "nett-only", overallAwards: false });
  assert.deepEqual(Object.keys(result.flights), ["A", "B", "C"]);
  assert.equal(result.awards.some((award) => award.code.includes("SS") || award.code.startsWith("BG") || award.code === "BN 1"), false);
  assert.deepEqual(result.awards.map((award) => award.code).slice(0, 3), ["BN 1 A", "BN 2 A", "BN 3 A"]);
});

test("WHS awards fail closed for wrong format, missing Flight, or missing effective HC", () => {
  const { players } = fixture("A-D");
  const calculate = (field: Player[], format?: WhsFlightFormat) => calculateTournamentWinners([{ id: 1, pars, players: field }], 0, [], { scoringSystem: "handicap", tournamentFormat: "whs", whsFlightFormat: format });
  assert.match(calculate(players).validationError ?? "", /Flight format/);
  assert.match(calculate(players, "A-C").validationError ?? "", /assigned Flight/);
  assert.match(calculate([{ ...players[0], awardCategory: undefined }, ...players.slice(1)], "A-D").validationError ?? "", /assigned Flight/);
  assert.match(calculate([{ ...players[0], handicap: undefined }, ...players.slice(1)], "A-D").validationError ?? "", /effective HC/);
});
