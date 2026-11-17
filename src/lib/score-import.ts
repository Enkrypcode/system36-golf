import { readSheet } from "read-excel-file/browser";
import type { AwardCategory, Player } from "@/lib/scoring";

export type ScoreImportMode = "players-only" | "players-scores" | "full-roster-scores";
export type ScoreImportIssue = { rowNumber: number; name: string; reason: string };
export type ScoreImportEntry = { playerId?: string; name: string; scores?: Array<number | null>; handicap?: number; awardCategory?: AwardCategory; pairing?: string; jackpotTargetFront?: number; jackpotTargetBack?: number; newPlayer: boolean };
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
type HeaderIndexes = { name: number; holes: number[]; handicap: number; flight: number; pairing: number; targetFront: number; targetBack: number };

const normalizeText = (value: unknown) => String(value ?? "").trim().replace(/\s+/g, " ");
export const normalizeImportedName = (value: unknown) => normalizeText(value).toLocaleLowerCase();

function headerIndex(headers: unknown[]): HeaderIndexes {
  const normalized = headers.map((header) => normalizeText(header).toLocaleLowerCase().replace(/[\s._–—-]/g, ""));
  const indexOf = (...names: string[]) => normalized.findIndex((header) => names.includes(header));
  const name = indexOf("name", "playername");
  const holes = Array.from({ length: 18 }, (_, index) => {
    const hole = index + 1;
    return indexOf(`h${hole}`, `hole${hole}`, String(hole));
  });
  return { name, holes, handicap: indexOf("handicap", "playinghandicap", "hcp"), flight: indexOf("flight", "awardcategory", "category"), pairing: indexOf("pairing", "group"), targetFront: indexOf("target19", "targetfront"), targetBack: indexOf("target1018", "targetback") };
}

function validScore(value: unknown) {
  const text = normalizeText(value);
  return /^\d{1,2}$/.test(text) && Number(text) >= 1 && Number(text) <= 15 ? Number(text) : null;
}

function importedHandicap(value: unknown) {
  const text = normalizeText(value);
  if (!text) return undefined;
  const handicap = Number(text);
  return Number.isFinite(handicap) && handicap >= 0 ? handicap : null;
}

function importedFlight(value: unknown) {
  const flight = normalizeText(value).toLocaleUpperCase();
  if (!flight) return undefined;
  return (["A", "B", "C", "D", "SS"] as const).includes(flight as AwardCategory) ? flight as AwardCategory : null;
}

function metadataFor(row: unknown[], headers: HeaderIndexes) {
  const handicap = headers.handicap < 0 ? undefined : importedHandicap(row[headers.handicap]);
  const awardCategory = headers.flight < 0 ? undefined : importedFlight(row[headers.flight]);
  const pairing = headers.pairing < 0 ? undefined : normalizeText(row[headers.pairing]).toLocaleUpperCase() || undefined;
  return { handicap, awardCategory, pairing };
}

