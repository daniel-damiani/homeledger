import fs from "fs";
import path from "path";
import type { ImportPreset } from "./parsers";
import { extractCsvTable } from "./parsers";

const PRESET_DIR = path.join(process.cwd(), "presets", "import");

export function listPresetNames(): string[] {
  if (!fs.existsSync(PRESET_DIR)) return [];
  return fs
    .readdirSync(PRESET_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
}

export function loadPreset(name: string): ImportPreset {
  const file = path.join(PRESET_DIR, `${name}.json`);
  if (!fs.existsSync(file)) {
    return {
      name: "generic",
      dateColumn: "Date",
      payeeColumn: "Description",
      amountColumn: "Amount",
    };
  }
  return JSON.parse(fs.readFileSync(file, "utf8")) as ImportPreset;
}

export function guessPreset(headers: string[]): string {
  const h = headers.map((x) => x.toLowerCase().trim());
  const has = (name: string) => h.includes(name);

  // Chase credit card export
  if (has("transaction date") && has("post date") && has("amount")) {
    return "chase-credit";
  }
  // Chase checking / savings
  if ((has("posting date") || has("post date")) && has("description") && has("amount")) {
    if (has("details") || has("type")) return "chase";
  }
  if (has("date") && has("description") && has("amount")) {
    if (h.some((x) => x.includes("card member"))) return "amex";
    if (has("transaction date") && has("debit") && has("credit")) return "bank-of-america";
    if (has("transaction date") && has("transaction amount")) return "capital-one";
  }
  return "generic";
}

export function detectHeadersFromContent(content: string): string[] {
  return extractCsvTable(content).headers;
}