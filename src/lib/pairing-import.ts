import { readSheet } from "read-excel-file/browser";
import type { Player } from "./scoring.ts";
import { normalizeImportedName, parseCsv } from "./score-import.ts";
import { normalizePairingCode, sortPairingCodes, type PairingDraft } from "./pairing-builder.ts";

export type PairingImportIssue = { rowNumber: number; name: string; reason: string };
export type PairingImportEntry = { rowNumber: number; playerId: string; name: string; previous: string; pairing: string };
export type PairingImportPreview = {
  rowsFound: number;
  entries: PairingImportEntry[];
  unmatched: PairingImportIssue[];
  invalid: PairingImportIssue[];
  replacementCount: number;
  headerError?: string;
};

export function previewPairingImport(rows: unknown[][], players: Player[]): PairingImportPreview {
  const [headers = [], ...data] = rows;
  const normalizedHeaders = headers.map((value) => normalizeImportedName(value).replace(/[\s._-]/g, ""));
  const nameColumn = normalizedHeaders.findIndex((value) => ["name", "playername", "nama"].includes(value));
  const pairingColumn = normalizedHeaders.findIndex((value) => ["pairing", "group", "pair"].includes(value));
  const preview: PairingImportPreview = { rowsFound: 0, entries: [], unmatched: [], invalid: [], replacementCount: 0 };
  const nonEmpty = data.map((cells, index) => ({ cells, rowNumber: index + 2 })).filter(({ cells }) => cells.some((cell) => String(cell ?? "").trim()));
  preview.rowsFound = nonEmpty.length;
  if (nameColumn < 0 || pairingColumn < 0) {
    preview.headerError = "Include Name and Pairing columns (Player Name / Nama and Group / Pair are also accepted).";
    return preview;
  }
  const names = new Map<string, Player[]>();
  for (const player of players) {
    const key = normalizeImportedName(player.name);
    if (key) names.set(key, [...(names.get(key) ?? []), player]);
  }
  const counts = new Map<string, number>();
  for (const { cells } of nonEmpty) {
    const key = normalizeImportedName(cells[nameColumn]);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const { cells, rowNumber } of nonEmpty) {
    const name = String(cells[nameColumn] ?? "").trim().replace(/\s+/g, " ");
    const key = normalizeImportedName(name);
    const issue = (reason: string) => ({ rowNumber, name: name || "(blank name)", reason });
    if (!name) { preview.invalid.push(issue("Missing player name")); continue; }
    if (counts.get(key)! > 1) { preview.invalid.push(issue("Duplicate/conflicting player. Keep one final pairing per player.")); continue; }
    if (cells[pairingColumn] !== null && cells[pairingColumn] !== undefined && !["string", "number"].includes(typeof cells[pairingColumn])) {
      preview.invalid.push(issue("Pairing must be text or a number")); continue;
    }
    const matches = names.get(key) ?? [];
    if (matches.length > 1) { preview.invalid.push(issue("Multiple roster players have this name")); continue; }
    if (!matches.length) { preview.unmatched.push(issue("No matching player in the current round roster")); continue; }
    const player = matches[0];
    const pairing = normalizePairingCode(String(cells[pairingColumn] ?? ""));
    const previous = normalizePairingCode(player.pairing);
    if (previous && previous !== pairing) preview.replacementCount += 1;
    preview.entries.push({ rowNumber, playerId: player.id, name: player.name, previous, pairing });
  }
  return preview;
}

export function applyPairingImport(draft: PairingDraft, entries: PairingImportEntry[]): PairingDraft {
  const assignments = { ...draft.assignments };
  for (const entry of entries) {
    if (Object.hasOwn(assignments, entry.playerId)) assignments[entry.playerId] = entry.pairing;
  }
  return { assignments, codes: sortPairingCodes([...draft.codes, ...Object.values(assignments).filter(Boolean)]) };
}

export async function previewPairingImportFile(file: File, players: Player[]): Promise<PairingImportPreview> {
  const extension = file.name.split(".").pop()?.toLocaleLowerCase();
  if (extension !== "csv" && extension !== "xlsx") throw new Error("Choose a .csv or .xlsx pairing file.");
  const rows = extension === "csv" ? parseCsv(await file.text()) : await readSheet(file);
  return previewPairingImport(rows as unknown[][], players);
}