export function parseCsv(text: string): string[][] {
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

const emptyPreview = (headerError: string): ScoreImportPreview => ({ rowsFound: 0, entries: [], matchedCount: 0, newPlayerCount: 0, unmatched: [], invalid: [], replacementCount: 0, headerError });
const needsScores = (mode: ScoreImportMode) => mode !== "players-only";
const isFullRoster = (mode: ScoreImportMode) => mode === "full-roster-scores";

function headerErrorFor(headers: HeaderIndexes, mode: ScoreImportMode) {
  if (headers.name < 0) return "The file must include a Name column.";
  if (needsScores(mode) && headers.holes.some((column) => column < 0)) return "This import mode requires all H1–H18 columns.";
  return undefined;
}

export function previewScoreImport(rows: unknown[][], players: Player[], mode: ScoreImportMode = "players-scores"): ScoreImportPreview {
  const [headers = [], ...dataRows] = rows;
  const columns = headerIndex(headers);
  const headerError = headerErrorFor(columns, mode);
  if (headerError) return emptyPreview(headerError);
  const playerByName = new Map<string, Player[]>();
  players.forEach((player) => { const name = normalizeImportedName(player.name); if (name) playerByName.set(name, [...(playerByName.get(name) ?? []), player]); });
  const entries: ScoreImportEntry[] = []; const unmatched: ScoreImportIssue[] = []; const invalid: ScoreImportIssue[] = [];
  const importedPlayerIds = new Set<string>(); const importedNames = new Set<string>(); let replacementCount = 0; let matchedCount = 0; let newPlayerCount = 0; let rowsFound = 0;
  dataRows.forEach((row, index) => {
    if (!row.some((value) => normalizeText(value) !== "")) return;
    rowsFound += 1; const rowNumber = index + 2; const name = normalizeText(row[columns.name]); const normalizedName = normalizeImportedName(name);
    if (!name) { invalid.push({ rowNumber, name: "(blank name)", reason: "Missing player name" }); return; }
    if (importedNames.has(normalizedName)) { invalid.push({ rowNumber, name, reason: "Duplicate player in the import file" }); return; }
    const metadata = metadataFor(row, columns);
    if (metadata.handicap === null) { invalid.push({ rowNumber, name, reason: "Handicap must be a non-negative number" }); return; }
    if (metadata.awardCategory === null) { invalid.push({ rowNumber, name, reason: "Flight must be A, B, C, D, or SS" }); return; }
    let importMetadata: Partial<ScoreImportEntry> = {
      ...(metadata.handicap === undefined || metadata.handicap === null ? {} : { handicap: metadata.handicap }),
      ...(metadata.awardCategory === undefined || metadata.awardCategory === null ? {} : { awardCategory: metadata.awardCategory }),
      ...(metadata.pairing === undefined ? {} : { pairing: metadata.pairing }),
    };
    if (isFullRoster(mode)) {
      const targetFront = columns.targetFront < 0 ? undefined : importedHandicap(row[columns.targetFront]);
      const targetBack = columns.targetBack < 0 ? undefined : importedHandicap(row[columns.targetBack]);
      if (targetFront === null || targetBack === null) { invalid.push({ rowNumber, name, reason: "Targets must be non-negative numbers or blank" }); return; }
      importMetadata = {
        ...(columns.handicap < 0 ? {} : { handicap: metadata.handicap }),
        ...(columns.flight < 0 ? {} : { awardCategory: metadata.awardCategory }),
        ...(columns.pairing < 0 ? {} : { pairing: metadata.pairing ?? "" }),
        ...(columns.targetFront < 0 ? {} : { jackpotTargetFront: targetFront }),
        ...(columns.targetBack < 0 ? {} : { jackpotTargetBack: targetBack }),
      };
    }
    const scores = needsScores(mode) ? columns.holes.map((column) => {
      if (isFullRoster(mode) && normalizeText(row[column]) === "") return null;
      return validScore(row[column]) ?? undefined;
    }) : undefined;
    if (scores?.some((score) => score === undefined)) {
      invalid.push({ rowNumber, name, reason: isFullRoster(mode) ? "Entered hole scores must be whole numbers from 1 to 15; blank holes are allowed" : "All 18 hole scores must be whole numbers from 1 to 15" });
      return;
    }
    importedNames.add(normalizedName);
    const matches = playerByName.get(normalizedName) ?? [];
    if (matches.length > 1) { invalid.push({ rowNumber, name, reason: "Multiple current-round players have this name" }); return; }
    const player = matches[0];
    if (player) {
      if (importedPlayerIds.has(player.id)) { invalid.push({ rowNumber, name, reason: "Duplicate player in the import file" }); return; }
      importedPlayerIds.add(player.id);
      if (scores && player.scores.some((score) => score !== null)) replacementCount += 1;
      matchedCount += 1;
      entries.push({ ...importMetadata, playerId: player.id, name: player.name, ...(scores ? { scores: scores as Array<number | null> } : {}), newPlayer: false });
    } else {
      newPlayerCount += 1;
      entries.push({ ...importMetadata, name, ...(scores ? { scores: scores as Array<number | null> } : {}), newPlayer: true });
    }
  });
  return { rowsFound, entries, matchedCount, newPlayerCount, unmatched, invalid, replacementCount };
}

const importedPlayerData = (player: Player, entry: ScoreImportEntry): Player => ({
  ...player,
  ...(entry.scores ? { scores: [...entry.scores] } : {}),
  ...(Object.hasOwn(entry, "handicap") ? { handicap: entry.handicap } : {}),
  ...(Object.hasOwn(entry, "awardCategory") ? { awardCategory: entry.awardCategory } : {}),
  ...(Object.hasOwn(entry, "pairing") ? { pairing: entry.pairing } : {}),
  ...(Object.hasOwn(entry, "jackpotTargetFront") ? { jackpotTargetFront: entry.jackpotTargetFront } : {}),
  ...(Object.hasOwn(entry, "jackpotTargetBack") ? { jackpotTargetBack: entry.jackpotTargetBack } : {}),
});

export function applyScoreImport(players: Player[], entries: ScoreImportEntry[], options: ApplyScoreImportOptions = {}): Player[] {
  const entriesByPlayerId = new Map(entries.filter((entry) => entry.playerId).map((entry) => [entry.playerId!, entry]));
  const updated = players.map((player) => { const entry = entriesByPlayerId.get(player.id); return entry ? importedPlayerData(player, entry) : player; });
  const createPlayerId = options.createPlayerId ?? ((entry, index) => `import-player-${Date.now()}-${index}-${entry.name.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-")}`);
  const newPlayers = entries.filter((entry) => entry.newPlayer).map((entry, index) => importedPlayerData({ id: createPlayerId(entry, index), name: entry.name, scores: Array(18).fill(null) }, entry));
  return [...updated, ...newPlayers];
}

export async function previewScoreImportFile(file: File, players: Player[], mode: ScoreImportMode = "players-scores"): Promise<ScoreImportPreview> {
  const extension = file.name.split(".").pop()?.toLocaleLowerCase();
  if (!extension || !["xlsx", "csv"].includes(extension)) throw new Error("Choose an .xlsx or .csv score file.");
  try {
    const rows = extension === "csv" ? parseCsv(await file.text()) : await readSheet(file);
    return previewScoreImport(rows as unknown[][], players, mode);
  } catch { throw new Error("This file could not be read as a spreadsheet."); }
}
