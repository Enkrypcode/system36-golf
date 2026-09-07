import { handicapScoreSummary, scoreSummary, type NettTieBreakMethod, type Player, type ScoringSystem, type TournamentFormat } from "./scoring.ts";

export type TournamentRoundScores = { id: number; pars: number[]; players: Player[] };
export type TournamentPlayer = {
  key: string; name: string; aggregateGross: number; aggregateNett: number; averageHcp36: number;
  handicap?: number; awardCategory?: "A" | "B" | "C" | "SS";
  roundGross: number[]; roundNett: number[]; finalScores: number[]; finalHcp36: number; finalHandicap?: number; flight?: string;
};
export type TieBreakStage = "HCP" | "HANDICAP" | "CB9" | "CB6" | "CB3" | "CB1";
export type Award = { code: string; label: string; winner?: TournamentPlayer; tied?: TournamentPlayer[]; tiedOpponents?: TournamentPlayer[]; countbackStage?: TieBreakStage };
export type SplitNinePlayer = { key: string; name: string; frontGross: number; backGross: number; halfHandicap: number; frontNett: number; backNett: number; frontRank: number; backRank: number };
export type SplitNineAwardPosition = "Champion" | "Runner Up 1" | "Runner Up 2";
export type SplitNineCountbackStage = "CB6" | "CB3" | "CB1";
export type SplitNineResult = { leaderboard: SplitNinePlayer[]; overallAwards: Award[]; firstAwards: Record<string, SplitNineAwardPosition>; secondAwards: Record<string, SplitNineAwardPosition>; firstAwardCountbacks: Record<string, SplitNineCountbackStage>; secondAwardCountbacks: Record<string, SplitNineCountbackStage>; firstChampion?: SplitNinePlayer; firstTied?: SplitNinePlayer[]; secondChampion?: SplitNinePlayer; secondTied?: SplitNinePlayer[] };
export type WinnerResult = { eligible: TournamentPlayer[]; notEligible: number; flights: Record<string, TournamentPlayer[]>; awards: Award[]; splitNine?: SplitNineResult; validationError?: string };
export type WinnerOptions = { scoringSystem?: ScoringSystem; tournamentFormat?: TournamentFormat; nettTieBreakMethod?: NettTieBreakMethod };

const keyFor = (player: Player) => player.id || player.name.trim().toLocaleLowerCase();
const complete = (player: Player) => player.scores.length === 18 && player.scores.every((score) => Number.isInteger(score) && (score as number) >= 1);
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const flightName = (index: number) => String.fromCharCode(65 + index);
const psgcCategories = ["A", "B", "C", "SS"] as const;

export function countbackValues(player: TournamentPlayer, nett: boolean) {
  const scores = player.finalScores;
  const grossValues = [sum(scores.slice(9)), sum(scores.slice(12)), sum(scores.slice(15)), scores[17]];
  if (!nett) return grossValues;
  const handicap = player.finalHandicap ?? player.finalHcp36;
  return grossValues.map((value, index) => value - (handicap * [9, 6, 3, 1][index]) / 18);
}

function selectAward(code: string, label: string, candidates: TournamentPlayer[], metric: "aggregateGross" | "aggregateNett", scoringSystem: ScoringSystem, nettTieBreakMethod: NettTieBreakMethod): Award {
  if (!candidates.length) return { code, label };
  const lowest = Math.min(...candidates.map((candidate) => candidate[metric]));
  const metricTies = candidates.filter((candidate) => candidate[metric] === lowest);
  const nett = metric === "aggregateNett";
  const handicapForTie = (candidate: TournamentPlayer) => scoringSystem === "handicap" ? candidate.handicap ?? 0 : candidate.averageHcp36;
  const tieStage: TieBreakStage = scoringSystem === "handicap" ? "HANDICAP" : "HCP";
  const usesHandicapBeforeCountback = nett && nettTieBreakMethod === "lower-handicap";
  const hcpTies = usesHandicapBeforeCountback ? metricTies.filter((candidate) => handicapForTie(candidate) === Math.min(...metricTies.map(handicapForTie))) : metricTies;
  if (usesHandicapBeforeCountback && hcpTies.length === 1) return { code, label, winner: hcpTies[0], countbackStage: tieStage, tiedOpponents: metricTies.filter((candidate) => candidate.key !== hcpTies[0].key) };
  const sorted = [...hcpTies].sort((a, b) => {
    const aCountback = countbackValues(a, nett); const bCountback = countbackValues(b, nett);
    for (let index = 0; index < aCountback.length; index++) if (aCountback[index] !== bCountback[index]) return aCountback[index] - bCountback[index];
    return 0;
  });
  const winner = sorted[0];
  const sameCountback = sorted.filter((candidate) => countbackValues(candidate, nett).every((value, index) => value === countbackValues(winner, nett)[index]));
  if (sameCountback.length > 1) return { code, label, tied: sameCountback };
  const countbackStage = hcpTies.length > 1 ? (["CB9", "CB6", "CB3", "CB1"] as const)[countbackValues(winner, nett).findIndex((value, index) => value !== countbackValues(sorted[1], nett)[index])] : undefined;
  return { code, label, winner, countbackStage, tiedOpponents: hcpTies.filter((candidate) => candidate.key !== winner.key) };
}

