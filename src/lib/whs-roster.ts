import type { Player } from "./scoring.ts";

export type WhsFlight = "A" | "B" | "C" | "D" | "SS";
export type WhsFlightFormat = "A-C" | "A-D";
export type WhsRosterPlayer = {
  playerId: string; name: string; handicap: number; flight: WhsFlight; tee?: string;
  provisionalHandicap?: number; maxHandicapApplied?: boolean;
};
export type WhsRoster = {
  format: "whs-play-setup-v1"; tournamentName: string; playDate: string; course: string;
  flightFormat: WhsFlightFormat;
  players: WhsRosterPlayer[];
};

const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const flights = new Set(["A", "B", "C", "D", "SS"]);
const validDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export function parseWhsRoster(raw: string): WhsRoster {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error("Choose a valid WHS Golf JSON roster."); }
  if (!object(value) || value.format !== "whs-play-setup-v1" || typeof value.tournamentName !== "string" || !value.tournamentName.trim()
    || value.tournamentName.length > 160 || typeof value.course !== "string" || !value.course.trim()
    || !validDate(value.playDate)
    || !Array.isArray(value.players) || value.players.length < 1 || value.players.length > 200) throw new Error("The WHS roster has missing or invalid tournament details.");
  if (value.flightFormat !== undefined && value.flightFormat !== "A-C" && value.flightFormat !== "A-D") throw new Error("The WHS Flight format must be A-C or A-D.");
  const ids = new Set<string>();
  const players = value.players.map((item: unknown, index): WhsRosterPlayer => {
    if (!object(item) || typeof item.playerId !== "string" || !item.playerId.trim() || item.playerId.length > 100
      || typeof item.name !== "string" || !item.name.trim() || item.name.length > 160
      || typeof item.handicap !== "number" || !Number.isInteger(item.handicap) || item.handicap < 0 || item.handicap > 72
      || typeof item.flight !== "string" || !flights.has(item.flight)
      || (item.tee !== undefined && (typeof item.tee !== "string" || item.tee.length > 100))
      || (item.provisionalHandicap !== undefined && (typeof item.provisionalHandicap !== "number" || !Number.isInteger(item.provisionalHandicap) || item.provisionalHandicap < 0 || item.provisionalHandicap > 72))
      || (item.maxHandicapApplied !== undefined && typeof item.maxHandicapApplied !== "boolean")) throw new Error(`Player ${index + 1} has missing or invalid WHS data.`);
    const id = item.playerId.trim(), name = item.name.trim();
    if (ids.has(id)) throw new Error(`Player ${index + 1} duplicates an ID in the WHS roster.`);
    ids.add(id);
    return { playerId: id, name, handicap: item.handicap as number, flight: item.flight as WhsFlight,
      ...(item.tee === undefined ? {} : { tee: item.tee as string }),
      ...(item.provisionalHandicap === undefined ? {} : { provisionalHandicap: item.provisionalHandicap as number }),
      ...(item.maxHandicapApplied === undefined ? {} : { maxHandicapApplied: item.maxHandicapApplied as boolean }) };
  });
  const flightFormat: WhsFlightFormat = value.flightFormat === "A-C" || value.flightFormat === "A-D" ? value.flightFormat : players.some((player) => player.flight === "D") ? "A-D" : "A-C";
  if (flightFormat === "A-C" && players.some((player) => player.flight === "D")) throw new Error("Flight D cannot appear in an A-C WHS roster.");
  return { format: "whs-play-setup-v1", tournamentName: value.tournamentName.trim(), playDate: value.playDate, course: value.course.trim(), flightFormat, players };
}

export function rosterPlayers(roster: WhsRoster): Player[] {
  return roster.players.map((item) => ({ id: `whs:${item.playerId}`, sourcePlayerId: item.playerId, name: item.name,
    handicap: item.handicap, awardCategory: item.flight, pairing: "", scores: Array(18).fill(null),
    ...(item.tee ? { tee: item.tee } : {}),
    ...(item.provisionalHandicap === undefined ? {} : { provisionalHandicap: item.provisionalHandicap }),
    ...(item.maxHandicapApplied === undefined ? {} : { maxHandicapApplied: item.maxHandicapApplied }) }));
}

export function rosterMatchesCurrent(roster: WhsRoster, currentName: string, currentPlayers: Player[]): boolean {
  if (currentName.trim() !== roster.tournamentName || currentPlayers.length !== roster.players.length) return false;
  const byId = new Map(currentPlayers.map((player) => [player.sourcePlayerId, player]));
  return roster.players.every((item) => {
    const player = byId.get(item.playerId);
    return player?.name === item.name && player.handicap === item.handicap && player.awardCategory === item.flight && (player.tee ?? "") === (item.tee ?? "");
  });
}

export function whsImportDecision(roster: WhsRoster, current: { name: string; playDate: string; sourceCourse: string; flightFormat?: WhsFlightFormat; players: Player[]; meaningful: boolean }): "new" | "same" | "blocked" {
  if (rosterMatchesCurrent(roster, current.name, current.players) && current.playDate === roster.playDate && current.sourceCourse === roster.course && current.flightFormat === roster.flightFormat) return "same";
  return current.meaningful ? "blocked" : "new";
}
