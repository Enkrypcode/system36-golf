export type Player = {
  id: string;
  name: string;
  /** Playing-group label for this round only; never used for tournament identity. */
  pairing?: string;
  /** Manually entered tournament/playing handicap, used only in Handicap mode. */
  handicap?: number;
  /** PSGC award category. It is independent of pairing and Handicap. */
  awardCategory?: AwardCategory;
  /** Optional blind-hole targets; used only by the Jackpot side competition. */
  jackpotTargetFront?: number;
  jackpotTargetBack?: number;
  scores: Array<number | null>;
};

export type ScoringSystem = "system36" | "handicap";
export type TournamentFormat = "standard" | "psgc" | "split9";
export type NettTieBreakMethod = "lower-handicap" | "countback";
/** Controls which Handicap awards are assigned; it never changes score calculations. */
export type AwardMode = "gross-nett" | "nett-only";
export type AwardCategory = "A" | "B" | "C" | "SS";

export const frontPar = (pars: number[]) => pars.slice(0, 9).reduce((total: number, par: number) => total + par, 0);
export const backPar = (pars: number[]) => pars.slice(9, 18).reduce((total: number, par: number) => total + par, 0);
export const totalPar = (pars: number[]) => frontPar(pars) + backPar(pars);

export function pointForScore(score: number | null, par: number) {
  if (score === null) return 0;
  const difference = score - par;
  if (difference <= -2) return 4;
  if (difference === -1) return 3;
  if (difference === 0) return 2;
  if (difference === 1) return 1;
  return 0;
}

/** Returns the residual adjustment that Gross minus HCP 36 does not already represent. */
export function nettAdjustmentForScore(score: number | null, par: number) {
  if (score === null) return 0;
  const difference = score - par;
  if (difference === -1) return -1;
  if (difference <= -2) return -2;
  return 0;
}

export function scoreSummary(scores: Array<number | null>, pars: number[]) {
  const sum = (slice: Array<number | null>) => slice.reduce((total: number, value: number | null) => total + (value ?? 0), 0);
  const front = sum(scores.slice(0, 9));
  const back = sum(scores.slice(9, 18));
  const gross = front + back;
  const points = scores.reduce((total: number, score: number | null, index: number) => total + pointForScore(score, pars[index]), 0);
  const system36Handicap = 36 - points;
  const nettAdjustment = scores.reduce((total: number, score: number | null, index: number) => total + nettAdjustmentForScore(score, pars[index]), 0);
  return { front, back, gross, points, system36Handicap, nettAdjustment, nett: gross - system36Handicap + nettAdjustment };
}

/** Summary for manual tournament-handicap scoring; no System 36 points are used. */
export function handicapScoreSummary(scores: Array<number | null>, _pars: number[], handicap: number) {
  const sum = (slice: Array<number | null>) => slice.reduce<number>((total, value) => total + (value ?? 0), 0);
  const front = sum(scores.slice(0, 9));
  const back = sum(scores.slice(9, 18));
  const gross = front + back;
  return { front, back, gross, handicap, nett: gross - handicap };
}
