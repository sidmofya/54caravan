"use client";

import { useEffect, useRef } from "react";

export default function HeroPortal() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = 0.65;
    }
  }, []);

  return (
    <section className="relative flex-1 flex items-end justify-start min-h-screen overflow-hidden">
      {/* Background: video if present, otherwise gradient */}
      <div className="absolute inset-0 animate-slow-drift">
        <video
          ref={videoRef}
          className="w-full h-full object-cover opacity-40"
          autoPlay
          muted
          loop
          playsInline
          poster="/images/hero-poster.jpg"
          aria-hidden
        >
          <source src="/video/hero.mp4" type="video/mp4" />
        </video>
        {/* Fallback gradient shown when no video */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#1a1005] via-[#0a0905] to-[#0e0b06]" />
      </div>

      {/* Vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_20%,rgba(0,0,0,0.7)_100%)]" />

      {/* Bottom gradient for text legibility */}
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[#0a0905] via-[#0a0905]/60 to-transparent" />

      {/* Content */}
      <div className="relative z-10 px-6 pb-16 md:px-12 md:pb-24 max-w-xl animate-fade-in">
        <p className="text-xs tracking-[0.35em] uppercase text-[var(--accent)] mb-4">
          Est. Route 54
        </p>
        <h1 className="text-5xl md:text-7xl font-light leading-[1.05] tracking-tight text-[var(--foreground)] mb-6">
          The&nbsp;54<br />Caravan
        </h1>
        <p className="text-base md:text-lg text-[var(--foreground)]/60 leading-relaxed max-w-sm mb-10">
          A rolling archive. A moving signal.
          <br />
          Somewhere between here and gone.
        </p>
        <a
          href="/route"
          className="inline-block border border-[var(--accent)]/50 text-[var(--accent)] text-xs tracking-[0.3em] uppercase px-7 py-3 hover:bg-[var(--accent)] hover:text-[var(--background)] transition-all duration-400"
        >
          Enter the Route
        </a>
      </div>
    </section>
  );
}
