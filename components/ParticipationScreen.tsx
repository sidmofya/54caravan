"use client";

import { useState } from "react";
import Link from "next/link";
import type { RouteConfig } from "@/lib/routes/types";
import { toCssVars } from "@/lib/routes/theme";
import { validateParticipationCode } from "@/lib/routes/validateCode";
import { visitorMemory } from "@/lib/memory/localStorageMemory";
import { hasEnoughSignalsForConsole } from "@/lib/console/eligibility";

interface Props {
  route: RouteConfig;
}

type Status = "idle" | "invalid" | "claimed";

export default function ParticipationScreen({ route }: Props) {
  const config = route.participation;
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>(() =>
    visitorMemory.getVisit(route.slug) ? "claimed" : "idle"
  );

  if (!config) return null;
  const theme = route.theme.participation;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateParticipationCode(route, code)) {
      visitorMemory.recordVisit({
        routeSlug: route.slug,
        world: route.world,
        respondedAt: new Date().toISOString(),
        response: { code: code.trim().toUpperCase(), email: email.trim() || undefined },
        optedIntoFutureSignals: config.offerFutureSignalsOptIn ? false : Boolean(email.trim()),
      });
      setStatus("claimed");
    } else {
      setStatus("invalid");
    }
  };

  return (
    <section
      className="relative flex flex-col items-center justify-center min-h-dvh px-6 py-12 text-center"
      style={{ ...toCssVars("participation", theme), background: "var(--route-participation-bg)" }}
    >
      <div className="relative z-10 flex flex-col items-center animate-fade-in w-full max-w-xs">

        {status !== "claimed" ? (
          <>
            <p
              className="text-[13px] tracking-[0.2em] leading-relaxed"
              style={{ color: "rgba(223,208,180,0.55)" }}
            >
              {config.prompt}
            </p>

            <form
              onSubmit={handleSubmit}
              className="mt-10 w-full flex flex-col gap-5"
              noValidate
            >
              <div className="flex flex-col gap-1 text-left">
                <input
                  type="text"
                  required
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value);
                    if (status === "invalid") setStatus("idle");
                  }}
                  placeholder={config.codePlaceholder}
                  aria-label="Route code"
                  className="w-full bg-transparent border-0 border-b pb-2 text-sm tracking-[0.15em] uppercase placeholder:normal-case placeholder:tracking-normal outline-none transition-colors duration-200 focus:border-b"
                  style={{
                    borderBottomColor: status === "invalid"
                      ? "var(--route-participation-ember)"
                      : "rgba(200,160,80,0.3)",
                    color: "var(--route-participation-parchment)",
                  }}
                  onFocus={(e) => {
                    if (status !== "invalid") {
                      e.currentTarget.style.borderBottomColor = "rgba(200,160,80,0.7)";
                    }
                  }}
                  onBlur={(e) => {
                    if (status !== "invalid") {
                      e.currentTarget.style.borderBottomColor = "rgba(200,160,80,0.3)";
                    }
                  }}
                />
              </div>

              {config.collectEmail && (
                <div className="flex flex-col gap-1 text-left">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    aria-label="Email (optional)"
                    className="w-full bg-transparent border-0 border-b pb-2 text-sm tracking-wide placeholder:text-sm outline-none transition-colors duration-200"
                    style={{
                      borderBottomColor: "rgba(200,160,80,0.3)",
                      color: "var(--route-participation-parchment)",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderBottomColor = "rgba(200,160,80,0.7)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderBottomColor = "rgba(200,160,80,0.3)";
                    }}
                  />
                </div>
              )}

              {status === "invalid" && (
                <p
                  className="text-xs tracking-[0.1em] animate-fade-in"
                  style={{ color: "var(--route-participation-ember)" }}
                  role="alert"
                >
                  {config.invalidMessage}
                </p>
              )}

              <button
                type="submit"
                className="mt-3 w-full py-3 text-xs tracking-[0.35em] uppercase border transition-all duration-300 focus:outline-none focus-visible:ring-2"
                style={{
                  borderColor: "var(--route-participation-gold)",
                  color: "var(--route-participation-gold)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--route-participation-gold)";
                  e.currentTarget.style.color = "var(--route-participation-bg)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "var(--route-participation-gold)";
                }}
              >
                {config.ctaLabel}
              </button>
            </form>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 animate-fade-in">
            <p
              className="text-xl font-light tracking-[0.1em]"
              style={{ color: "var(--route-participation-parchment)" }}
            >
              {config.successHeadline}
            </p>
            <p
              className="text-[11px] tracking-[0.35em] uppercase"
              style={{ color: "var(--route-participation-teal)" }}
              role="status"
            >
              {config.successStatus}
            </p>
            {hasEnoughSignalsForConsole() && (
              <Link
                href="/console/"
                className="mt-4 text-[10px] tracking-[0.3em] uppercase"
                style={{ color: "var(--route-participation-gold)" }}
              >
                enter your console
              </Link>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
