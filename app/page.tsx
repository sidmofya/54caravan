"use client";

import { useState, useCallback } from "react";
import ThresholdScreen from "@/components/ThresholdScreen";
import TransmissionScreen from "@/components/TransmissionScreen";
import ClaimScreen from "@/components/ClaimScreen";

type Screen = "threshold" | "transmission" | "claim";

export default function Home() {
  const [screen, setScreen] = useState<Screen>("threshold");
  const [transitioning, setTransitioning] = useState(false);

  const transition = useCallback((next: Screen) => {
    setTransitioning(true);
    setTimeout(() => {
      setScreen(next);
      setTransitioning(false);
    }, 600);
  }, []);

  return (
    <div
      className="min-h-dvh transition-opacity duration-[600ms]"
      style={{ opacity: transitioning ? 0 : 1 }}
    >
      {screen === "threshold" && (
        <ThresholdScreen onEnter={() => transition("transmission")} />
      )}
      {screen === "transmission" && (
        <TransmissionScreen onClaim={() => transition("claim")} />
      )}
      {screen === "claim" && <ClaimScreen />}
    </div>
  );
}
