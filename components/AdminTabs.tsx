"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/sites", label: "사이트 · 과제" },
  { href: "/admin/types", label: "이슈 유형" },
  { href: "/admin/users", label: "사용자" },
];

export function AdminTabs() {
  const pathname = usePathname();

  return (
    <div className="btn-row" style={{ marginBottom: 16 }}>
      {TABS.map((t) => {
        const active = pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={active ? "btn btn-primary" : "btn"}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
