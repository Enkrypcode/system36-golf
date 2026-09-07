import type { SplitNineAwardPosition, SplitNineResult } from "./winner-engine.ts";

export type SplitNineSide = "front" | "back";
export type SplitNineView = "app" | "export";
export type SplitNineLeaderboardRow = {
  player: SplitNineResult["leaderboard"][number];
  rank: number;
  award?: SplitNineAwardPosition;
  notes: string[];
};

export function splitNineLeaderboardRows(result: SplitNineResult | undefined, side: SplitNineSide, view: SplitNineView): SplitNineLeaderboardRow[] {
  if (!result) return [];
  const metric = side === "front" ? "frontNett" : "backNett";
  const awards = side === "front" ? result.firstAwards : result.secondAwards;
  const countbacks = side === "front" ? result.firstAwardCountbacks : result.secondAwardCountbacks;
  const sorted = [...result.leaderboard].sort((left, right) => left[metric] - right[metric] || left.name.localeCompare(right.name));
  return sorted.map((player, index) => {
    const notes: string[] = [];
    const overallAward = result.overallAwards.find((award) => award.winner?.key === player.key);
    if (view === "app" && overallAward) notes.push(`Already won ${overallAward.code}`);
    if (view === "app" && countbacks[player.key]) notes.push(`Won on ${countbacks[player.key]}`);
    if (view === "app" && side === "back" && result.firstAwards[player.key]) notes.push("Already won 1st Nine");
    if (view === "app" && side === "front" && result.secondAwards[player.key] === "Champion") notes.push("Won 2nd Nine");
    return { player, rank: index === 0 || player[metric] !== sorted[index - 1][metric] ? index + 1 : sorted.findIndex((item) => item[metric] === player[metric]) + 1, ...(awards[player.key] ? { award: awards[player.key] } : {}), notes };
  });
}
