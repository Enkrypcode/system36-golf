export const noveltyTypes = ["NTTP", "NTTL", "LD"] as const;
export type NoveltyType = typeof noveltyTypes[number];
export type NoveltyEntry = { id: string; type: NoveltyType; hole: number | null; playerId: string; distance: string };

export const blankNovelty = (id: string): NoveltyEntry => ({ id, type: "NTTP", hole: null, playerId: "", distance: "" });

export function isNoveltyEntry(value: unknown): value is NoveltyEntry {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.id === "string" && noveltyTypes.includes(entry.type as NoveltyType)
    && (entry.hole === null || (Number.isInteger(entry.hole) && (entry.hole as number) >= 1 && (entry.hole as number) <= 18))
    && typeof entry.playerId === "string" && typeof entry.distance === "string" && /^\d*(?:\.\d*)?$/.test(entry.distance);
}

export function noveltyText(entry: NoveltyEntry, playerName: string) {
  return [entry.type, entry.hole === null ? "" : `Hole ${entry.hole}`, playerName, entry.distance.trim() ? `${entry.distance.trim()} m` : ""].filter(Boolean).join(" · ");
}