import type { SplitNineAwardPosition, SplitNineResult } from "./winner-engine.ts";

export type SplitNineSide = "front" | "back";
export type SplitNineView = "app" | "export";
export type SplitNineLeaderboardRow = {
  player: SplitNineResult["leaderboard"][number];
  rank: number;
  award?: SplitNineAwardPosition;
  note?: "Already won 1st Nine" | "Won 2nd Nine";
};

export function splitNineLeaderboardRows(result: SplitNineResult | undefined, side: SplitNineSide, view: SplitNineView): SplitNineLeaderboardRow[] {
  if (!result) return [];
  const metric = side === "front" ? "frontNett" : "backNett";
  const awards = side === "front" ? result.firstAwards : result.secondAwards;
  const sorted = [...result.leaderboard].sort((left, right) => left[metric] - right[metric] || left.name.localeCompare(right.name));
  return sorted.map((player, index) => ({
    player,
    rank: index === 0 || player[metric] !== sorted[index - 1][metric] ? index + 1 : sorted.findIndex((item) => item[metric] === player[metric]) + 1,
    ...(awards[player.key] ? { award: awards[player.key] } : {}),
    ...(view === "app" && side === "back" && result.firstAwards[player.key] === "Champion" ? { note: "Already won 1st Nine" as const } : {}),
    ...(view === "app" && side === "front" && result.secondAwards[player.key] === "Champion" ? { note: "Won 2nd Nine" as const } : {}),
  }));
}
