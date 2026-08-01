import Link from "next/link";
import { ChatDrawer } from "@/components/ChatDrawer";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/import", label: "Import" },
  { href: "/accounts", label: "Accounts" },
  { href: "/transactions", label: "Transactions" },
  { href: "/spending", label: "Spending" },
  { href: "/tracker", label: "Tracker" },
  { href: "/budgets", label: "Budgets" },
  { href: "/goals", label: "Goals" },
  { href: "/categorize", label: "Categorize" },
  { href: "/categories", label: "Categories" },
  { href: "/settings", label: "Settings" },
];

export function AppNav({ pathname = "/" }: { pathname?: string }) {
  return (
    <>
      <header className="topnav">
        <Link href="/" className="brand">
          HomeLedger
        </Link>
        <nav className="nav-links" aria-label="Primary">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={pathname === l.href ? "active" : undefined}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <form action="/api/auth/logout" method="post">
          <button className="btn secondary" type="submit">
            Lock
          </button>
        </form>
      </header>
      <ChatDrawer />
    </>
  );
}
