import type { Player } from "./scoring.ts";

export type JackpotMode = "blind-hole" | "manual";

export type JackpotSettings = {
  enabled: boolean;
  mode: JackpotMode;
  blindHoles: number[];
  locked: boolean;
  revealed: boolean;
};

export type JackpotResult = {
  playerId: string;
  name: string;
  target: number | null;
  final: number | null;
  delta: number | null;
  result: "ELIGIBLE" | "DIS" | "INCOMPLETE";
  rank: number | null;
  excluded?: boolean;
};

export const defaultJackpotSettings = (): JackpotSettings => ({ enabled: false, mode: "blind-hole", blindHoles: [], locked: false, revealed: false });

const isHole = (hole: number) => Number.isInteger(hole) && hole >= 1 && hole <= 18;

export function isValidBlindHoles(holes: number[]) {
  const unique = new Set(holes);
  return holes.length === 4 && unique.size === 4 && holes.every(isHole)
    && holes.filter((hole) => hole <= 9).length === 2
    && holes.filter((hole) => hole >= 10).length === 2;
}

export function normalizeBlindHoles(holes: number[]) {
  return Array.from(new Set(holes.filter(isHole))).sort((left, right) => left - right);
}

export function adjustedJackpotTotal(scores: Array<number | null>, pars: number[], holes: number[], section: "front" | "back") {
  const start = section === "front" ? 0 : 9;
  const end = start + 9;
  if (scores.length !== 18 || pars.length < 18 || scores.slice(start, end).some((score) => !Number.isInteger(score))) return null;
  return scores.slice(start, end).reduce<number>((total, score, index) => {
    const hole = start + index + 1;
    return total + (holes.includes(hole) ? pars[start + index] : score as number);
  }, 0);
}

const targetFor = (player: Player, section: "front" | "back") => section === "front" ? player.jackpotTargetFront : player.jackpotTargetBack;

export function calculateJackpotResults(players: Player[], pars: number[], holes: number[], section: "front" | "back"): JackpotResult[] {
  const validHoles = isValidBlindHoles(holes);
  const results: JackpotResult[] = players.map((player) => {
    const target = targetFor(player, section);
    const final = validHoles ? adjustedJackpotTotal(player.scores, pars, holes, section) : null;
    if (!Number.isFinite(target) || final === null) return { playerId: player.id, name: player.name, target: target ?? null, final, delta: null, result: "INCOMPLETE" as const, rank: null };
    const delta = final - target!;
    return { playerId: player.id, name: player.name, target: target!, final, delta, result: delta < 0 ? "DIS" as const : "ELIGIBLE" as const, rank: null };
  });
  const eligible = results.filter((entry) => entry.result === "ELIGIBLE").sort((left, right) => left.delta! - right.delta! || left.name.localeCompare(right.name));
  let rank = 0;
  let previousDelta: number | null = null;
  eligible.forEach((entry, index) => {
    if (entry.delta !== previousDelta) rank = index + 1;
    entry.rank = rank;
    previousDelta = entry.delta;
  });
  const ranks = new Map(eligible.map((entry) => [entry.playerId, entry.rank]));
  return results.map((entry) => ({ ...entry, rank: ranks.get(entry.playerId) ?? null }));
}
/** Manual Jackpot uses only operator-entered values, never H1–H18 or course PAR. */
export function calculateManualJackpotResults(players: Player[], section: "front" | "back", excludedPlayerIds: ReadonlySet<string> = new Set()): JackpotResult[] {
  const results: JackpotResult[] = players.map((player) => {
    const target = targetFor(player, section);
    const final = section === "front" ? player.jackpotManualFirstNine : player.jackpotManualSecondNine;
    if (!Number.isFinite(target) || !Number.isFinite(final)) return { playerId: player.id, name: player.name, target: target ?? null, final: final ?? null, delta: null, result: "INCOMPLETE" as const, rank: null };
    const delta = final! - target!;
    return { playerId: player.id, name: player.name, target: target!, final: final!, delta, result: delta < 0 ? "DIS" as const : "ELIGIBLE" as const, rank: null, excluded: excludedPlayerIds.has(player.id) };
  });
  const eligible = results.filter((entry) => entry.result === "ELIGIBLE" && !entry.excluded).sort((left, right) => left.delta! - right.delta! || left.name.localeCompare(right.name));
  let rank = 0;
  let previousDelta: number | null = null;
  eligible.forEach((entry, index) => {
    if (entry.delta !== previousDelta) rank = index + 1;
    entry.rank = rank;
    previousDelta = entry.delta;
  });
  const ranks = new Map(eligible.map((entry) => [entry.playerId, entry.rank]));
  return results.map((entry) => ({ ...entry, rank: ranks.get(entry.playerId) ?? null }));
}

/** The unique First Nine leader cannot receive a Second Nine Manual Jackpot award. */
export function calculateManualJackpotResultPair(players: Player[]) {
  const front = calculateManualJackpotResults(players, "front");
  const frontLeaders = front.filter((entry) => entry.rank === 1);
  const excluded = frontLeaders.length === 1 ? new Set([frontLeaders[0].playerId]) : new Set<string>();
  return { front, back: calculateManualJackpotResults(players, "back", excluded) };
}