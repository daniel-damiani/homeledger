import { formatMoney } from "@/lib/money";

export function Money({
  cents,
  currency = "USD",
}: {
  cents: number;
  currency?: string;
}) {
  const cls = cents < 0 ? "amount neg" : cents > 0 ? "amount pos" : "amount";
  return <span className={cls}>{formatMoney(cents, currency)}</span>;
}