"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/management", label: "Management" },
  { href: "/ins-outs", label: "Ins and Outs" },
  { href: "/sheet-compare", label: "Sheet vs Vektor" },
  { href: "/trucks", label: "Trucks" },
  { href: "/fee-settings", label: "Fee settings" },
  { href: "/operating-expenses", label: "Legacy expenses" },
  { href: "/loads", label: "Loads" },
  { href: "/fuel", label: "Fuel" },
  { href: "/tolls", label: "Tolls" },
  { href: "/statements", label: "Statements" },
  { href: "/issues", label: "Issues" },
  { href: "/imports", label: "Imports" },
  { href: "/integrations", label: "Integrations" },
  { href: "/settings", label: "Settings" },
] as const;

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1.5" aria-label="Main">
      {NAV.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "pressable inline-flex h-10 items-center rounded-[var(--radius-control)] px-3 text-sm font-medium no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]",
              active
                ? "bg-[var(--color-accent)] text-[var(--color-on-accent)]"
                : "text-[var(--color-fg)] hover:bg-[var(--color-muted)]",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
