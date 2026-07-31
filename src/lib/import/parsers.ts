import { parse as parseCsv } from "csv-parse/sync";
import { createHash } from "crypto";
import { parseMoneyToCents } from "../money";

export type ParsedRow = {
  date: Date;
  payee: string;
  memo?: string;
  amountCents: number;
  externalId: string;
};

export type ImportPreset = {
  name: string;
  dateColumn: string;
  payeeColumn: string;
  amountColumn?: string;
  debitColumn?: string;
  creditColumn?: string;
  memoColumn?: string;
  /** If true, flip CSV amounts so expenses become negative */
  invertAmount?: boolean;
  dateFormat?: string;
};

export function detectFormat(filename: string, content: string): "csv" | "ofx" | "pdf" | "txt" {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".ofx") || lower.endsWith(".qfx") || content.includes("<OFX>")) return "ofx";
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".csv")) return "csv";
  return "txt";
}

export function parseDateLoose(raw: string): Date {
  const s = raw.trim();
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return new Date(s.slice(0, 10) + "T12:00:00Z");
  // MM/DD/YYYY
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mdy) {
    return new Date(Date.UTC(+mdy[3], +mdy[1] - 1, +mdy[2], 12));
  }
  // YYYYMMDDHHMMSS from OFX
  const ofx = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (ofx) {
    return new Date(Date.UTC(+ofx[1], +ofx[2] - 1, +ofx[3], 12));
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d;
  return new Date();
}

function rowExternalId(parts: string[]): string {
  return createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 24);
}

export function parseCsvContent(
  content: string,
  preset: ImportPreset,
  amountSign: "as-is" | "invert" | "expenses-negative" = "expenses-negative"
): ParsedRow[] {
  const records = parseCsv(content, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as Record<string, string>[];

  const rows: ParsedRow[] = [];
  for (const rec of records) {
    const dateRaw = rec[preset.dateColumn] ?? "";
    const payee = (rec[preset.payeeColumn] ?? "Unknown").trim() || "Unknown";
    const memo = preset.memoColumn ? rec[preset.memoColumn] : undefined;

    let amountCents = 0;
    if (preset.amountColumn && rec[preset.amountColumn] != null) {
      amountCents = parseMoneyToCents(rec[preset.amountColumn]);
    } else if (preset.debitColumn || preset.creditColumn) {
      const debit = preset.debitColumn ? parseMoneyToCents(rec[preset.debitColumn] || "0") : 0;
      const credit = preset.creditColumn ? parseMoneyToCents(rec[preset.creditColumn] || "0") : 0;
      amountCents = credit - Math.abs(debit);
    }

    if (amountSign === "invert" || preset.invertAmount) {
      amountCents = -amountCents;
    } else if (amountSign === "expenses-negative" && amountCents > 0 && !preset.creditColumn) {
      // Many banks export purchases as positive — flip to expenses
      // Keep as-is if debit/credit columns already signed
    }

    if (!dateRaw && !payee) continue;
    if (amountCents === 0 && !dateRaw) continue;

    const date = parseDateLoose(dateRaw);
    const externalId = rowExternalId([
      date.toISOString().slice(0, 10),
      payee,
      String(amountCents),
      memo ?? "",
    ]);

    rows.push({ date, payee, memo, amountCents, externalId });
  }
  return rows;
}

export function parseOfxContent(content: string): ParsedRow[] {
  const rows: ParsedRow[] = [];
  const blocks = content.split(/<STMTTRN>/i).slice(1);
  for (const block of blocks) {
    const get = (tag: string) => {
      const m = block.match(new RegExp(`<${tag}>([^\\n\\r<]+)`, "i"));
      return m ? m[1].trim() : "";
    };
    const dateRaw = get("DTPOSTED") || get("DTUSER");
    const amountRaw = get("TRNAMT");
    const payee = get("NAME") || get("PAYEE") || get("MEMO") || "OFX transaction";
    const memo = get("MEMO") || undefined;
    const fitid = get("FITID");
    if (!amountRaw) continue;
    const amountCents = parseMoneyToCents(amountRaw);
    const date = parseDateLoose(dateRaw);
    const externalId =
      fitid ||
      rowExternalId([date.toISOString().slice(0, 10), payee, String(amountCents)]);
    rows.push({ date, payee, memo, amountCents, externalId });
  }
  return rows;
}

export function parseTextStatement(content: string): ParsedRow[] {
  const rows: ParsedRow[] = [];
  const lines = content.split(/\r?\n/);
  // Pattern: MM/DD/YYYY  DESCRIPTION  -12.34 or 12.34
  const re =
    /^(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})\s+(.+?)\s+([+-]?\$?\d[\d,]*\.\d{2})\s*$/;
  for (const line of lines) {
    const m = line.trim().match(re);
    if (!m) continue;
    const date = parseDateLoose(m[1]);
    const payee = m[2].trim();
    let amountCents = parseMoneyToCents(m[3]);
    // Treat unsigned amounts in text statements as expenses
    if (!m[3].includes("-") && !m[3].startsWith("+") && amountCents > 0) {
      amountCents = -amountCents;
    }
    rows.push({
      date,
      payee,
      amountCents,
      externalId: rowExternalId([
        date.toISOString().slice(0, 10),
        payee,
        String(amountCents),
      ]),
    });
  }
  return rows;
}

export async function parsePdfBuffer(buffer: Buffer): Promise<ParsedRow[]> {
  // pdf-parse is CJS; dynamic import for Next bundling
  const pdfParse = (await import("pdf-parse")).default as (
    data: Buffer
  ) => Promise<{ text: string }>;
  const data = await pdfParse(buffer);
  return parseTextStatement(data.text);
}