import { scoreSummary, type Player } from "./scoring.ts";

export type TournamentRoundScores = { id: number; pars: number[]; players: Player[] };
export type TournamentPlayer = { key: string; name: string; aggregateGross: number; aggregateNett: number; averageHcp36: number; roundGross: number[]; roundNett: number[]; finalScores: number[]; finalHcp36: number; flight?: string };
export type Award = { code: string; label: string; winner?: TournamentPlayer; tied?: TournamentPlayer[]; tiedOpponents?: TournamentPlayer[]; countbackStage?: "CB9" | "CB6" | "CB3" | "CB1" };
export type WinnerResult = { eligible: TournamentPlayer[]; notEligible: number; flights: Record<string, TournamentPlayer[]>; awards: Award[]; validationError?: string };

const keyFor = (player: Player) => player.id || player.name.trim().toLocaleLowerCase();
const complete = (player: Player) => player.scores.length === 18 && player.scores.every((score) => Number.isInteger(score) && (score as number) >= 1);
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const flightName = (index: number) => String.fromCharCode(65 + index);

export function countbackValues(player: TournamentPlayer, nett: boolean) {
  const scores = player.finalScores;
  const grossValues = [sum(scores.slice(9)), sum(scores.slice(12)), sum(scores.slice(15)), scores[17]];
  if (!nett) return grossValues;
  return grossValues.map((value, index) => value - (player.finalHcp36 * [9, 6, 3, 1][index]) / 18);
}

function selectAward(code: string, label: string, candidates: TournamentPlayer[], metric: "aggregateGross" | "aggregateNett"): Award {
  if (!candidates.length) return { code, label };
  const lowest = Math.min(...candidates.map((candidate) => candidate[metric]));
  const metricTies = candidates.filter((candidate) => candidate[metric] === lowest);
  const nett = metric === "aggregateNett";
  const sorted = [...metricTies].sort((a, b) => {
    const aCountback = countbackValues(a, nett); const bCountback = countbackValues(b, nett);
    for (let index = 0; index < aCountback.length; index++) if (aCountback[index] !== bCountback[index]) return aCountback[index] - bCountback[index];
    return 0;
  });
  const winner = sorted[0];
  const sameCountback = sorted.filter((candidate) => countbackValues(candidate, nett).every((value, index) => value === countbackValues(winner, nett)[index]));
  if (sameCountback.length > 1) return { code, label, tied: sameCountback };
  const countbackStage = metricTies.length > 1 ? (["CB9", "CB6", "CB3", "CB1"] as const)[countbackValues(winner, nett).findIndex((value, index) => value !== countbackValues(sorted[1], nett)[index])] : undefined;
  return { code, label, winner, countbackStage, tiedOpponents: metricTies.filter((candidate) => candidate.key !== winner.key) };
}

export function calculateTournamentWinners(rounds: TournamentRoundScores[], flightCount: number, flightLimits: number[] = []): WinnerResult {
  if (!rounds.length) return { eligible: [], notEligible: 0, flights: {}, awards: [] };
  const entries = new Map<string, Map<number, Player>>();
  for (const round of rounds) for (const player of round.players) { const key = keyFor(player); if (!key) continue; if (!entries.has(key)) entries.set(key, new Map()); entries.get(key)!.set(round.id, player); }
  const eligible: TournamentPlayer[] = [];
  for (const [key, roundPlayers] of entries) {
    if (rounds.some((round) => !roundPlayers.get(round.id) || !complete(roundPlayers.get(round.id)!))) continue;
    const summaries = rounds.map((round) => scoreSummary(roundPlayers.get(round.id)!.scores, round.pars));
    const finalPlayer = roundPlayers.get(rounds.at(-1)!.id)!;
    eligible.push({ key, name: finalPlayer.name, aggregateGross: sum(summaries.map((summary) => summary.gross)), aggregateNett: sum(summaries.map((summary) => summary.nett)), averageHcp36: sum(summaries.map((summary) => summary.system36Handicap)) / summaries.length, roundGross: summaries.map((summary) => summary.gross), roundNett: summaries.map((summary) => summary.nett), finalScores: finalPlayer.scores as number[], finalHcp36: summaries.at(-1)!.system36Handicap });
  }
  const flights: Record<string, TournamentPlayer[]> = {};
  const sortedByHcp = [...eligible].sort((a, b) => a.averageHcp36 - b.averageHcp36 || a.name.localeCompare(b.name));
  const count = Math.max(1, flightCount);
  if (flightLimits.length !== Math.max(0, count - 1) || flightLimits.some((limit, index) => index > 0 && limit <= flightLimits[index - 1])) return { eligible, notEligible: entries.size - eligible.length, flights, awards: [], validationError: "Flight handicap limits must increase." };
  for (const player of sortedByHcp) { const index = flightLimits.findIndex((limit) => player.averageHcp36 <= limit); const flight = flightName(index === -1 ? count - 1 : index); player.flight = flight; (flights[flight] ??= []).push(player); }
  // Flights are the single source of truth for both the displayed membership and
  // award pools.  Never mutate these arrays while handing out awards.
  const awardedPlayerKeys = new Set<string>();
  const available = (players: TournamentPlayer[]) => players.filter((player) => !awardedPlayerKeys.has(player.key));
  const addAward = (code: string, label: string, candidates: TournamentPlayer[], metric: "aggregateGross" | "aggregateNett") => {
    const award = selectAward(code, label, candidates, metric);
    awards.push(award);
    if (award.winner) awardedPlayerKeys.add(award.winner.key);
  };
  const awards: Award[] = [];
  addAward("BGO", "Best Gross Overall", available(eligible), "aggregateGross");
  addAward("BNO", "Best Nett Overall", available(eligible), "aggregateNett");
  for (let index = 0; index < count; index++) {
    const flight = flightName(index);
    const members = flights[flight] ?? [];
    addAward(`BG${flight}`, `Best Gross ${flight}`, available(members), "aggregateGross");
    addAward(`BN 1 ${flight}`, `Best Nett 1 ${flight}`, available(members), "aggregateNett");
    addAward(`BN 2 ${flight}`, `Best Nett 2 ${flight}`, available(members), "aggregateNett");
  }
  return { eligible, notEligible: entries.size - eligible.length, flights, awards };
}
