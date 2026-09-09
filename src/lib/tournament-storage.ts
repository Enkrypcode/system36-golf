import type { AwardMode, NettTieBreakMethod, Player, ScoringSystem, TournamentFormat } from "./scoring.ts";
import { isNoveltyEntry, type NoveltyEntry } from "./novelties.ts";
import { defaultJackpotSettings, isValidBlindHoles, normalizeBlindHoles, type JackpotSettings } from "./jackpot.ts";

export const TOURNAMENT_STORAGE_KEY = "system36:tournament:v1";

export type SavedTournamentRound = { id: number; courseId: number | null; players: number | null };
export type SavedTournament = {
  version: 1; step: 1 | 2 | 3; name: string; roundCount: number; rounds: SavedTournamentRound[];
  tournamentScores: Record<number, Player[]>; flights: number; flightLimits: number[]; overallAwards?: boolean;
  scoringSystem?: ScoringSystem; tournamentFormat?: TournamentFormat; awardMode?: AwardMode; system36AwardMode?: AwardMode; handicapAwardMode?: AwardMode; nettTieBreakMethod?: NettTieBreakMethod; system36NettTieBreakMethod?: NettTieBreakMethod; handicapNettTieBreakMethod?: NettTieBreakMethod; novelties?: NoveltyEntry[]; jackpot?: JackpotSettings;
};

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isScore = (value: unknown) => value === null || (Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 15);
const isPlayer = (value: unknown): value is Player => isObject(value)
  && typeof value.id === "string" && typeof value.name === "string"
  && (value.pairing === undefined || typeof value.pairing === "string")
  && (value.handicap === undefined || (typeof value.handicap === "number" && Number.isFinite(value.handicap)))
  && (value.awardCategory === undefined || value.awardCategory === "A" || value.awardCategory === "B" || value.awardCategory === "C" || value.awardCategory === "SS")
  && (value.jackpotTargetFront === undefined || (typeof value.jackpotTargetFront === "number" && Number.isFinite(value.jackpotTargetFront) && value.jackpotTargetFront >= 0))
  && (value.jackpotTargetBack === undefined || (typeof value.jackpotTargetBack === "number" && Number.isFinite(value.jackpotTargetBack) && value.jackpotTargetBack >= 0))
  && Array.isArray(value.scores) && value.scores.length === 18 && value.scores.every(isScore);

