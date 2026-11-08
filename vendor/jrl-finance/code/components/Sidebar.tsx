"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Overview", short: "Overview", icon: (
      <><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/>
        <rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></>
    ) },
  { href: "/month", label: "This month's figures", short: "Month", icon: (
      <><path d="M4 5h16M4 12h16M4 19h16"/></>
    ) },
  { href: "/targets", label: "Targets", short: "Targets", icon: (
      <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.4"/></>
    ) },
  { href: "/spending", label: "Spending", short: "Spending", icon: (
      <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/></>
    ) },
  { href: "/sora", label: "Sora", short: "Sora", icon: (
      <><path d="M12 4v2M8 8v8M12 7v10M16 9v6M4 12h2M18 12h2"/></>
    ) },
];

export default function Sidebar() {
  const path = usePathname();
  return (
    <aside className="side">
      <Link href="/" className="logo" aria-label="JRL">
        <svg viewBox="0 0 100 100" role="img">
          <path d="M18 0H100V82L82 100H0V18Z" fill="var(--ink)" />
          <g fill="var(--knock)">
            <path d="M26 28H36V62Q36 72 26 72H18V63H24Q26 63 26 61Z" />
            <path fillRule="evenodd" d="M40 28H51A11 11 0 0 1 51 50H50V72H40ZM50 35V43H51A4 4 0 0 0 51 35Z" />
            <path d="M49 50H59L63 72H53Z" />
            <path d="M66 28H76V62H82V72H66Z" />
          </g>
        </svg>
      </Link>
      <nav>
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={path === l.href ? "on" : undefined}>
            <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {l.icon}
            </svg>
            <span className="lbl">{l.label}</span>
            <span className="lbl-short">{l.short ?? l.label}</span>
          </Link>
        ))}
      </nav>
      <div className="spacer" />
      <div className="help">
        <b>One form a month</b>
        <span>Add what went in and out — everything else works itself out.</span>
      </div>
    </aside>
  );
}
