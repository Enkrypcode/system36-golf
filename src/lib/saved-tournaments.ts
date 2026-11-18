import { parseSavedTournament, serializeTournament, type SavedTournament } from "./tournament-storage.ts";

export const SAVED_TOURNAMENTS_KEY = "enkrypscore:saved-tournaments:v1";
export type TournamentSnapshot = { id: string; name: string; savedAt: string; state: SavedTournament };
type SnapshotStore = Pick<Storage, "getItem" | "setItem">;

export function readTournamentSnapshots(storage: SnapshotStore): TournamentSnapshot[] {
  const raw = storage.getItem(SAVED_TOURNAMENTS_KEY);
  if (!raw) return [];
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data)) throw new Error("The saved tournament library could not be read.");
  const ids = new Set<string>();
  return data.map((item: unknown) => {
    if (!item || typeof item !== "object") throw new Error("A saved tournament is invalid.");
    const value = item as Partial<TournamentSnapshot>;
    const state = parseSavedTournament(JSON.stringify(value.state));
    if (typeof value.id !== "string" || !value.id || ids.has(value.id) || typeof value.name !== "string" || !value.name.trim()
      || typeof value.savedAt !== "string" || !Number.isFinite(Date.parse(value.savedAt)) || !state) throw new Error("A saved tournament is invalid.");
    ids.add(value.id);
    return { id: value.id, name: value.name, savedAt: value.savedAt, state };
  });
}

/** The caller must use the existing Admin session before every library action. */
export function saveTournamentSnapshot(storage: SnapshotStore, name: string, state: SavedTournament, id = crypto.randomUUID(), savedAt = new Date().toISOString()) {
  const snapshots = readTournamentSnapshots(storage);
  const canonical = parseSavedTournament(serializeTournament(state));
  if (!name.trim() || !canonical) throw new Error("Enter a snapshot name and use a valid tournament.");
  if (snapshots.some((snapshot) => snapshot.id === id)) throw new Error("Snapshot identity already exists.");
  const snapshot = { id, name: name.trim(), savedAt, state: canonical };
  storage.setItem(SAVED_TOURNAMENTS_KEY, JSON.stringify([snapshot, ...snapshots]));
  return snapshot;
}

export function renameTournamentSnapshot(storage: SnapshotStore, id: string, name: string) {
  if (!name.trim()) throw new Error("Enter a snapshot name.");
  const snapshots = readTournamentSnapshots(storage);
  if (!snapshots.some((snapshot) => snapshot.id === id)) throw new Error("The saved tournament no longer exists.");
  storage.setItem(SAVED_TOURNAMENTS_KEY, JSON.stringify(snapshots.map((snapshot) => snapshot.id === id ? { ...snapshot, name: name.trim() } : snapshot)));
}

export function deleteTournamentSnapshot(storage: SnapshotStore, id: string) {
  const snapshots = readTournamentSnapshots(storage);
  storage.setItem(SAVED_TOURNAMENTS_KEY, JSON.stringify(snapshots.filter((snapshot) => snapshot.id !== id)));
}
