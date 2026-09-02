import type { NettTieBreakMethod, Player, ScoringSystem, TournamentFormat } from "./scoring.ts";
import { isNoveltyEntry, type NoveltyEntry } from "./novelties.ts";

export const TOURNAMENT_STORAGE_KEY = "system36:tournament:v1";

export type SavedTournamentRound = { id: number; courseId: number | null; players: number | null };
export type SavedTournament = {
  version: 1; step: 1 | 2 | 3; name: string; roundCount: number; rounds: SavedTournamentRound[];
  tournamentScores: Record<number, Player[]>; flights: number; flightLimits: number[];
  scoringSystem?: ScoringSystem; tournamentFormat?: TournamentFormat; nettTieBreakMethod?: NettTieBreakMethod; novelties?: NoveltyEntry[];
};

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isScore = (value: unknown) => value === null || (Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 15);
const isPlayer = (value: unknown): value is Player => isObject(value)
  && typeof value.id === "string" && typeof value.name === "string"
  && (value.pairing === undefined || typeof value.pairing === "string")
  && (value.handicap === undefined || (typeof value.handicap === "number" && Number.isFinite(value.handicap)))
  && (value.awardCategory === undefined || value.awardCategory === "A" || value.awardCategory === "B" || value.awardCategory === "C" || value.awardCategory === "SS")
  && Array.isArray(value.scores) && value.scores.length === 18 && value.scores.every(isScore);

export function parseSavedTournament(raw: string | null): SavedTournament | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isObject(value) || value.version !== 1 || ![1, 2, 3].includes(value.step as number) || typeof value.name !== "string"
      || !Number.isInteger(value.roundCount) || (value.roundCount as number) < 1 || (value.roundCount as number) > 5
      || !Array.isArray(value.rounds) || value.rounds.length !== value.roundCount || !Number.isInteger(value.flights)
      || (value.flights as number) < 1 || (value.flights as number) > 3 || !Array.isArray(value.flightLimits)
      || value.flightLimits.length !== (value.flights as number) - 1 || !value.flightLimits.every((limit) => typeof limit === "number" && Number.isFinite(limit))
      || !isObject(value.tournamentScores) || (value.novelties !== undefined && (!Array.isArray(value.novelties) || !value.novelties.every(isNoveltyEntry)))) return null;
    const scoringSystem: ScoringSystem = value.scoringSystem === "handicap" ? "handicap" : "system36";
    const tournamentFormat: TournamentFormat = scoringSystem === "handicap" && value.tournamentFormat === "psgc" ? "psgc" : "standard";
    const nettTieBreakMethod: NettTieBreakMethod = value.nettTieBreakMethod === "lower-handicap" || value.nettTieBreakMethod === "countback"
      ? value.nettTieBreakMethod
      : scoringSystem === "handicap" && tournamentFormat === "psgc" ? "lower-handicap" : "countback";
    const rounds = value.rounds as unknown[]; const ids = new Set<number>();
    if (!rounds.every((round) => isObject(round) && Number.isInteger(round.id) && (round.id as number) > 0 && !ids.has(round.id as number) && (ids.add(round.id as number), true)
      && (round.courseId === null || (Number.isInteger(round.courseId) && (round.courseId as number) > 0))
      && (round.players === null || (Number.isInteger(round.players) && (round.players as number) >= 1 && (round.players as number) <= 200)))) return null;
    const tournamentScores: Record<number, Player[]> = {};
    for (const [roundId, players] of Object.entries(value.tournamentScores)) {
      const id = Number(roundId);
      if (!Number.isInteger(id) || !ids.has(id) || !Array.isArray(players) || !players.every(isPlayer)) return null;
      tournamentScores[id] = players.map((player) => {        return { id: player.id, name: player.name, pairing: player.pairing?.trim().toLocaleUpperCase(), ...(player.handicap === undefined ? {} : { handicap: player.handicap }), ...(player.awardCategory === undefined ? {} : { awardCategory: player.awardCategory }), scores: player.scores };
      });
    }
    return { version: 1, step: value.step as 1 | 2 | 3, name: value.name, roundCount: value.roundCount as number, rounds: rounds as SavedTournamentRound[], tournamentScores, flights: value.flights as number, flightLimits: value.flightLimits as number[], scoringSystem, tournamentFormat, nettTieBreakMethod, ...(value.novelties === undefined ? {} : { novelties: value.novelties as NoveltyEntry[] }) };
  } catch { return null; }
}
export const serializeTournament = (tournament: SavedTournament) => JSON.stringify(tournament);