import { handicapScoreSummary, scoreSummary, type Player, type ScoringSystem, type TournamentFormat } from "./scoring.ts";

const completeScorecard = (player: Player) =>
  player.scores.length === 18 &&
  player.scores.every((score) => Number.isInteger(score) && (score as number) >= 1);

const csvCell = (value: string | number) => {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const filenameBase = (tournamentName: string) =>
  tournamentName
    .trim()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "") || "golf-tournament";

const scoreColumns = Array.from({ length: 18 }, (_, index) => `H${index + 1}`);

export function scoreEntryGrossCsv(players: Player[], pars: number[]) {
  const rows = players
    .filter(completeScorecard)
    .map((player) => [player.name, scoreSummary(player.scores, pars).gross] as const);

  return `\uFEFFName,Gross\r\n${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}

export function scoreEntryGrossFilename(tournamentName: string, roundNumber: number) {
  return `${filenameBase(tournamentName)}-Round-${roundNumber}-Gross.csv`;
}

/** Import-ready selected-round scorecards: only Name plus the raw H1–H18 values. */
export function scoreEntryScoresCsv(players: Player[]) {
  const rows = players.map((player) => [player.name, ...player.scores.map((score) => score ?? "")]);
  return `\uFEFFName,${scoreColumns.join(",")}\r\n${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}

export function scoreEntryScoresFilename(tournamentName: string, roundNumber: number) {
  return `${filenameBase(tournamentName)}-Round-${roundNumber}-Scores.csv`;
}

type ResultExportOptions = {
  scoringSystem: ScoringSystem;
  tournamentFormat: TournamentFormat;
};

/** Full selected-round result export. Summaries come only from the normal score engines. */
export function scoreEntryResultsCsv(players: Player[], pars: number[], options: ResultExportOptions) {
  const handicapMode = options.scoringSystem === "handicap";
  const includeFlight = handicapMode && options.tournamentFormat === "psgc";
  const header = [
    "No",
    "Name",
    ...(handicapMode ? ["Handicap"] : []),
    ...(includeFlight ? ["Flight"] : []),
    "Pairing",
    ...scoreColumns,
    "Front",
    "Back",
    "Gross",
    ...(handicapMode ? [] : ["HCP36"]),
    "Nett",
    ...(handicapMode ? [] : ["Point"]),
  ];
  const derivedColumnCount = handicapMode ? 4 : 6;
  const rows = players.map((player, index) => {
    const derived = !completeScorecard(player)
      ? Array<string>(derivedColumnCount).fill("")
      : handicapMode
        ? (() => {
            const summary = handicapScoreSummary(player.scores, pars, player.handicap ?? 0);
            return [summary.front, summary.back, summary.gross, summary.nett];
          })()
        : (() => {
            const summary = scoreSummary(player.scores, pars);
            return [summary.front, summary.back, summary.gross, summary.system36Handicap, summary.nett, summary.points];
          })();
    return [
      index + 1,
      player.name,
      ...(handicapMode ? [player.handicap ?? ""] : []),
      ...(includeFlight ? [player.awardCategory ?? ""] : []),
      player.pairing ?? "",
      ...player.scores.map((score) => score ?? ""),
      ...derived,
    ];
  });
  return `\uFEFF${header.join(",")}\r\n${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}

export function scoreEntryResultsFilename(tournamentName: string, roundNumber: number) {
  return `${filenameBase(tournamentName)}-Round-${roundNumber}-Results.csv`;
}