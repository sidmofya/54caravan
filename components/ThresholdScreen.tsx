"use client";

interface Props {
  onEnter: () => void;
}

export default function ThresholdScreen({ onEnter }: Props) {
  return (
    <section
      className="relative flex flex-col items-center justify-between min-h-dvh px-6 py-10 text-center"
      style={{ background: "var(--s1-bg)" }}
    >
      {/* Optional card image as a low-opacity watermark */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/caravan-card-front.png"
        alt=""
        aria-hidden
        className="absolute inset-0 w-full h-full object-cover opacity-[0.04] pointer-events-none select-none"
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
      />

      {/* Top spacer */}
      <div className="flex-1" />

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center animate-fade-in">
        <h1
          className="text-5xl md:text-7xl font-light tracking-[0.35em] uppercase"
          style={{ color: "var(--s1-parchment)" }}
        >
          The&nbsp;54
          <br />
          Caravan
        </h1>

        <div className="mt-8 flex flex-col gap-1">
          <p
            className="text-sm tracking-[0.15em]"
            style={{ color: "var(--s1-charcoal)" }}
          >
            you made it further than most
          </p>
          <p
            className="text-sm tracking-[0.15em]"
            style={{ color: "var(--s1-charcoal)" }}
          >
            the route is open again
          </p>
        </div>

        <button
          onClick={onEnter}
          className="mt-12 px-10 py-3 text-xs tracking-[0.35em] uppercase border transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          style={{
            borderColor: "var(--s1-bronze)",
            color: "var(--s1-bronze)",
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget;
            el.style.background = "var(--s1-bronze)";
            el.style.color = "var(--s1-bg)";
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget;
            el.style.background = "transparent";
            el.style.color = "var(--s1-bronze)";
          }}
        >
          Enter
        </button>
      </div>

      {/* Bottom spacer */}
      <div className="flex-1" />

      {/* Footer */}
      <footer className="relative z-10 flex flex-col items-center gap-1 pb-2">
        <p
          className="text-[10px] tracking-[0.4em] uppercase"
          style={{ color: "var(--s1-charcoal)" }}
        >
          Not your ordinary caravan
        </p>
        <p
          className="text-[10px] tracking-[0.25em]"
          style={{ color: "var(--s1-charcoal)", opacity: 0.5 }}
        >
          54caravan.com
        </p>
      </footer>
    </section>
  );
}
