"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { signOut } from "@/app/login/actions";

/** 아직 만들지 않은 화면은 메뉴에 넣지 않는다 (정기점검은 다음 단계) */
const LINKS = [
  { href: "/", label: "대시보드", match: (p: string) => p === "/" },
  { href: "/issues", label: "이슈", match: (p: string) => p.startsWith("/issues") },
  {
    href: "/admin/sites",
    label: "관리",
    match: (p: string) => p.startsWith("/admin"),
    adminOnly: true,
  },
];

export function TopNav({ name, isAdmin }: { name: string; isAdmin: boolean }) {
  const pathname = usePathname();

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link className="brand" href="/">
          RPA 이슈관리
        </Link>

        <nav className="topnav">
          {LINKS.filter((l) => !l.adminOnly || isAdmin).map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={l.match(pathname) ? "active" : undefined}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="topuser">
          <span>
            <strong>{name}</strong>
            {isAdmin && " · 관리자"}
          </span>
          <form action={signOut}>
            <button type="submit" className="linkbtn">
              로그아웃
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
