import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import {
  detectFormat,
  parseCsvContent,
  parseOfxContent,
  parsePdfBuffer,
  parseTextStatement,
  type ParsedRow,
} from "@/lib/import/parsers";
import { guessPreset, listPresetNames, loadPreset } from "@/lib/import/presets";
import { commitImport } from "@/lib/import/commit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const fd = await req.formData();
  const file = fd.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File required" }, { status: 400 });
  }

  const mode = String(fd.get("mode") || "preview");
  const accountId = String(fd.get("accountId") || "");
  let presetName = String(fd.get("preset") || "generic");
  const amountSign = (String(fd.get("amountSign") || "as-is") as
    | "as-is"
    | "invert"
    | "expenses-negative");

  const buf = Buffer.from(await file.arrayBuffer());
  const text = buf.toString("utf8");
  const format = detectFormat(file.name, text);

  let rows: ParsedRow[] = [];
  let headers: string[] | undefined;

  if (format === "csv") {
    const firstLine = text.split(/\r?\n/)[0] ?? "";
    headers = firstLine.split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
    if (!fd.get("preset")) {
      presetName = guessPreset(headers);
    }
    const preset = loadPreset(presetName);
    rows = parseCsvContent(text, preset, amountSign);
  } else if (format === "ofx") {
    rows = parseOfxContent(text);
  } else if (format === "pdf") {
    rows = await parsePdfBuffer(buf);
  } else {
    rows = parseTextStatement(text);
  }

  if (amountSign === "invert" && format !== "csv") {
    rows = rows.map((r) => ({ ...r, amountCents: -r.amountCents }));
  }

  if (mode === "preview") {
    return NextResponse.json({
      format,
      preset: presetName,
      headers,
      presets: listPresetNames(),
      rows: rows.map((r) => ({
        date: r.date.toISOString().slice(0, 10),
        payee: r.payee,
        memo: r.memo,
        amountCents: r.amountCents,
        externalId: r.externalId,
      })),
    });
  }

  if (!accountId) {
    return NextResponse.json({ error: "accountId required" }, { status: 400 });
  }

  const batch = await commitImport({
    accountId,
    filename: file.name,
    format,
    rows,
  });

  return NextResponse.json(batch);
}