"use client";

import { useState } from "react";
import Link from "next/link";

const links = [
  { label: "The Route", href: "/route" },
  { label: "Journal", href: "/journal" },
  { label: "Listen", href: "/listen" },
];

export default function NavBar() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="fixed top-0 inset-x-0 z-50 flex items-center justify-between px-6 py-5 mix-blend-normal">
      <Link
        href="/"
        className="text-sm tracking-[0.25em] uppercase text-[var(--accent)] font-semibold"
      >
        54 Caravan
      </Link>

      {/* Desktop links */}
      <ul className="hidden md:flex gap-8">
        {links.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="text-xs tracking-[0.2em] uppercase text-[var(--foreground)]/60 hover:text-[var(--accent)] transition-colors duration-300"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>

      {/* Mobile hamburger */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Toggle menu"
        className="md:hidden flex flex-col gap-[5px] cursor-pointer"
      >
        <span
          className={`block h-px w-6 bg-[var(--foreground)] transition-all duration-300 ${open ? "rotate-45 translate-y-[7px]" : ""}`}
        />
        <span
          className={`block h-px w-6 bg-[var(--foreground)] transition-all duration-300 ${open ? "opacity-0" : ""}`}
        />
        <span
          className={`block h-px w-6 bg-[var(--foreground)] transition-all duration-300 ${open ? "-rotate-45 -translate-y-[7px]" : ""}`}
        />
      </button>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 top-0 bg-[var(--background)]/95 backdrop-blur-sm flex flex-col items-center justify-center gap-10 md:hidden">
          <button
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="absolute top-5 right-6 text-[var(--foreground)]/50 text-2xl"
          >
            ✕
          </button>
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="text-2xl tracking-[0.2em] uppercase text-[var(--foreground)] hover:text-[var(--accent)] transition-colors"
            >
              {l.label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
