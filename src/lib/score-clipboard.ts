export type ScoreClipboardParseResult =
  | { ok: true; values: Array<number | null> }
  | { ok: false; error: string };

const validScore = (value: string) => /^\d{1,2}$/.test(value) && Number(value) >= 1 && Number(value) <= 15;

/** Parses one horizontal, tab-separated score range from a spreadsheet clipboard. */
export function parseScoreClipboard(text: string): ScoreClipboardParseResult {
  const rows = text.replace(/\r/g, "").split("\n").filter((row) => row !== "");
  if (rows.length !== 1) return { ok: false, error: "Paste one horizontal score range at a time." };
  const cells = rows[0].split("\t");
  if (!cells.length) return { ok: false, error: "No score values were found in the clipboard." };
  const values: Array<number | null> = [];
  for (const cell of cells) {
    const value = cell.trim();
    if (!value) { values.push(null); continue; }
    if (!validScore(value)) return { ok: false, error: "Scores must be whole numbers from 1 to 15." };
    values.push(Number(value));
  }
  return { ok: true, values };
}

/** Formats a horizontal score range for Excel- and Sheets-compatible copying. */
export function formatScoreClipboard(scores: Array<number | null>, startHole: number, endHole: number) {
  const start = Math.max(0, Math.min(startHole, endHole));
  const end = Math.min(scores.length - 1, Math.max(startHole, endHole));
  return scores.slice(start, end + 1).map((score) => score === null ? "" : String(score)).join("\t");
}

/** Applies validated values only to score cells, clipping safely at H18. */
export function pasteScoreValues(scores: Array<number | null>, startHole: number, values: Array<number | null>) {
  const next = [...scores];
  if (startHole < 0 || startHole >= next.length) return next;
  values.slice(0, next.length - startHole).forEach((value, index) => { next[startHole + index] = value; });
  return next;
}
/** Clears only the editable score cells of one scorecard. */
export function clearScoreValues(scores: Array<number | null>) {
  return scores.map(() => null);
}