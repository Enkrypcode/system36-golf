import assert from "node:assert/strict";
import test from "node:test";

import { blankNovelty, noveltyText } from "./novelties.ts";
import { parseSavedTournament, serializeTournament } from "./tournament-storage.ts";

test("Novelties preserve type, optional hole, stable player ID, and decimal distance", () => {
  const novelty = { ...blankNovelty("novelty-1"), type: "NTTP" as const, hole: 3, playerId: "fikri", distance: "1.8" };
  assert.equal(noveltyText(novelty, "Fikri"), "NTTP · Hole 3 · Fikri · 1.8 m");

  const saved = {
    version: 1 as const, step: 3 as const, name: "Novelty test", roundCount: 1,
    rounds: [{ id: 1, courseId: 44, players: 1 }],
    tournamentScores: { 1: [{ id: "fikri", name: "Fikri", pairing: "", scores: Array(18).fill(4) }] },
    flights: 1, flightLimits: [], scoringSystem: "system36" as const, tournamentFormat: "standard" as const,
    novelties: [novelty],
  };
  const restored = parseSavedTournament(serializeTournament(saved));
  assert.deepEqual(restored?.novelties, [novelty]);
});