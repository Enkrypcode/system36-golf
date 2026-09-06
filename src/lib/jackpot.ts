import type { Player } from "./scoring.ts";

export type JackpotSettings = {
  enabled: boolean;
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
};

export const defaultJackpotSettings = (): JackpotSettings => ({ enabled: false, blindHoles: [], locked: false, revealed: false });

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