function rankedNine(players: SplitNinePlayer[], metric: "frontNett" | "backNett", rank: "frontRank" | "backRank") {
  const sorted = [...players].sort((left, right) => left[metric] - right[metric] || left.name.localeCompare(right.name));
  let previous: number | undefined;
  let position = 0;
  return sorted.map((player, index) => {
    if (player[metric] !== previous) position = index + 1;
    previous = player[metric];
    return { ...player, [rank]: position };
  });
}

type SplitNineSelection = { winner?: SplitNinePlayer; tied?: SplitNinePlayer[]; countbackStage?: SplitNineCountbackStage };
type SplitNineAwardAssignments = { awards: Record<string, SplitNineAwardPosition>; countbacks: Record<string, SplitNineCountbackStage>; champion?: SplitNinePlayer; tied?: SplitNinePlayer[] };

function splitNineCountbackValues(player: SplitNinePlayer, side: "front" | "back", scoresByKey: Map<string, number[]>) {
  const scores = scoresByKey.get(player.key) ?? [];
  return side === "front"
    ? [sum(scores.slice(3, 9)), sum(scores.slice(6, 9)), scores[8] ?? 0]
    : [sum(scores.slice(12, 18)), sum(scores.slice(15, 18)), scores[17] ?? 0];
}

function selectSplitNineAward(candidates: SplitNinePlayer[], metric: "frontNett" | "backNett", side: "front" | "back", scoresByKey: Map<string, number[]>): SplitNineSelection {
  if (!candidates.length) return {};
  const lowest = Math.min(...candidates.map((player) => player[metric]));
  const nettTies = candidates.filter((player) => player[metric] === lowest);
  if (nettTies.length === 1) return { winner: nettTies[0] };
  const sorted = [...nettTies].sort((left, right) => {
    const leftValues = splitNineCountbackValues(left, side, scoresByKey);
    const rightValues = splitNineCountbackValues(right, side, scoresByKey);
    for (let index = 0; index < leftValues.length; index++) if (leftValues[index] !== rightValues[index]) return leftValues[index] - rightValues[index];
    return 0;
  });
  const winner = sorted[0];
  const winnerValues = splitNineCountbackValues(winner, side, scoresByKey);
  const unresolved = sorted.filter((player) => splitNineCountbackValues(player, side, scoresByKey).every((value, index) => value === winnerValues[index]));
  if (unresolved.length > 1) return { tied: unresolved };
  const runnerUpValues = splitNineCountbackValues(sorted[1], side, scoresByKey);
  const decidingIndex = winnerValues.findIndex((value, index) => value !== runnerUpValues[index]);
  return { winner, countbackStage: (["CB6", "CB3", "CB1"] as const)[decidingIndex] };
}

function assignSplitNineAwards(players: SplitNinePlayer[], metric: "frontNett" | "backNett", side: "front" | "back", scoresByKey: Map<string, number[]>, excludedKeys: ReadonlySet<string> = new Set()): SplitNineAwardAssignments {
  const remaining = players.filter((player) => !excludedKeys.has(player.key));
  const first = selectSplitNineAward(remaining, metric, side, scoresByKey);
  if (!first.winner) return { awards: {}, countbacks: {}, tied: first.tied };
  const positions: SplitNineAwardPosition[] = ["Champion", "Runner Up 1", "Runner Up 2"];
  const awards: Record<string, SplitNineAwardPosition> = {};
  const countbacks: Record<string, SplitNineCountbackStage> = {};
  let candidates = remaining;
  for (const position of positions) {
    const selection = selectSplitNineAward(candidates, metric, side, scoresByKey);
    if (!selection.winner) break;
    awards[selection.winner.key] = position;
    if (selection.countbackStage) countbacks[selection.winner.key] = selection.countbackStage;
    candidates = candidates.filter((player) => player.key !== selection.winner!.key);
  }
  return { awards, countbacks, champion: first.winner };
}

