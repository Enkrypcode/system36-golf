import type { Player } from "./scoring.ts";

export type PairingDraft = { codes: string[]; assignments: Record<string, string> };
export const normalizePairingCode = (code: string | undefined) => (code ?? "").trim().toLocaleUpperCase();
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
export const sortPairingCodes = (codes: string[]) => [...new Set(codes)].sort(collator.compare);
export const pairingSearchText = (text: string) => text.trim().replace(/\s+/g, " ").toLocaleLowerCase();

export function createPairingDraft(players: Player[]): PairingDraft {
  const assignments = Object.fromEntries(players.filter((player) => player.name.trim()).map((player) => [player.id, normalizePairingCode(player.pairing)]));
  return { codes: sortPairingCodes(Object.values(assignments).filter(Boolean)), assignments };
}

export function addPairing(draft: PairingDraft, rawCode: string): { draft: PairingDraft; error?: string } {
  const code = normalizePairingCode(rawCode);
  if (!code) return { draft, error: "Enter a pairing code." };
  if (draft.codes.includes(code)) return { draft, error: `Pairing ${code} already exists.` };
  return { draft: { ...draft, codes: sortPairingCodes([...draft.codes, code]) } };
}

export function assignPairing(draft: PairingDraft, playerId: string, code: string): PairingDraft {
  if (!Object.hasOwn(draft.assignments, playerId) || (code && !draft.codes.includes(code))) return draft;
  return { ...draft, assignments: { ...draft.assignments, [playerId]: code } };
}

export function applyPairingDraft(players: Player[], draft: PairingDraft): Player[] {
  return players.map((player) => {
    if (!Object.hasOwn(draft.assignments, player.id)) return player;
    const pairing = draft.assignments[player.id];
    return pairing === (player.pairing ?? "") ? player : { ...player, pairing };
  });
}
