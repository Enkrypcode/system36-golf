import assert from "node:assert/strict";
import test from "node:test";
import { parseWhsRoster, rosterMatchesCurrent, rosterPlayers, whsImportDecision, type WhsRoster } from "./whs-roster.ts";
import { parseSavedTournament, serializeTournament, type SavedTournament } from "./tournament-storage.ts";

const roster: WhsRoster = {
  format: "whs-play-setup-v1", tournamentName: "November Cup", playDate: "2026-11-11", course: "Local Course", flightFormat: "A-D",
  players: Array.from({ length: 72 }, (_, index) => ({
    playerId: `player-${index + 1}`, name: `Player ${index + 1}`, handicap: index === 0 ? 18 : index === 1 ? 28 : index % 29,
    flight: (["A", "B", "C", "D", "SS"] as const)[index % 5], tee: index % 2 ? "Blue" : "White",
    ...(index === 0 ? { provisionalHandicap: 18 } : {}), ...(index === 1 ? { maxHandicapApplied: true } : {}),
  })),
};

test("WHS roster imports 72 unique players with effective HC, flight, tee, and blank scores", () => {
  const parsed = parseWhsRoster(JSON.stringify(roster));
  const players = rosterPlayers(parsed);
  assert.equal(players.length, 72);
  assert.deepEqual(players.map((player) => player.sourcePlayerId), roster.players.map((player) => player.playerId));
  assert.equal(players[0].handicap, 18);
  assert.equal(players[0].provisionalHandicap, 18);
  assert.equal(players[1].maxHandicapApplied, true);
  assert.equal(players[3].awardCategory, "D");
  assert.equal(players[4].awardCategory, "SS");
  assert.equal(players[0].tee, "White");
  assert.ok(players.every((player) => player.pairing === "" && player.scores.every((score) => score === null)));
  assert.equal(rosterMatchesCurrent(parsed, roster.tournamentName, players), true);
});

test("A-C and A-D formats retain explicit flights and reject malformed or duplicate players", () => {
  const threeFlights = { ...roster, flightFormat: "A-C" as const, players: roster.players.filter((player) => player.flight !== "D") };
  assert.ok(parseWhsRoster(JSON.stringify(threeFlights)).players.every((player) => player.flight !== "D"));
  assert.equal(parseWhsRoster(JSON.stringify(threeFlights)).flightFormat, "A-C");
  assert.equal(parseWhsRoster(JSON.stringify(roster)).players[3].flight, "D");
  assert.throws(() => parseWhsRoster(JSON.stringify({ ...roster, flightFormat: "A-C" })), /Flight D cannot appear/);
  assert.equal(parseWhsRoster(JSON.stringify({ ...roster, flightFormat: undefined })).flightFormat, "A-D", "older JSON imports infer D from roster");
  assert.throws(() => parseWhsRoster(JSON.stringify({ ...roster, players: [...roster.players, roster.players[0]] })), /duplicates/);
  assert.equal(parseWhsRoster(JSON.stringify({ ...roster, players: [{ ...roster.players[0] }, { ...roster.players[1], name: roster.players[0].name }] })).players.length, 2, "distinct WHS IDs may share a name");
  assert.throws(() => parseWhsRoster(JSON.stringify({ ...roster, players: [{ ...roster.players[0], handicap: "18(P)" }] })), /invalid WHS data/);
  assert.throws(() => parseWhsRoster(JSON.stringify({ ...roster, players: [{ ...roster.players[0], flight: "Unclassified" }] })), /invalid WHS data/);
  assert.throws(() => parseWhsRoster(JSON.stringify({ ...roster, players: [] })), /tournament details/);
});

test("repeated roster matches existing data and saved tournament preserves WHS metadata and scores", () => {
  const players = rosterPlayers(roster);
  players[0].scores[0] = 5;
  assert.equal(rosterMatchesCurrent(roster, roster.tournamentName, players), true);
  assert.equal(whsImportDecision(roster, { name: roster.tournamentName, playDate: roster.playDate, sourceCourse: roster.course, flightFormat: roster.flightFormat, players, meaningful: true }), "same", "repeat import does not touch scored rows");
  assert.equal(whsImportDecision({ ...roster, players: [{ ...roster.players[0], handicap: 19 }, ...roster.players.slice(1)] }, { name: roster.tournamentName, playDate: roster.playDate, sourceCourse: roster.course, flightFormat: roster.flightFormat, players, meaningful: true }), "blocked", "changed HC cannot alter scored results");
  assert.equal(whsImportDecision(roster, { name: "", playDate: "", sourceCourse: "", players: [], meaningful: false }), "new");
  assert.equal(rosterMatchesCurrent(roster, "Another tournament", players), false);
  const saved: SavedTournament = { version: 1, step: 2, name: roster.tournamentName, playDate: roster.playDate, sourceCourse: roster.course, whsFlightFormat: roster.flightFormat,
    roundCount: 1, rounds: [{ id: 1, courseId: 1, players: 72 }], tournamentScores: { 1: players },
    flights: 0, flightLimits: [], scoringSystem: "handicap", tournamentFormat: "whs" };
  const restored = parseSavedTournament(serializeTournament(saved));
  assert.equal(restored?.playDate, roster.playDate);
  assert.equal(restored?.sourceCourse, roster.course);
  assert.equal(restored?.whsFlightFormat, "A-D");
  assert.equal(restored?.tournamentFormat, "whs");
  assert.equal(restored?.tournamentScores[1][0].scores[0], 5);
  assert.equal(restored?.tournamentScores[1][0].sourcePlayerId, "player-1");
  assert.equal(restored?.tournamentScores[1][3].awardCategory, "D");
});
