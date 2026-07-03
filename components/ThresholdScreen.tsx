"use client";

import type { ThresholdConfig, ScreenTheme } from "@/lib/routes/types";
import { toCssVars } from "@/lib/routes/theme";

interface Props {
  config: ThresholdConfig;
  theme: ScreenTheme;
  onEnter: () => void;
}

export default function ThresholdScreen({ config, theme, onEnter }: Props) {
  return (
    <section
      className="relative flex flex-col items-center justify-between min-h-dvh px-6 py-10 text-center"
      style={{ ...toCssVars("threshold", theme), background: "var(--route-threshold-bg)" }}
    >
      {/* Optional card image as a low-opacity watermark */}
      {config.watermarkImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={config.watermarkImage}
          alt=""
          aria-hidden
          className="absolute inset-0 w-full h-full object-cover opacity-[0.04] pointer-events-none select-none"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        />
      )}

      {/* Top spacer */}
      <div className="flex-1" />

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center animate-fade-in">
        <h1
          className="text-5xl md:text-7xl font-light tracking-[0.35em] uppercase"
          style={{ color: "var(--route-threshold-parchment)" }}
        >
          {config.titleLines.map((line, i) => (
            <span key={i}>
              {line}
              {i < config.titleLines.length - 1 && <br />}
            </span>
          ))}
        </h1>

        <div className="mt-8 flex flex-col gap-1">
          {config.sublines.map((line, i) => (
            <p
              key={i}
              className="text-sm tracking-[0.15em]"
              style={{ color: "var(--route-threshold-charcoal)" }}
            >
              {line}
            </p>
          ))}
        </div>

        <button
          onClick={onEnter}
          className="mt-12 px-10 py-3 text-xs tracking-[0.35em] uppercase border transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          style={{
            borderColor: "var(--route-threshold-accent)",
            color: "var(--route-threshold-accent)",
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget;
            el.style.background = "var(--route-threshold-accent)";
            el.style.color = "var(--route-threshold-bg)";
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget;
            el.style.background = "transparent";
            el.style.color = "var(--route-threshold-accent)";
          }}
        >
          {config.ctaLabel}
        </button>
      </div>

      {/* Bottom spacer */}
      <div className="flex-1" />

      {/* Footer */}
      {config.footerLines && config.footerLines.length > 0 && (
        <footer className="relative z-10 flex flex-col items-center gap-1 pb-2">
          {config.footerLines.map((line, i) => (
            <p
              key={i}
              className={i === 0 ? "text-[10px] tracking-[0.4em] uppercase" : "text-[10px] tracking-[0.25em]"}
              style={{
                color: "var(--route-threshold-charcoal)",
                opacity: i === 0 ? 1 : 0.5,
              }}
            >
              {line}
            </p>
          ))}
        </footer>
      )}
    </section>
  );
}
