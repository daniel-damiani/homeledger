import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { parse } = require("csv-parse/sync");
const { createHash } = require("crypto");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function parseMoneyToCents(raw) {
  const cleaned = String(raw).replace(/[^0-9.+\-]/g, "").trim();
  if (!cleaned) return 0;
  return Math.round(Number.parseFloat(cleaned) * 100);
}

function parseDateLoose(raw) {
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return new Date(s.slice(0, 10) + "T12:00:00Z");
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mdy) return new Date(Date.UTC(+mdy[3], +mdy[1] - 1, +mdy[2], 12));
  const ofx = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (ofx) return new Date(Date.UTC(+ofx[1], +ofx[2] - 1, +ofx[3], 12));
  return new Date(s);
}

function parseCsv(content, preset) {
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  });
  return records.map((rec) => {
    let amountCents = 0;
    if (preset.amountColumn) amountCents = parseMoneyToCents(rec[preset.amountColumn] || "0");
    if (preset.debitColumn || preset.creditColumn) {
      const debit = parseMoneyToCents(rec[preset.debitColumn] || "0");
      const credit = parseMoneyToCents(rec[preset.creditColumn] || "0");
      amountCents = credit - Math.abs(debit);
    }
    if (preset.invertAmount) amountCents = -amountCents;
    return {
      date: parseDateLoose(rec[preset.dateColumn]),
      payee: rec[preset.payeeColumn],
      amountCents,
    };
  });
}

function parseOfx(content) {
  return content
    .split(/<STMTTRN>/i)
    .slice(1)
    .map((block) => {
      const get = (tag) => {
        const m = block.match(new RegExp(`<${tag}>([^\\n\\r<]+)`, "i"));
        return m ? m[1].trim() : "";
      };
      return {
        date: parseDateLoose(get("DTPOSTED")),
        payee: get("NAME") || get("PAYEE"),
        amountCents: parseMoneyToCents(get("TRNAMT")),
        fitid: get("FITID"),
      };
    })
    .filter((r) => r.payee);
}

function parseText(content) {
  const re =
    /^(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})\s+(.+?)\s+([+-]?\$?\d[\d,]*\.\d{2})\s*$/;
  const rows = [];
  for (const line of content.split(/\r?\n/)) {
    const m = line.trim().match(re);
    if (!m) continue;
    let amountCents = parseMoneyToCents(m[3]);
    if (!m[3].includes("-") && !m[3].startsWith("+") && amountCents > 0) amountCents = -amountCents;
    rows.push({ date: parseDateLoose(m[1]), payee: m[2].trim(), amountCents });
  }
  return rows;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const chase = fs.readFileSync(path.join(root, "fixtures/sample-chase.csv"), "utf8");
const chasePreset = JSON.parse(
  fs.readFileSync(path.join(root, "presets/import/chase.json"), "utf8")
);
const chaseRows = parseCsv(chase, chasePreset);
assert(chaseRows.length >= 10, "chase csv too short");
assert(chaseRows.some((r) => r.amountCents < 0), "chase should have expenses");
assert(chaseRows.some((r) => r.amountCents > 0), "chase should have income");

const generic = fs.readFileSync(path.join(root, "fixtures/sample-generic.csv"), "utf8");
const genericPreset = JSON.parse(
  fs.readFileSync(path.join(root, "presets/import/generic.json"), "utf8")
);
const genericRows = parseCsv(generic, genericPreset);
assert(genericRows.length >= 4, "generic csv too short");

const ofx = fs.readFileSync(path.join(root, "fixtures/sample.ofx"), "utf8");
const ofxRows = parseOfx(ofx);
assert(ofxRows.length === 3, `ofx expected 3 rows, got ${ofxRows.length}`);
assert(ofxRows[0].fitid === "OFX001", "ofx fitid");

const txt = fs.readFileSync(path.join(root, "fixtures/sample-statement.txt"), "utf8");
const txtRows = parseText(txt);
assert(txtRows.length >= 5, "txt statement too short");

const hash = createHash("sha1").update("smoke").digest("hex");
assert(hash.length === 40, "hash");

console.log("smoke:parsers OK", {
  chase: chaseRows.length,
  generic: genericRows.length,
  ofx: ofxRows.length,
  txt: txtRows.length,
});