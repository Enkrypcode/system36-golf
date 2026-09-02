import { scoreSummary, type Player } from "./scoring.ts";

const completeScorecard = (player: Player) =>
  player.scores.length === 18 &&
  player.scores.every((score) => Number.isInteger(score) && (score as number) >= 1);

const csvCell = (value: string | number) => {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export function scoreEntryGrossCsv(players: Player[], pars: number[]) {
  const rows = players
    .filter(completeScorecard)
    .map((player) => [player.name, scoreSummary(player.scores, pars).gross] as const);

  return `\uFEFFName,Gross\r\n${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}

export function scoreEntryGrossFilename(tournamentName: string, roundNumber: number) {
  const base = tournamentName
    .trim()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "");

  return `${base || "golf-tournament"}-Round-${roundNumber}-Gross.csv`;
}