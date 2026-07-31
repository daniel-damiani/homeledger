import fs from "fs";
import path from "path";
import type { ImportPreset } from "./parsers";

const PRESET_DIR = path.join(process.cwd(), "presets", "import");

export function listPresetNames(): string[] {
  if (!fs.existsSync(PRESET_DIR)) return [];
  return fs
    .readdirSync(PRESET_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
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
  const h = headers.map((x) => x.toLowerCase());
  if (h.includes("posting date") && h.includes("details")) return "chase";
  if (h.includes("date") && h.includes("description") && h.includes("amount")) {
    if (h.some((x) => x.includes("card member"))) return "amex";
    if (h.includes("transaction date") && h.includes("debit") && h.includes("credit"))
      return "bank-of-america";
    if (h.includes("transaction date") && h.includes("transaction amount"))
      return "capital-one";
  }
  return "generic";
}