import source from "../data/gobar-hendra-jaya-split9-demo.json" with { type: "json" };
import type { ScoringCourse } from "./course-catalog.ts";
import type { Player } from "./scoring.ts";

type DemoParticipant = { id: string; name: string; handicap: number; pairing: string; scores: number[] };
type DemoSource = { tournamentName: string; course: string; participants: DemoParticipant[] };

export type LoadedGobarHendraSplitNineFixture = {
  name: string;
  scoringSystem: "handicap";
  tournamentFormat: "split9";
  jackpotEnabled: false;
  rounds: Array<{ id: number; courseId: number; players: number }>;
  scores: Record<number, Player[]>;
};

export const GOBAR_HENDRA_SPLIT_NINE_FIXTURE_NAME = "GOBAR - Hendra Jaya 62th Anniversary";

const normalize = (value: string) => value.trim().toLocaleLowerCase();

export function loadGobarHendraSplitNineFixture(courses: ScoringCourse[]): LoadedGobarHendraSplitNineFixture | null {
  const fixture = source as DemoSource;
  const course = courses.find((candidate) => normalize(candidate.name) === normalize(fixture.course));
  if (!course?.pars || fixture.tournamentName !== GOBAR_HENDRA_SPLIT_NINE_FIXTURE_NAME || fixture.participants.length !== 9 || fixture.participants.some((participant) => !participant.id || !participant.name || !Number.isFinite(participant.handicap) || participant.scores.length !== 18 || participant.scores.some((score) => !Number.isInteger(score) || score <= 0))) return null;
  return {
    name: fixture.tournamentName,
    scoringSystem: "handicap", tournamentFormat: "split9", jackpotEnabled: false,
    rounds: [{ id: 1, courseId: course.id, players: fixture.participants.length }],
    scores: { 1: fixture.participants.map((participant) => ({ id: participant.id, name: participant.name, handicap: participant.handicap, pairing: participant.pairing, scores: [...participant.scores] })) },
  };
}
