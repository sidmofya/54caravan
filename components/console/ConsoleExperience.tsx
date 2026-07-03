"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toCssVars } from "@/lib/routes/theme";
import { CONSOLE_THEME } from "@/lib/console/theme";
import { getEligibleConsoleRoutes, type AudioRoute } from "@/lib/console/eligibility";
import { useMixerEngine } from "@/lib/console/useMixerEngine";
import Deck from "./Deck";
import Crossfader from "./Crossfader";

export default function ConsoleExperience() {
  // Eligibility depends on localStorage, which isn't available during the
  // static prerender — resolve it after mount so the client's first render
  // matches the prerendered HTML, then swap in the real state.
  const [eligibleRoutes, setEligibleRoutes] = useState<AudioRoute[] | null>(null);
  const { deckA, deckB, crossfader, actions } = useMixerEngine();

  useEffect(() => {
    // Reads localStorage, which doesn't exist during the static prerender —
    // this one-time sync after mount is what makes the client's first
    // render match the prerendered HTML (see the null-state return below).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEligibleRoutes(getEligibleConsoleRoutes());
  }, []);

  const routeA = eligibleRoutes?.[0];
  const routeB = eligibleRoutes?.[1];

  useEffect(() => {
    if (routeA) actions.registerBpm("A", routeA.artifact.bpm);
    if (routeB) actions.registerBpm("B", routeB.artifact.bpm);
  }, [routeA, routeB, actions]);

  const themeStyle = { ...toCssVars("console", CONSOLE_THEME), background: "var(--route-console-bg)" };

  if (eligibleRoutes === null) {
    return <section className="min-h-dvh" style={themeStyle} />;
  }

  if (!routeA || !routeB) {
    return (
      <section
        className="relative flex flex-col items-center justify-center min-h-dvh px-6 py-12 text-center gap-4"
        style={themeStyle}
      >
        <p
          className="text-sm tracking-[0.15em]"
          style={{ color: "var(--route-console-parchment)" }}
        >
          not enough signals yet
        </p>
        <p
          className="text-[11px] tracking-[0.2em] max-w-xs"
          style={{ color: "var(--route-console-charcoal)" }}
        >
          come back once you&apos;ve claimed more Transmissions to open your console
        </p>
        <Link
          href="/"
          className="mt-6 text-[10px] tracking-[0.3em] uppercase"
          style={{ color: "var(--route-console-gold)" }}
        >
          Return to the threshold
        </Link>
      </section>
    );
  }

  const canSync = Boolean(routeA.artifact.bpm && routeB.artifact.bpm);

  return (
    <section
      className="relative flex flex-col items-center min-h-dvh px-6 py-12 gap-8"
      style={themeStyle}
    >
      <p
        className="text-[11px] tracking-[0.4em] uppercase"
        style={{ color: "var(--route-console-gold)" }}
      >
        Your Console
      </p>

      <div className="flex flex-col md:flex-row items-center gap-8 w-full justify-center">
        <Deck
          route={routeA}
          deckId="A"
          state={deckA}
          canSync={canSync}
          onAudioRef={(el) => actions.registerDeckRef("A", el)}
          onPlayPause={() => (deckA.playing ? actions.pause("A") : actions.play("A"))}
          onSeek={(t) => actions.seek("A", t)}
          onVolumeChange={(v) => actions.setVolume("A", v)}
          onEQChange={(band, v) => actions.setEQBand("A", band, v)}
          onRateChange={(r) => actions.setPlaybackRate("A", r)}
          onSync={() => actions.syncDeck("A")}
          onTimeUpdate={(t) => actions.onTimeUpdate("A", t)}
          onLoadedMetadata={(d) => actions.onLoadedMetadata("A", d)}
          onPlayStateChange={(p) => actions.onPlayStateChange("A", p)}
        />

        <Crossfader value={crossfader} onChange={actions.setCrossfader} />

        <Deck
          route={routeB}
          deckId="B"
          state={deckB}
          canSync={canSync}
          onAudioRef={(el) => actions.registerDeckRef("B", el)}
          onPlayPause={() => (deckB.playing ? actions.pause("B") : actions.play("B"))}
          onSeek={(t) => actions.seek("B", t)}
          onVolumeChange={(v) => actions.setVolume("B", v)}
          onEQChange={(band, v) => actions.setEQBand("B", band, v)}
          onRateChange={(r) => actions.setPlaybackRate("B", r)}
          onSync={() => actions.syncDeck("B")}
          onTimeUpdate={(t) => actions.onTimeUpdate("B", t)}
          onLoadedMetadata={(d) => actions.onLoadedMetadata("B", d)}
          onPlayStateChange={(p) => actions.onPlayStateChange("B", p)}
        />
      </div>
    </section>
  );
}
