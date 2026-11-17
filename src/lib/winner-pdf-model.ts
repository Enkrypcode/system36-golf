import type { ScoringSystem, TournamentFormat } from "./scoring.ts";
import type { Award, WinnerResult } from "./winner-engine.ts";
import type { JackpotResult } from "./jackpot.ts";
import { splitNineLeaderboardRows } from "./split-nine-presentation.ts";

export type PdfSection = { title: string; columns: string[]; rows: string[][]; keepTogether?: boolean };
export type WinnerPdfInput = {
  name: string;
  rounds: string[];
  scoringSystem: ScoringSystem;
  tournamentFormat: TournamentFormat;
  awardSections: Array<[string, string[]]>;
  result: WinnerResult;
  jackpot?: { label: string; detail: string; champions: [string, string]; front: JackpotResult[]; back: JackpotResult[] };
  novelties: string[];
};
export type WinnerPdfPresentation = { name: string; metadata: string[]; sections: PdfSection[] };

export function winnerPdfFilename(name: string) {
  const base = name.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "Golf-Tournament";
  return `${base}-Winners.pdf`;
}

function awardRow(award: Award): string[] {
  const metric = award.code.startsWith("BG") ? "Gross" : "Nett";
  const winner = award.winner;
  const stage = award.countbackStage === "HCP" ? "Lower HCP36" : award.countbackStage === "HANDICAP" ? "Lower Handicap" : award.countbackStage;
  const opponents = award.tiedOpponents?.map((player) => player.name).join(", ");
  return [
    award.code,
    winner?.name ?? `Tied - Manual Decision\n${award.tied?.map((player) => player.name).join(", ")}`,
    winner ? `${metric} ${metric === "Gross" ? winner.aggregateGross : winner.aggregateNett}\n${(metric === "Gross" ? winner.roundGross : winner.roundNett).map((value, i) => `R${i + 1} ${value}`).join(" + ")}` : "",
    stage ? `Tie-break: ${stage}${opponents ? "\nvs " + opponents : ""}` : "",
  ];
}

export function winnerPdfPresentation(input: WinnerPdfInput): WinnerPdfPresentation {
  const sections: PdfSection[] = [];
  const addAwards = (title: string, awards: Award[]) => {
    const populated = awards.filter((award) => award.winner || award.tied?.length);
    if (populated.length) sections.push({ title: title || "Award Winners", columns: ["Award", "Player", "Result", "Tie-break"], rows: populated.map(awardRow), keepTogether: true });
  };
  if (input.result.splitNine) {
    addAwards("Overall", input.result.splitNine.overallAwards);
    for (const side of ["front", "back"] as const) {
      const rows = splitNineLeaderboardRows(input.result.splitNine, side, "export");
      if (rows.length) sections.push({
        title: side === "front" ? "1st Nine Leaderboard" : "2nd Nine Leaderboard",
        keepTogether: rows.length <= 12,
        columns: ["Rank", "Player Name", "Gross", "½ HCP", "Nett", "Award"],
        rows: rows.map(({ player, rank, award }) => [String(rank), player.name, String(side === "front" ? player.frontGross : player.backGross), String(player.halfHandicap), String(side === "front" ? player.frontNett : player.backNett), award ?? ""]),
      });
    }
  } else {
    for (const [title, codes] of input.awardSections) {
      addAwards(title, input.result.awards.filter((award) => codes.includes(award.code)));
    }
  }
  if (input.jackpot && (input.jackpot.front.length || input.jackpot.back.length)) {
    const jackpot = input.jackpot;
    sections.push({
      title: `Jackpot Winners / Champions - ${jackpot.label}`,
      columns: ["Competition", "Winner"],
      rows: [["Target 1–9", jackpot.champions[0]], ["Target 10–18", jackpot.champions[1]], ["Blind Hole setup", jackpot.detail]],
      keepTogether: true,
    });
    for (const [title, results] of [["Target 1–9", jackpot.front], ["Target 10–18", jackpot.back]] as const) {
      if (!results.length) continue;
      sections.push({
        title, columns: ["No", "Player Name", "Target", "Final", "Delta", "Result"],
        rows: results.map((entry, index) => [
          String(entry.rank ?? index + 1), entry.name || "Unnamed player", String(entry.target ?? "—"), String(entry.final ?? "—"),
          entry.result === "DIS" ? "DIS" : String(entry.delta ?? "—"),
          entry.result === "DIS" ? "DIS" : entry.excluded ? "Already won First Nine" : entry.result === "ELIGIBLE" ? entry.rank === 1 ? "Leading" : "Eligible" : "Incomplete",
        ]),
      });
    }
  }
  if (input.novelties.length) sections.push({ title: "Novelties", columns: ["Award"], rows: input.novelties.map((text) => [text]), keepTogether: true });
  const formats: Record<TournamentFormat, string> = { standard: "Standard", psgc: "PSGC", split9: "Split 9-Hole", whs: "WHS" };
  return { name: input.name || "Golf Tournament", metadata: [`${input.scoringSystem === "system36" ? "System 36" : "Handicap"} | ${formats[input.tournamentFormat]}`, ...input.rounds], sections };
}
