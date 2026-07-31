export function centsToDollars(cents: number): number {
  return cents / 100;
}

export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function formatMoney(
  cents: number,
  currency = "USD",
  locale = "en-US"
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(centsToDollars(cents));
}

/** True for labels like "Sale" / "Payment" that must not be treated as amounts. */
export function isMoneyLabel(raw: string): boolean {
  const s = String(raw ?? "").trim();
  if (!s) return false;
  return /^[A-Za-z][A-Za-z\s/&.'-]*$/.test(s);
}

/** Parse a money string like "-1,234.56", "$12.00", "USD 12.00", or "(42.99)" into cents. */
export function parseMoneyToCents(raw: string): number {
  let s = String(raw ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[\u2212\u2013\u2014]/g, "-")
    .trim();
  if (!s || isMoneyLabel(s)) return 0;

  // Accounting negatives: (1,234.56)
  const paren = /^\((.+)\)$/.exec(s);
  const negativeParen = Boolean(paren);
  if (paren) s = paren[1].trim();

  // CR/DR prefixes some banks use
  let creditHint = false;
  let debitHint = false;
  if (/^(cr|credit)\b/i.test(s)) {
    creditHint = true;
    s = s.replace(/^(cr|credit)\b\s*/i, "");
  } else if (/^(dr|debit)\b/i.test(s)) {
    debitHint = true;
    s = s.replace(/^(dr|debit)\b\s*/i, "");
  }

  // Keep digits, separators, signs; drop currency letters/symbols
  let cleaned = s.replace(/[^0-9.,+\-]/g, "").trim();
  if (!cleaned || cleaned === "-" || cleaned === "+" || cleaned === "." || cleaned === ",") {
    return 0;
  }

  // European-style 1.234,56 → 1234.56
  if (/^\d{1,3}(\.\d{3})+,\d{2}$/.test(cleaned)) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(cleaned)) {
    // US thousands: 1,234.56 → 1234.56
    cleaned = cleaned.replace(/,/g, "");
  } else if (/^\d+,\d{2}$/.test(cleaned) && !cleaned.includes(".")) {
    // Bare European cents: 12,34 → 12.34
    cleaned = cleaned.replace(",", ".");
  } else {
    cleaned = cleaned.replace(/,/g, "");
  }

  const n = Number.parseFloat(cleaned);
  if (Number.isNaN(n)) return 0;
  let cents = dollarsToCents(n);
  if (negativeParen || debitHint) cents = -Math.abs(cents);
  else if (creditHint) cents = Math.abs(cents);
  return cents;
}

/** True if the string looks like a money amount (not "Sale" / category text). */
export function looksLikeMoney(raw: string): boolean {
  const s = String(raw ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[\u2212\u2013\u2014]/g, "-")
    .trim();
  if (!s || isMoneyLabel(s) || !/\d/.test(s)) return false;
  return parseMoneyToCents(s) !== 0 || /^[+-]?\$?\(?0+([.,]0+)?\)?$/.test(s.replace(/\s/g, ""));
}

export function formatMonthKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function monthBounds(month: string): { start: Date; end: Date } {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
  return { start, end };
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}