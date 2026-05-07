"use client";

import { useState } from "react";
import { isValidRelicId, storeClaim } from "@/lib/relicIds";

type Status = "idle" | "invalid" | "claimed";

export default function ClaimScreen() {
  const [relicId, setRelicId] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isValidRelicId(relicId)) {
      storeClaim({
        relicId: relicId.trim().toUpperCase(),
        email: email.trim() || undefined,
        claimedAt: new Date().toISOString(),
        transmission: "001",
      });
      setStatus("claimed");
    } else {
      setStatus("invalid");
    }
  };

  return (
    <section
      className="relative flex flex-col items-center justify-center min-h-dvh px-6 py-12 text-center"
      style={{ background: "var(--s3-bg)" }}
    >
      <div className="relative z-10 flex flex-col items-center animate-fade-in w-full max-w-xs">

        {status !== "claimed" ? (
          <>
            <p
              className="text-[13px] tracking-[0.2em] leading-relaxed"
              style={{ color: "rgba(223,208,180,0.55)" }}
            >
              Every relic carries<br />a route signature.
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
                  value={relicId}
                  onChange={(e) => {
                    setRelicId(e.target.value);
                    if (status === "invalid") setStatus("idle");
                  }}
                  placeholder="GNS1.KWZR.RT54.AE01"
                  aria-label="Relic ID"
                  className="w-full bg-transparent border-0 border-b pb-2 text-sm tracking-[0.15em] uppercase placeholder:normal-case placeholder:tracking-normal outline-none transition-colors duration-200 focus:border-b"
                  style={{
                    borderBottomColor: status === "invalid"
                      ? "var(--s3-ember)"
                      : "rgba(200,160,80,0.3)",
                    color: "var(--s3-parchment)",
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
                    color: "var(--s3-parchment)",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderBottomColor = "rgba(200,160,80,0.7)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderBottomColor = "rgba(200,160,80,0.3)";
                  }}
                />
              </div>

              {status === "invalid" && (
                <p
                  className="text-xs tracking-[0.1em] animate-fade-in"
                  style={{ color: "var(--s3-ember)" }}
                  role="alert"
                >
                  Route signature not recognized.
                </p>
              )}

              <button
                type="submit"
                className="mt-3 w-full py-3 text-xs tracking-[0.35em] uppercase border transition-all duration-300 focus:outline-none focus-visible:ring-2"
                style={{
                  borderColor: "var(--s3-gold)",
                  color: "var(--s3-gold)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--s3-gold)";
                  e.currentTarget.style.color = "var(--s3-bg)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "var(--s3-gold)";
                }}
              >
                Keep the Signal
              </button>
            </form>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 animate-fade-in">
            <p
              className="text-xl font-light tracking-[0.1em]"
              style={{ color: "var(--s3-parchment)" }}
            >
              the route remembers you
            </p>
            <p
              className="text-[11px] tracking-[0.35em] uppercase"
              style={{ color: "var(--s3-teal)" }}
              role="status"
            >
              Route Status: Active
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
