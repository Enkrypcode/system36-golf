import source from "../data/system36-real-test-data.json" with { type: "json" };
import type { ScoringCourse } from "./course-catalog.ts";
import type { Player } from "./scoring.ts";

type FixturePlayer = { name: string; scores: number[] };
type FixtureRound = { round: number; course: string; playerCount: number; players: FixturePlayer[] };
type FixtureAlias = { round1Name: string; round2Name: string };
type FixtureSource = { rounds: FixtureRound[]; proposedIdentityAliases: FixtureAlias[] };
export type LoadedFixture = { name: string; rounds: Array<{ id: number; courseId: number; players: number }>; scores: Record<number, Player[]> };

const normalized = (value: string) => value.trim().toLocaleLowerCase();

export function loadKbpJngTestFixture(courses: ScoringCourse[]): LoadedFixture | null {
  const fixture = source as FixtureSource;
  if (!Array.isArray(fixture.rounds) || fixture.rounds.length !== 2) return null;
  const aliases = new Map<string, string>();
  for (const alias of fixture.proposedIdentityAliases ?? []) {
    const stableId = `fixture:${normalized(alias.round1Name)}`;
    aliases.set(normalized(alias.round1Name), stableId);
    aliases.set(normalized(alias.round2Name), stableId);
  }
  const rounds = fixture.rounds.map((round) => {
    const course = courses.find((candidate) => normalized(candidate.name) === normalized(round.course));
    if (!course?.pars || !Array.isArray(round.players) || round.players.length !== round.playerCount) return null;
    return { id: round.round, courseId: course.id, players: round.playerCount };
  });
  if (rounds.some((round) => round === null)) return null;
  const scores: Record<number, Player[]> = {};
  for (const round of fixture.rounds) {
    scores[round.round] = round.players.map((player) => ({
      id: aliases.get(normalized(player.name)) ?? `fixture:${normalized(player.name)}`,
      name: player.name,
      handicap: 0,
      // The source uses 0 for an unrecorded hole. The app represents that safely as blank.
      scores: player.scores.map((score) => score === 0 ? null : score),
    }));
  }
  return { name: "KBP & JNG Historical Regression", rounds: rounds as Array<{ id: number; courseId: number; players: number }>, scores };
}
