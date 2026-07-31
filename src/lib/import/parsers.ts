import { parse as parseCsv } from "csv-parse/sync";
import { createHash } from "crypto";
import { isMoneyLabel, parseMoneyToCents } from "../money";

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

export function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, "");
}

/** Find the CSV header line index (banks often put account metadata above it). */
export function findCsvHeaderLineIndex(lines: string[]): number {
  const headerHints = [
    "transaction date",
    "posting date",
    "post date",
    "description",
    "amount",
    "debit",
    "credit",
  ];
  for (let i = 0; i < Math.min(lines.length, 40); i++) {
    const line = lines[i].trim();
    if (!line || !line.includes(",")) continue;
    const lower = line.toLowerCase();
    const hits = headerHints.filter((h) => lower.includes(h)).length;
    if (hits >= 2) return i;
  }
  return 0;
}

export function extractCsvTable(content: string): {
  text: string;
  headers: string[];
  preambleSkipped: number;
} {
  const cleaned = stripBom(content);
  const lines = cleaned.split(/\r?\n/);
  const headerIdx = findCsvHeaderLineIndex(lines);
  const table = lines.slice(headerIdx).join("\n");
  const headerLine = lines[headerIdx] ?? "";
  let headers: string[] = [];
  try {
    const parsed = parseCsv(headerLine, {
      relax_column_count: true,
      relax_quotes: true,
      trim: true,
    }) as string[][];
    headers = (parsed[0] ?? []).map((h) => String(h).replace(/^\uFEFF/, "").trim());
  } catch {
    headers = headerLine.split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  }
  return { text: table, headers, preambleSkipped: headerIdx };
}

function normalizeKey(s: string): string {
  return s
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Case/spacing-insensitive column lookup. */
export function pickColumn(
  rec: Record<string, string>,
  wanted: string | undefined
): string {
  if (!wanted) return "";
  if (rec[wanted] != null && String(rec[wanted]).length) return String(rec[wanted]);
  const target = normalizeKey(wanted);
  for (const [k, v] of Object.entries(rec)) {
    if (normalizeKey(k) === target) return v ?? "";
  }
  const aliases: Record<string, string[]> = {
    "posting date": ["post date", "transaction date", "trans date", "date"],
    "post date": ["posting date", "transaction date", "date"],
    "transaction date": ["posting date", "post date", "trans date", "date"],
    description: ["payee", "name", "merchant"],
    amount: ["transaction amount", "amt", "amount usd"],
    details: ["memo"],
    memo: ["details"],
  };
  for (const alt of aliases[target] ?? []) {
    for (const [k, v] of Object.entries(rec)) {
      if (normalizeKey(k) === alt && v) return v;
    }
  }
  for (const [k, v] of Object.entries(rec)) {
    const nk = normalizeKey(k);
    if (nk === target || nk.startsWith(target) || nk.includes(` ${target}`)) {
      if (v) return v;
    }
  }
  return "";
}

function parseAmountCell(raw: string): number | null {
  const s = String(raw ?? "").trim();
  if (!s || isMoneyLabel(s)) return null;
  if (!/\d/.test(s)) return null;
  const n = parseMoneyToCents(s);
  if (n !== 0) return n;
  // Explicit zero amounts
  if (/^0+([.,]0+)?$/.test(s.replace(/[^0-9.,]/g, ""))) return 0;
  return null;
}

function findAmountCents(rec: Record<string, string>, preset: ImportPreset): number {
  if (preset.amountColumn) {
    const amt = pickColumn(rec, preset.amountColumn);
    const parsed = parseAmountCell(amt);
    if (parsed != null) return parsed;
  }
  if (preset.debitColumn || preset.creditColumn) {
    const debitRaw = pickColumn(rec, preset.debitColumn);
    const creditRaw = pickColumn(rec, preset.creditColumn);
    const debit = parseAmountCell(debitRaw) ?? 0;
    const credit = parseAmountCell(creditRaw) ?? 0;
    if (debit || credit) return credit - Math.abs(debit);
  }

  // Auto Debit/Credit when those columns exist (Citi, BoA, etc.)
  let autoDebit = "";
  let autoCredit = "";
  for (const [k, v] of Object.entries(rec)) {
    const nk = normalizeKey(k);
    if (nk === "debit" || nk === "withdrawal") autoDebit = v ?? "";
    if (nk === "credit" || nk === "deposit") autoCredit = v ?? "";
  }
  if (autoDebit || autoCredit) {
    const debit = parseAmountCell(autoDebit) ?? 0;
    const credit = parseAmountCell(autoCredit) ?? 0;
    if (debit || credit) return credit - Math.abs(debit);
  }

  for (const [k, v] of Object.entries(rec)) {
    const nk = normalizeKey(k);
    if (!nk.includes("amount") && nk !== "amt") continue;
    const parsed = parseAmountCell(v);
    if (parsed != null) return parsed;
  }

  // Column shift fallback: last money-like cell that isn't date/payee-ish
  const candidates: number[] = [];
  for (const [k, v] of Object.entries(rec)) {
    const nk = normalizeKey(k);
    if (
      nk.includes("date") ||
      nk.includes("post") ||
      nk.includes("description") ||
      nk === "payee" ||
      nk === "debit" ||
      nk === "credit" ||
      nk === "status"
    ) {
      continue;
    }
    const parsed = parseAmountCell(v);
    if (parsed != null) candidates.push(parsed);
  }
  if (candidates.length) return candidates[candidates.length - 1];

  return 0;
}

/** Sample raw Amount-column values for debugging all-zero previews. */
export function sampleAmountColumn(
  content: string,
  amountColumn: string | undefined,
  limit = 5
): string[] {
  if (!amountColumn) return [];
  const { text } = extractCsvTable(content);
  try {
    const records = parseCsv(text, {
      columns: (header: string[]) =>
        header.map((h) => String(h ?? "").replace(/^\uFEFF/, "").trim()),
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
      relax_quotes: true,
      bom: true,
      to_line: limit + 1,
    }) as Record<string, string>[];
    return records.slice(0, limit).map((rec) => {
      const v = pickColumn(rec, amountColumn);
      return v === "" ? "(empty)" : v;
    });
  } catch {
    return [];
  }
}

export function parseDateLoose(raw: string): Date {
  const s = raw.trim();
  if (!s) return new Date(NaN);
  // ISO first (2026-07-29) — must precede MDY-with-hyphens
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return new Date(s.slice(0, 10) + "T12:00:00Z");
  const mdySlash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mdySlash) {
    return new Date(Date.UTC(+mdySlash[3], +mdySlash[1] - 1, +mdySlash[2], 12));
  }
  // Citi and some banks: 07-29-2026
  const mdyDash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (mdyDash) {
    return new Date(Date.UTC(+mdyDash[3], +mdyDash[1] - 1, +mdyDash[2], 12));
  }
  const ofx = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (ofx) {
    return new Date(Date.UTC(+ofx[1], +ofx[2] - 1, +ofx[3], 12));
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d;
  return new Date(NaN);
}

function rowExternalId(parts: string[]): string {
  return createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 24);
}