export function parseSavedTournament(raw: string | null): SavedTournament | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isObject(value) || value.version !== 1 || ![1, 2, 3].includes(value.step as number) || typeof value.name !== "string"
      || !Number.isInteger(value.roundCount) || (value.roundCount as number) < 1 || (value.roundCount as number) > 5
      || !Array.isArray(value.rounds) || value.rounds.length !== value.roundCount || !Number.isInteger(value.flights)
      || (value.flights as number) < 0 || (value.flights as number) > 3 || !Array.isArray(value.flightLimits)
      || value.flightLimits.length !== Math.max(0, (value.flights as number) - 1) || !value.flightLimits.every((limit) => typeof limit === "number" && Number.isFinite(limit))
      || !isObject(value.tournamentScores) || (value.novelties !== undefined && (!Array.isArray(value.novelties) || !value.novelties.every(isNoveltyEntry)))) return null;
    const jackpot = (() : JackpotSettings => {
      if (!isObject(value.jackpot) || value.jackpot.enabled !== true) return defaultJackpotSettings();
      const holes = Array.isArray(value.jackpot.blindHoles) && value.jackpot.blindHoles.every((hole) => typeof hole === "number") ? normalizeBlindHoles(value.jackpot.blindHoles as number[]) : [];
      const locked = value.jackpot.locked === true && isValidBlindHoles(holes);
      return { enabled: true, blindHoles: holes, locked, revealed: locked && value.jackpot.revealed === true };
    })();
    const overallAwards = value.overallAwards !== false;
    const scoringSystem: ScoringSystem = value.scoringSystem === "handicap" ? "handicap" : "system36";
    const tournamentFormat: TournamentFormat = scoringSystem === "handicap" && (value.tournamentFormat === "psgc" || value.tournamentFormat === "split9") ? value.tournamentFormat : "standard";
    const savedAwardMode = value.awardMode === "nett-only" ? "nett-only" : "gross-nett";
    const system36AwardMode: AwardMode = value.system36AwardMode === "nett-only" ? "nett-only" : scoringSystem === "system36" ? savedAwardMode : "gross-nett";
    const handicapAwardMode: AwardMode = value.handicapAwardMode === "nett-only" ? "nett-only" : scoringSystem === "handicap" ? savedAwardMode : "gross-nett";
    const awardMode: AwardMode = scoringSystem === "system36" ? system36AwardMode : handicapAwardMode;
    const validNettTieBreakMethod = (method: unknown): method is NettTieBreakMethod => method === "lower-handicap" || method === "countback";
    const legacyNettTieBreakMethod = validNettTieBreakMethod(value.nettTieBreakMethod) ? value.nettTieBreakMethod : undefined;
    const system36NettTieBreakMethod: NettTieBreakMethod = validNettTieBreakMethod(value.system36NettTieBreakMethod)
      ? value.system36NettTieBreakMethod
      : "lower-handicap";
    const handicapNettTieBreakMethod: NettTieBreakMethod = validNettTieBreakMethod(value.handicapNettTieBreakMethod)
      ? value.handicapNettTieBreakMethod
      : scoringSystem === "handicap" && legacyNettTieBreakMethod ? legacyNettTieBreakMethod : tournamentFormat === "psgc" ? "lower-handicap" : "countback";
    const nettTieBreakMethod = scoringSystem === "system36" ? system36NettTieBreakMethod : handicapNettTieBreakMethod;
    const rounds = value.rounds as unknown[]; const ids = new Set<number>();
    if (!rounds.every((round) => isObject(round) && Number.isInteger(round.id) && (round.id as number) > 0 && !ids.has(round.id as number) && (ids.add(round.id as number), true)
      && (round.courseId === null || (Number.isInteger(round.courseId) && (round.courseId as number) > 0))
      && (round.players === null || (Number.isInteger(round.players) && (round.players as number) >= 1 && (round.players as number) <= 200)))) return null;
    const tournamentScores: Record<number, Player[]> = {};
    for (const [roundId, players] of Object.entries(value.tournamentScores)) {
      const id = Number(roundId);
      if (!Number.isInteger(id) || !ids.has(id) || !Array.isArray(players) || !players.every(isPlayer)) return null;
      tournamentScores[id] = players.map((player) => {        return { id: player.id, name: player.name, pairing: player.pairing?.trim().toLocaleUpperCase(), ...(player.handicap === undefined ? {} : { handicap: player.handicap }), ...(player.awardCategory === undefined ? {} : { awardCategory: player.awardCategory }), ...(player.jackpotTargetFront === undefined ? {} : { jackpotTargetFront: player.jackpotTargetFront }), ...(player.jackpotTargetBack === undefined ? {} : { jackpotTargetBack: player.jackpotTargetBack }), scores: player.scores };
      });
    }
    return { version: 1, step: value.step as 1 | 2 | 3, name: value.name, roundCount: value.roundCount as number, rounds: rounds as SavedTournamentRound[], tournamentScores, flights: value.flights as number, flightLimits: value.flightLimits as number[], scoringSystem, tournamentFormat, overallAwards, awardMode, system36AwardMode, handicapAwardMode, nettTieBreakMethod, system36NettTieBreakMethod, handicapNettTieBreakMethod, jackpot, ...(value.novelties === undefined ? {} : { novelties: value.novelties as NoveltyEntry[] }) };
  } catch { return null; }
}
export const serializeTournament = (tournament: SavedTournament) => JSON.stringify(tournament);
