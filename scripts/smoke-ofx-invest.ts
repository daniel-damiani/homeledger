import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { parseOfxContent } from "../src/lib/import/parsers";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const bank = readFileSync(join(root, "fixtures/sample.ofx"), "utf8");
const bankRows = parseOfxContent(bank);
if (bankRows.length !== 3) throw new Error(`bank ofx expected 3, got ${bankRows.length}`);
if (bankRows[0].externalId !== "OFX001") throw new Error("bank fitid");

const principal = readFileSync(join(root, "fixtures/sample-principal-401k.qfx"), "utf8");
const rows = parseOfxContent(principal);
if (rows.length !== 2) {
  throw new Error(`principal expected 2 contrib rows, got ${rows.length}: ${JSON.stringify(rows)}`);
}
if (!rows.every((r) => r.amountCents > 0)) throw new Error("contribs should be positive");
const total = rows.reduce((s, r) => s + r.amountCents, 0);
if (total !== 62500) throw new Error(`expected $625 contrib total, got ${total}`);
if (!rows.some((r) => /Vanguard/i.test(r.payee))) throw new Error("expected security name");

console.log("smoke:ofx-invest OK", { bank: bankRows.length, principal: rows.length, total });
