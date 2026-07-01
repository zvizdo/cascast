/* Header — sticky translucent appbar: brand + nav + units/theme toggles + CTA.
   Ported from app/shared.jsx Header/Brand (nav rebuilt on next/link + usePathname). */
"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icons } from "@/components/icons/icons";
import { ThemeToggle } from "./ThemeToggle";
import { UnitsToggle } from "./UnitsToggle";

export function Header() {
  const pathname = usePathname();
  const showCta = pathname !== "/";

  const navLink = (href: string, label: string) => {
    const active = pathname === href;
    return (
      <Link
        href={href}
        className={"nav-link" + (active ? " is-active" : "")}
        aria-current={active ? "page" : undefined}
      >
        {label}
      </Link>
    );
  };

  return (
    <header className="appbar">
      <div className="appbar-in">
        <Link href="/" className="brand" aria-label="Cascast home">
          <span className="brand-mark">
            <Icons.mountain size={22} sw={1.7} />
          </span>
          <span className="brand-word">Cascast</span>
        </Link>
        <nav className="nav">
          {navLink("/", "Search")}
          {navLink("/your-mountains", "Your Mountains")}
          {navLink("/about", "About")}
        </nav>
        <div className="appbar-right">
          {/* Inline units + theme — hidden below 900px via CSS */}
          <span className="display-inline-cluster">
            <UnitsToggle />
            <ThemeToggle />
          </span>
          {/* Display menu — visible below 900px via CSS, hidden above */}
          <details className="display-menu">
            <summary className="display-menu-summary btn btn-ghost btn-sm">Display</summary>
            <div className="display-menu-panel">
              <UnitsToggle />
              <ThemeToggle />
            </div>
          </details>
          {showCta && (
            <Link href="/" className="btn btn-primary">
              <Icons.pin size={16} /> Pin a Peak
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
