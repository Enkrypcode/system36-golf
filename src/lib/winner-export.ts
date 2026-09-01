import type { Award } from "./winner-engine.ts";

const csvCell = (value: string | number | undefined) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const isGrossAward = (award: Award) => award.code.startsWith("BG");

export function winnerCsv(awards: Award[], roundCount: number) {
  const headers = ["Award", "Player", "Flight", "Aggregate Gross", "Aggregate Nett", ...Array.from({ length: roundCount }, (_, index) => `Round ${index + 1}`), "Tournament HCP", "Countback Stage", "Countback Opponent"];
  const rows = awards.flatMap((award) => {
    if (award.winner) {
      const gross = isGrossAward(award);
      return [[award.code, award.winner.name, award.winner.flight ?? "", award.winner.aggregateGross, award.winner.aggregateNett, ...(gross ? award.winner.roundGross : award.winner.roundNett), award.winner.averageHcp36.toFixed(1), award.countbackStage ?? "", award.tiedOpponents?.map((player) => player.name).join(", ") ?? ""]];
    }
    if (award.tied) return [[award.code, "TIE — Manual Decision", "", "", "", ...Array(roundCount).fill(""), "", "Manual decision", award.tied.map((player) => player.name).join(", ")]];
    return [];
  });
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

export const exportFilename = (tournamentName: string, extension: "png" | "csv") => `${(tournamentName.trim() || "system-36-tournament").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase()}-winners.${extension}`;
