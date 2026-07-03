"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { AudioArtifactConfig, ScreenTheme } from "@/lib/routes/types";
import { toCssVars } from "@/lib/routes/theme";

interface Props {
  config: AudioArtifactConfig;
  contextualText?: string[];
  theme: ScreenTheme;
  onAdvance: () => void;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function AudioArtifact({ config, contextualText, theme, onAdvance }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [advanceReady, setAdvanceReady] = useState(false);

  const reveal = useCallback(() => setAdvanceReady(true), []);

  /* Dev fallback + audio event wiring */
  useEffect(() => {
    if (!config.revealAfter.fallbackMs) return;
    const timer = setTimeout(reveal, config.revealAfter.fallbackMs);
    return () => clearTimeout(timer);
  }, [reveal, config.revealAfter.fallbackMs]);

  const handlePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      audio.play().catch(() => {});
    }
  };

  const handleBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    const bar = progressBarRef.current;
    if (!audio || !bar || !isFinite(duration) || duration === 0) return;
    const rect = bar.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    audio.currentTime = ratio * duration;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <section
      className="relative flex flex-col items-center justify-center min-h-dvh px-6 py-12 text-center overflow-hidden"
      style={{ ...toCssVars("artifact", theme), background: "var(--route-artifact-bg)" }}
    >
      {/* Atmospheric glow */}
      <div
        className="absolute inset-x-0 bottom-0 h-1/2 pointer-events-none animate-ember-pulse"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 100%, rgba(58,112,110,0.18) 0%, transparent 70%)",
        }}
      />

      {/* Animated grain layer */}
      <div
        className="absolute inset-0 pointer-events-none animate-grain-shift"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.06'/%3E%3C/svg%3E\")",
          opacity: 0.3,
        }}
      />

      {/* Optional threshold image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/caravan-threshold.png"
        alt=""
        aria-hidden
        className="absolute inset-0 w-full h-full object-cover opacity-[0.06] pointer-events-none select-none"
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center animate-fade-in w-full max-w-sm">
        <p
          className="text-[11px] tracking-[0.4em] uppercase"
          style={{ color: "var(--route-artifact-primary)" }}
        >
          {config.eyebrow}
        </p>
        <h2
          className="mt-3 text-4xl md:text-5xl font-light leading-tight"
          style={{ color: "var(--route-artifact-highlight)" }}
        >
          {config.titleLines.map((line, i) => (
            <span key={i}>
              {line}
              {i < config.titleLines.length - 1 && <br />}
            </span>
          ))}
        </h2>

        {/* Audio player */}
        <div className="mt-10 w-full">
          <audio
            ref={audioRef}
            src={config.src}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => { setPlaying(false); if (config.revealAfter.onEnded) reveal(); }}
            onError={reveal}
            onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
            onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
            preload="metadata"
          />

          <div className="flex items-center gap-4">
            {/* Play/pause button */}
            <button
              onClick={handlePlayPause}
              aria-label={playing ? "Pause" : "Play"}
              className="flex-shrink-0 w-9 h-9 flex items-center justify-center border rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-1"
              style={{
                borderColor: "var(--route-artifact-primary)",
                color: "var(--route-artifact-primary)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--route-artifact-primary)";
                e.currentTarget.style.color = "var(--route-artifact-bg)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "var(--route-artifact-primary)";
              }}
            >
              {playing ? (
                <svg width="12" height="14" viewBox="0 0 12 14" fill="currentColor" aria-hidden>
                  <rect x="0" y="0" width="4" height="14" />
                  <rect x="8" y="0" width="4" height="14" />
                </svg>
              ) : (
                <svg width="12" height="14" viewBox="0 0 12 14" fill="currentColor" aria-hidden>
                  <path d="M0 0 L12 7 L0 14 Z" />
                </svg>
              )}
            </button>

            {/* Progress bar */}
            <div
              ref={progressBarRef}
              onClick={handleBarClick}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress)}
              className="flex-1 h-px relative cursor-pointer group"
              style={{ background: "rgba(58,112,110,0.25)" }}
            >
              <div
                className="absolute top-0 left-0 h-full transition-all duration-100"
                style={{
                  width: `${progress}%`,
                  background: "var(--route-artifact-primary)",
                }}
              />
              {/* Scrubber dot */}
              <div
                className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                style={{
                  left: `${progress}%`,
                  transform: `translateX(-50%) translateY(-50%)`,
                  background: "var(--route-artifact-primary)",
                }}
              />
            </div>

            {/* Time */}
            <span
              className="flex-shrink-0 text-[11px] tabular-nums"
              style={{ color: "var(--route-artifact-primary)", opacity: 0.7 }}
            >
              {formatTime(currentTime)}&nbsp;/&nbsp;{formatTime(duration)}
            </span>
          </div>
        </div>

        {/* Contextual text */}
        {contextualText && contextualText.length > 0 && (
          <div className="mt-8 flex flex-col gap-1">
            {contextualText.map((line, i) => (
              <p
                key={i}
                className="text-sm italic"
                style={{ color: "rgba(223,208,180,0.65)" }}
              >
                {line}
              </p>
            ))}
          </div>
        )}

        {/* Advance button — revealed after audio ends or fallback timer */}
        <div
          className="mt-12 transition-opacity duration-700"
          style={{ opacity: advanceReady ? 1 : 0, pointerEvents: advanceReady ? "auto" : "none" }}
          aria-hidden={!advanceReady}
        >
          <button
            onClick={onAdvance}
            className="px-10 py-3 text-xs tracking-[0.35em] uppercase border transition-all duration-300 focus:outline-none focus-visible:ring-2"
            style={{
              borderColor: "var(--route-artifact-accent)",
              color: "var(--route-artifact-accent)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--route-artifact-accent)";
              e.currentTarget.style.color = "var(--route-artifact-bg)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--route-artifact-accent)";
            }}
            tabIndex={advanceReady ? 0 : -1}
          >
            {config.advanceLabel}
          </button>
        </div>
      </div>
    </section>
  );
}
