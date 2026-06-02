/**
 * Excel-NL friendly CSV helpers, matching the existing rapportage export
 * convention: UTF-8 BOM so Excel detects the encoding, `;` separator, and euro
 * amounts written with a comma decimal.
 */

/** Format integer cents as a Dutch decimal string, e.g. -1250 => "-12,50". */
export function eurosNl(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

/** Quote a CSV field when it contains the separator, a quote or a newline. */
export function csvField(value: string): string {
  if (/[";\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Build a full CSV document (header + rows) with a BOM and CRLF line endings. */
export function buildCsv(header: string[], rows: string[][]): string {
  const lines = [header.map(csvField).join(";")];
  for (const row of rows) {
    lines.push(row.map(csvField).join(";"));
  }
  return "\uFEFF" + lines.join("\r\n");
}

/** Standard CSV download response with attachment headers. */
export function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
