import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { winnerPdfPresentation, type WinnerPdfInput } from "./winner-pdf-model.ts";

// The bundled PDF font supports Latin names and half-handicap symbols.
const text = (value: string) => value.replace(/[–—−]/g, "-").replace(/→/g, " > ").replace(/✓/g, "");

export function createWinnersPdf(input: WinnerPdfInput) {
  const presentation = winnerPdfPresentation(input);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  doc.setProperties({ title: presentation.name + " - Winners", author: "EnkrypScore", creator: "EnkrypScore" });
  const margin = 14;
  const width = doc.internal.pageSize.getWidth() - margin * 2;
  doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(20, 61, 91);
  doc.text("EnkrypScore", margin, 18);
  doc.setFontSize(8).setFont("helvetica", "normal").setTextColor(92, 115, 131);
  doc.text("Golf Scoring System", margin, 23);
  doc.setFont("helvetica", "bold").setFontSize(19).setTextColor(20, 61, 91);
  const titleLines = doc.splitTextToSize(text(presentation.name), width);
  doc.text(titleLines, margin, 34);
  let y = 36 + titleLines.length * 8;
  autoTable(doc, {
    startY: y, margin: { left: margin, right: margin, top: 16, bottom: 16 },
    body: presentation.metadata.map((line) => [text(line)]), theme: "plain",
    styles: { font: "helvetica", fontSize: 9.5, cellPadding: 1, textColor: [92, 115, 131] },
    didDrawPage: ({ cursor }) => { if (cursor) y = cursor.y; },
  });
  y += 6;
  for (const section of presentation.sections) {
    autoTable(doc, {
      startY: y, margin: { left: margin, right: margin, top: 16, bottom: 16 },
      head: [
        [{ content: text(section.title), colSpan: section.columns.length, styles: { fillColor: [232, 241, 247], textColor: [20, 61, 91], fontSize: 11, cellPadding: 3 } }],
        section.columns.map(text),
      ],
      body: section.rows.map((row) => row.map(text)),
      theme: "grid",
      styles: { font: "helvetica", fontSize: 10, cellPadding: 2.8, textColor: [30, 54, 72], lineColor: [218, 228, 235], lineWidth: 0.15, overflow: "linebreak", valign: "middle" },
      headStyles: { fillColor: [20, 61, 91], textColor: 255, fontSize: 9, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      rowPageBreak: "avoid", pageBreak: section.keepTogether ? "avoid" : "auto", showHead: "everyPage",
      didDrawPage: ({ cursor }) => { if (cursor) y = cursor.y; },
    });
    y += 7;
  }
  for (let page = 1; page <= doc.getNumberOfPages(); page++) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(100, 119, 132);
    doc.text("EnkrypScore | Winners & Awards", margin, 288);
    doc.text(`${page} / ${doc.getNumberOfPages()}`, 196, 288, { align: "right" });
  }
  return doc;
}
