"use client";

// Shared top nav across every page. Fetches account status so the right side
// reflects the connected email (link to /account) or offers a Log in / Sign up
// button when signed out. usePathname drives the active link.

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { fetchAccount } from "@/lib/cloud";

const LINKS = [
  { href: "/studio", label: "Studio" },
  { href: "/library", label: "Library" },
];

export default function SiteNav() {
  const pathname = usePathname();
  const [user, setUser] = useState(null);

  useEffect(() => {
    let alive = true;
    fetchAccount()
      .then((j) => alive && setUser(j.user))
      .catch(() => {});
    return () => {
      alive = false;
    };
    // Re-check on navigation so signing in/out elsewhere reflects here.
  }, [pathname]);

  const isActive = (href) => pathname === href || (href !== "/" && pathname.startsWith(href));

  return (
    <header className="nav">
      <div className="nav-inner">
        <a className="nav-brand" href="/">
          Mirra
        </a>
        <nav className="nav-links" aria-label="Site">
          {LINKS.map((l) => (
            <a
              key={l.href}
              className="nav-link"
              href={l.href}
              aria-current={isActive(l.href) ? "page" : undefined}
            >
              {l.label}
            </a>
          ))}
        </nav>
        {user ? (
          <a className="nav-account" href="/account" title="Manage your account">
            <span className="nav-account-dot" aria-hidden="true" />
            {user.email}
          </a>
        ) : (
          <a className="btn-primary nav-auth-btn" href="/account">
            Log in / Sign up
          </a>
        )}
      </div>
    </header>
  );
}
