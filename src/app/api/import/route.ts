import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import {
  detectFormat,
  extractCsvTable,
  parseCsvContent,
  parseOfxContent,
  parsePdfBuffer,
  parseTextStatement,
  sampleAmountColumn,
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
  const presetFromForm = fd.get("preset");
  let presetName = String(presetFromForm || "generic");
  const amountSign = (String(fd.get("amountSign") || "as-is") as
    | "as-is"
    | "invert"
    | "expenses-negative");

  const buf = Buffer.from(await file.arrayBuffer());
  // Handle UTF-16 LE exports some banks still produce
  let text = buf.toString("utf8");
  if (buf[0] === 0xff && buf[1] === 0xfe) {
    text = buf.toString("utf16le");
  }

  const format = detectFormat(file.name, text);

  let rows: ParsedRow[] = [];
  let headers: string[] | undefined;
  let preambleSkipped = 0;
  let warning: string | undefined;

  if (format === "csv") {
    const table = extractCsvTable(text);
    headers = table.headers;
    preambleSkipped = table.preambleSkipped;
    // Auto-detect unless the client explicitly chose a non-default after we told them
    if (!presetFromForm || presetFromForm === "generic" || presetFromForm === "chase") {
      const guessed = guessPreset(headers);
      // Prefer guess when form still says chase/generic and headers look like credit
      if (!presetFromForm || guessed !== "generic") {
        presetName = guessed;
      }
      if (presetFromForm === "chase" && guessed === "chase-credit") {
        presetName = "chase-credit";
      }
    }
    const preset = loadPreset(presetName);
    rows = parseCsvContent(text, preset, amountSign);
    if (rows.length === 0) {
      warning = `No rows matched preset “${presetName}”. Detected columns: ${headers.join(", ") || "(none)"}. Try chase-credit or generic, or check Amount Sign.`;
    } else if (rows.every((r) => r.amountCents === 0)) {
      const samples = sampleAmountColumn(text, preset.amountColumn);
      warning = `Dates/payees parsed but all amounts are $0. Amount column samples: ${
        samples.length ? samples.map((s) => JSON.stringify(s)).join(", ") : "(none)"
      }. Detected columns: ${headers?.join(", ") || "(none)"}.`;
    }
  } else if (format === "ofx") {
    rows = parseOfxContent(text);
  } else if (format === "pdf") {
    rows = await parsePdfBuffer(buf);
    if (rows.length === 0) {
      warning =
        "PDF parsed but no dated amount lines were found. Prefer downloading CSV from Chase (Account → Download activity).";
    }
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
      preambleSkipped,
      warning,
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
  if (rows.length === 0) {
    return NextResponse.json(
      { error: warning || "No transactions to import" },
      { status: 400 }
    );
  }

  const batch = await commitImport({
    accountId,
    filename: file.name,
    format,
    rows,
  });

  return NextResponse.json(batch);
}