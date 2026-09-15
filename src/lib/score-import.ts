import { readSheet } from "read-excel-file/browser";
import type { Player } from "@/lib/scoring";

export type ScoreImportMode = "scores-only" | "players-scores";
export type ScoreImportIssue = { rowNumber: number; name: string; reason: string };
export type ScoreImportEntry = { playerId?: string; name: string; scores: number[]; newPlayer: boolean };
export type ScoreImportPreview = {
  rowsFound: number;
  entries: ScoreImportEntry[];
  matchedCount: number;
  newPlayerCount: number;
  unmatched: ScoreImportIssue[];
  invalid: ScoreImportIssue[];
  replacementCount: number;
  headerError?: string;
};

type ApplyScoreImportOptions = { createPlayerId?: (entry: ScoreImportEntry, index: number) => string };

const normalizeText = (value: unknown) => String(value ?? "").trim().replace(/\s+/g, " ");
export const normalizeImportedName = (value: unknown) => normalizeText(value).toLocaleLowerCase();

function headerIndex(headers: unknown[]) {
  const normalized = headers.map((header) => normalizeText(header).toLocaleLowerCase().replace(/[\s._-]/g, ""));
  const name = normalized.findIndex((header) => header === "name" || header === "playername");
  const holes = Array.from({ length: 18 }, (_, index) => {
    const hole = index + 1;
    return normalized.findIndex((header) => header === `h${hole}` || header === `hole${hole}` || header === String(hole));
  });
  return { name, holes };
}

function validScore(value: unknown) {
  const text = normalizeText(value);
  return /^\d{1,2}$/.test(text) && Number(text) >= 1 && Number(text) <= 15 ? Number(text) : null;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') { if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; } else quoted = !quoted; }
    else if (character === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((character === "\n" || character === "\r") && !quoted) { if (character === "\r" && text[index + 1] === "\n") index += 1; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += character;
  }
  row.push(cell); if (row.some((value) => value !== "") || rows.length === 0) rows.push(row);
  return rows;
}

export function previewScoreImport(rows: unknown[][], players: Player[], mode: ScoreImportMode = "scores-only"): ScoreImportPreview {
  const [headers = [], ...dataRows] = rows;
  const { name: nameColumn, holes } = headerIndex(headers);
  if (nameColumn < 0 || holes.some((column) => column < 0)) return { rowsFound: 0, entries: [], matchedCount: 0, newPlayerCount: 0, unmatched: [], invalid: [], replacementCount: 0, headerError: "The file must include Name and all H1–H18 columns." };
  const playerByName = new Map<string, Player[]>();
  players.forEach((player) => { const name = normalizeImportedName(player.name); if (name) playerByName.set(name, [...(playerByName.get(name) ?? []), player]); });
  const entries: ScoreImportEntry[] = []; const unmatched: ScoreImportIssue[] = []; const invalid: ScoreImportIssue[] = [];
  const importedPlayerIds = new Set<string>(); const importedNames = new Set<string>(); let replacementCount = 0; let matchedCount = 0; let newPlayerCount = 0; let rowsFound = 0;
  dataRows.forEach((row, index) => {
    if (!row.some((value) => normalizeText(value) !== "")) return;
    rowsFound += 1; const rowNumber = index + 2; const name = normalizeText(row[nameColumn]); const normalizedName = normalizeImportedName(name);
    if (!name) { invalid.push({ rowNumber, name: "(blank name)", reason: "Missing player name" }); return; }
    const matches = playerByName.get(normalizedName) ?? [];
    if (matches.length > 1) { invalid.push({ rowNumber, name, reason: "Multiple current-round players have this name" }); return; }
    const scores = holes.map((column) => validScore(row[column]));
    if (scores.some((score) => score === null)) { invalid.push({ rowNumber, name, reason: "All 18 hole scores must be whole numbers from 1 to 15" }); return; }
    if (importedNames.has(normalizedName)) { invalid.push({ rowNumber, name, reason: "Duplicate player in the import file" }); return; }
    importedNames.add(normalizedName);
    const player = matches[0];
    if (!player && mode === "scores-only") { unmatched.push({ rowNumber, name, reason: "No matching player in this round" }); return; }
    if (player) {
      if (importedPlayerIds.has(player.id)) { invalid.push({ rowNumber, name, reason: "Duplicate player in the import file" }); return; }
      importedPlayerIds.add(player.id);
      if (player.scores.some((score) => score !== null)) replacementCount += 1;
      matchedCount += 1;
      entries.push({ playerId: player.id, name: player.name, scores: scores as number[], newPlayer: false });
    } else {
      newPlayerCount += 1;
      entries.push({ name, scores: scores as number[], newPlayer: true });
    }
  });
  return { rowsFound, entries, matchedCount, newPlayerCount, unmatched, invalid, replacementCount };
}

export function applyScoreImport(players: Player[], entries: ScoreImportEntry[], options: ApplyScoreImportOptions = {}): Player[] {
  const scoresByPlayerId = new Map(entries.filter((entry) => entry.playerId).map((entry) => [entry.playerId!, entry.scores]));
  const updated = players.map((player) => { const scores = scoresByPlayerId.get(player.id); return scores ? { ...player, scores: [...scores] } : player; });
  const createPlayerId = options.createPlayerId ?? ((entry, index) => `import-player-${Date.now()}-${index}-${entry.name.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-")}`);
  const newPlayers: Player[] = entries.filter((entry) => entry.newPlayer).map((entry, index) => ({ id: createPlayerId(entry, index), name: entry.name, scores: [...entry.scores] }));
  return [...updated, ...newPlayers];
}

export async function previewScoreImportFile(file: File, players: Player[], mode: ScoreImportMode = "scores-only"): Promise<ScoreImportPreview> {
  const extension = file.name.split(".").pop()?.toLocaleLowerCase();
  if (!extension || !["xlsx", "csv"].includes(extension)) throw new Error("Choose an .xlsx or .csv score file.");
  try {
    const rows = extension === "csv" ? parseCsv(await file.text()) : await readSheet(file);
    return previewScoreImport(rows as unknown[][], players, mode);
  } catch { throw new Error("This file could not be read as a spreadsheet."); }
}