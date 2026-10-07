"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/trucks", label: "Trucks" },
  { href: "/operating-expenses", label: "Operating expenses" },
  { href: "/loads", label: "Loads" },
  { href: "/fuel", label: "Fuel" },
  { href: "/tolls", label: "Tolls" },
  { href: "/statements", label: "Statements" },
  { href: "/imports", label: "Imports" },
  { href: "/settings", label: "Settings" },
] as const;

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1" aria-label="Main">
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
              "inline-flex h-10 items-center rounded-md px-3 text-sm font-medium no-underline transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]",
              active
                ? "bg-[var(--color-accent)] text-white"
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
