import type { Player } from "./scoring.ts";

export type ScoresByRound = Record<number, Player[]>;
export type RemovedPlayerSnapshot = { roundId: number; index: number; player: Player };

export const blankPlayer = (id: string): Player => ({ id, name: "", pairing: "", scores: Array(18).fill(null) });

export function removePlayerFromRound(scoresByRound: ScoresByRound, roundId: number, playerId: string): ScoresByRound {
  return {
    ...scoresByRound,
    [roundId]: (scoresByRound[roundId] ?? []).filter((player) => player.id !== playerId),
  };
}

export function removePlayerFromTournament(scoresByRound: ScoresByRound, playerId: string): ScoresByRound {
  return Object.fromEntries(
    Object.entries(scoresByRound).map(([roundId, players]) => [Number(roundId), players.filter((player) => player.id !== playerId)]),
  );
}

export function playerSnapshots(scoresByRound: ScoresByRound, playerId: string, roundIds: number[]): RemovedPlayerSnapshot[] {
  return roundIds.flatMap((roundId) => {
    const index = (scoresByRound[roundId] ?? []).findIndex((player) => player.id === playerId);
    return index === -1 ? [] : [{ roundId, index, player: scoresByRound[roundId][index] }];
  });
}

export function restorePlayerSnapshots(scoresByRound: ScoresByRound, snapshots: RemovedPlayerSnapshot[]): ScoresByRound {
  const next: ScoresByRound = { ...scoresByRound };
  for (const snapshot of [...snapshots].sort((left, right) => left.roundId - right.roundId || left.index - right.index)) {
    const players = [...(next[snapshot.roundId] ?? [])];
    if (players.some((player) => player.id === snapshot.player.id)) continue;
    players.splice(Math.min(snapshot.index, players.length), 0, snapshot.player);
    next[snapshot.roundId] = players;
  }
  return next;
}

export function addPlayerToRound(scoresByRound: ScoresByRound, roundId: number, player: Player): ScoresByRound {
  return { ...scoresByRound, [roundId]: [...(scoresByRound[roundId] ?? []), player] };
}

export function addPlayerToTournament(scoresByRound: ScoresByRound, roundIds: number[], player: Player): ScoresByRound {
  return { ...scoresByRound, ...Object.fromEntries(roundIds.map((roundId) => [roundId, [...(scoresByRound[roundId] ?? []), { ...player, scores: [...player.scores] }]])) };
}
export function synchronizeRoundPlayerCounts<T extends { id: number; players: number | null }>(rounds: T[], scoresByRound: ScoresByRound): T[] {
  return rounds.map((round) => scoresByRound[round.id] === undefined ? round : { ...round, players: scoresByRound[round.id].length });
}