export function parseCsvContent(
  content: string,
  preset: ImportPreset,
  amountSign: "as-is" | "invert" | "expenses-negative" = "as-is"
): ParsedRow[] {
  const { text } = extractCsvTable(content);
  const records = parseCsv(text, {
    columns: (header: string[]) =>
      header.map((h) => String(h ?? "").replace(/^\uFEFF/, "").trim()),
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
    relax_quotes: true,
    bom: true,
  }) as Record<string, string>[];

  const rows: ParsedRow[] = [];
  for (const rec of records) {
    const dateRaw = pickColumn(rec, preset.dateColumn);
    const payeeRaw = pickColumn(rec, preset.payeeColumn);
    const payee = (payeeRaw || "Unknown").trim() || "Unknown";
    const memoRaw = pickColumn(rec, preset.memoColumn);
    const memo = memoRaw || undefined;

    let amountCents = findAmountCents(rec, preset);

    if (amountSign === "invert" || preset.invertAmount) {
      amountCents = -amountCents;
    }

    if (!dateRaw && (!payeeRaw || payee === "Unknown") && amountCents === 0) continue;
    if (!dateRaw && amountCents === 0) continue;

    const date = parseDateLoose(dateRaw);
    if (Number.isNaN(date.getTime()) && amountCents === 0) continue;
    const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;

    const externalId = rowExternalId([
      safeDate.toISOString().slice(0, 10),
      payee,
      String(amountCents),
      memo ?? "",
    ]);

    rows.push({ date: safeDate, payee, memo, amountCents, externalId });
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
    const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
    const externalId =
      fitid ||
      rowExternalId([safeDate.toISOString().slice(0, 10), payee, String(amountCents)]);
    rows.push({ date: safeDate, payee, memo, amountCents, externalId });
  }
  return rows;
}

export function parseTextStatement(content: string): ParsedRow[] {
  const rows: ParsedRow[] = [];
  const lines = content.split(/\r?\n/);
  const re =
    /^(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})\s+(.+?)\s+([+-]?\$?\d[\d,]*\.\d{2})\s*$/;
  for (const line of lines) {
    const m = line.trim().match(re);
    if (!m) continue;
    const date = parseDateLoose(m[1]);
    const payee = m[2].trim();
    let amountCents = parseMoneyToCents(m[3]);
    if (!m[3].includes("-") && !m[3].startsWith("+") && amountCents > 0) {
      amountCents = -amountCents;
    }
    const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
    rows.push({
      date: safeDate,
      payee,
      amountCents,
      externalId: rowExternalId([
        safeDate.toISOString().slice(0, 10),
        payee,
        String(amountCents),
      ]),
    });
  }
  return rows;
}

export async function parsePdfBuffer(buffer: Buffer): Promise<ParsedRow[]> {
  const pdfParse = (await import("pdf-parse")).default as (
    data: Buffer
  ) => Promise<{ text: string }>;
  const data = await pdfParse(buffer);
  return parseTextStatement(data.text);
}