function calculateSplitNine(players: TournamentPlayer[], nettTieBreakMethod: NettTieBreakMethod): SplitNineResult {
  const scoresByKey = new Map(players.map((player) => [player.key, player.finalScores]));
  const overallAwards: Award[] = [];
  const bgo = selectAward("BGO", "Best Gross Overall", players, "aggregateGross", "handicap", nettTieBreakMethod);
  overallAwards.push(bgo);
  const overallWinnerKeys = new Set<string>();
  if (bgo.winner) overallWinnerKeys.add(bgo.winner.key);
  const bno = selectAward("BNO", "Best Nett Overall", players.filter((player) => !overallWinnerKeys.has(player.key)), "aggregateNett", "handicap", nettTieBreakMethod);
  overallAwards.push(bno);
  if (bno.winner) overallWinnerKeys.add(bno.winner.key);

  const source = players.map((player) => {
    const halfHandicap = (player.handicap ?? 0) / 2;
    const frontGross = sum(player.finalScores.slice(0, 9));
    const backGross = sum(player.finalScores.slice(9, 18));
    return { key: player.key, name: player.name, frontGross, backGross, halfHandicap, frontNett: frontGross - halfHandicap, backNett: backGross - halfHandicap, frontRank: 0, backRank: 0 };
  });
  const front = rankedNine(source, "frontNett", "frontRank");
  const first = assignSplitNineAwards(front, "frontNett", "front", scoresByKey, overallWinnerKeys);
  const firstChampionKey = first.champion?.key;
  const back = rankedNine(source, "backNett", "backRank");
  const second = assignSplitNineAwards(back, "backNett", "back", scoresByKey, new Set([...overallWinnerKeys, ...(firstChampionKey ? [firstChampionKey] : [])]));
  const byKey = new Map(back.map((player) => [player.key, player]));
  return { leaderboard: front.map((player) => ({ ...player, backRank: byKey.get(player.key)?.backRank ?? 0 })), overallAwards, firstAwards: first.awards, secondAwards: second.awards, firstAwardCountbacks: first.countbacks, secondAwardCountbacks: second.countbacks, ...(first.champion ? { firstChampion: first.champion } : first.tied?.length ? { firstTied: first.tied } : {}), ...(second.champion ? { secondChampion: second.champion } : second.tied?.length ? { secondTied: second.tied } : {}) };
}
export function calculateTournamentWinners(rounds: TournamentRoundScores[], flightCount: number, flightLimits: number[] = [], options: WinnerOptions = {}): WinnerResult {
  const scoringSystem = options.scoringSystem ?? "system36";
  const tournamentFormat = scoringSystem === "handicap" && (options.tournamentFormat === "psgc" || options.tournamentFormat === "split9") ? options.tournamentFormat : "standard";
  const nettTieBreakMethod = options.nettTieBreakMethod ?? (scoringSystem === "system36" || tournamentFormat === "psgc" ? "lower-handicap" : "countback");
  if (!rounds.length) return { eligible: [], notEligible: 0, flights: {}, awards: [] };
  const entries = new Map<string, Map<number, Player>>();
  for (const round of rounds) for (const player of round.players) {
    const key = keyFor(player); if (!key) continue;
    if (!entries.has(key)) entries.set(key, new Map()); entries.get(key)!.set(round.id, player);
  }
  const eligible: TournamentPlayer[] = [];
  for (const [key, roundPlayers] of entries) {
    if (rounds.some((round) => !roundPlayers.get(round.id) || !complete(roundPlayers.get(round.id)!))) continue;
    const finalPlayer = roundPlayers.get(rounds.at(-1)!.id)!;
    const handicap = finalPlayer.handicap ?? 0;
    if (scoringSystem === "handicap") {
      const summaries = rounds.map((round) => handicapScoreSummary(roundPlayers.get(round.id)!.scores, round.pars, handicap));
      eligible.push({ key, name: finalPlayer.name, aggregateGross: sum(summaries.map((summary) => summary.gross)), aggregateNett: sum(summaries.map((summary) => summary.nett)), averageHcp36: 0, handicap, awardCategory: finalPlayer.awardCategory, roundGross: summaries.map((summary) => summary.gross), roundNett: summaries.map((summary) => summary.nett), finalScores: finalPlayer.scores as number[], finalHcp36: 0, finalHandicap: handicap });
    } else {
      const summaries = rounds.map((round) => scoreSummary(roundPlayers.get(round.id)!.scores, round.pars));
      eligible.push({ key, name: finalPlayer.name, aggregateGross: sum(summaries.map((summary) => summary.gross)), aggregateNett: sum(summaries.map((summary) => summary.nett)), averageHcp36: sum(summaries.map((summary) => summary.system36Handicap)) / summaries.length, roundGross: summaries.map((summary) => summary.gross), roundNett: summaries.map((summary) => summary.nett), finalScores: finalPlayer.scores as number[], finalHcp36: summaries.at(-1)!.system36Handicap });
    }
  }
  if (tournamentFormat === "split9") return { eligible, notEligible: entries.size - eligible.length, flights: {}, awards: [], splitNine: calculateSplitNine(eligible, nettTieBreakMethod) };
  const flights: Record<string, TournamentPlayer[]> = {};
  if (tournamentFormat === "psgc") {
    for (const category of psgcCategories) flights[category] = eligible.filter((player) => player.awardCategory === category).map((player) => ({ ...player, flight: category }));
  } else {
    const flightValue = (player: TournamentPlayer) => scoringSystem === "handicap" ? player.handicap ?? 0 : player.averageHcp36;
    const count = Math.max(1, flightCount);
    if (flightLimits.length !== Math.max(0, count - 1) || flightLimits.some((limit, index) => index > 0 && limit <= flightLimits[index - 1])) return { eligible, notEligible: entries.size - eligible.length, flights, awards: [], validationError: "Flight handicap limits must increase." };
    const sortedByHcp = [...eligible].sort((a, b) => flightValue(a) - flightValue(b) || a.name.localeCompare(b.name));
    for (const player of sortedByHcp) {
      const value = flightValue(player); const index = flightLimits.findIndex((limit) => value <= limit); const flight = flightName(index === -1 ? count - 1 : index);
      player.flight = flight; (flights[flight] ??= []).push(player);
    }
  }
  const awardedPlayerKeys = new Set<string>();
  const available = (players: TournamentPlayer[]) => players.filter((player) => !awardedPlayerKeys.has(player.key));
  const awards: Award[] = [];
  const addAward = (code: string, label: string, candidates: TournamentPlayer[], metric: "aggregateGross" | "aggregateNett") => {
    const award = selectAward(code, label, candidates, metric, scoringSystem, nettTieBreakMethod); awards.push(award); if (award.winner) awardedPlayerKeys.add(award.winner.key);
  };
  addAward("BGO", "Best Gross Overall", available(eligible), "aggregateGross");
  addAward("BNO", "Best Nett Overall", available(eligible), "aggregateNett");
  if (tournamentFormat === "psgc") {
    for (const flight of ["A", "B", "C"] as const) {
      const members = flights[flight] ?? [];
      addAward(`BG${flight}`, `Best Gross ${flight}`, available(members), "aggregateGross");
      addAward(`BN 1 ${flight}`, `Best Nett 1 ${flight}`, available(members), "aggregateNett");
      addAward(`BN 2 ${flight}`, `Best Nett 2 ${flight}`, available(members), "aggregateNett");
    }
    const superSenior = flights.SS ?? [];
    addAward("BN 1 SS", "Best Nett 1 Super Senior", available(superSenior), "aggregateNett");
    addAward("BN 2 SS", "Best Nett 2 Super Senior", available(superSenior), "aggregateNett");
    addAward("BN 3 SS", "Best Nett 3 Super Senior", available(superSenior), "aggregateNett");
  } else {
    for (let index = 0; index < Math.max(1, flightCount); index++) {
      const flight = flightName(index); const members = flights[flight] ?? [];
      addAward(`BG${flight}`, `Best Gross ${flight}`, available(members), "aggregateGross");
      addAward(`BN 1 ${flight}`, `Best Nett 1 ${flight}`, available(members), "aggregateNett");
      addAward(`BN 2 ${flight}`, `Best Nett 2 ${flight}`, available(members), "aggregateNett");
    }
  }
  return { eligible, notEligible: entries.size - eligible.length, flights, awards };
}
