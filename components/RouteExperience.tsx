"use client";

import { useState, useCallback } from "react";
import type { RouteConfig } from "@/lib/routes/types";
import ThresholdScreen from "@/components/ThresholdScreen";
import AudioArtifact from "@/components/AudioArtifact";
import ParticipationScreen from "@/components/ParticipationScreen";

interface Props {
  route: RouteConfig;
}

type Screen = "threshold" | "artifact" | "participation";

export default function RouteExperience({ route }: Props) {
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
        <ThresholdScreen
          config={route.threshold}
          theme={route.theme.threshold}
          onEnter={() => transition("artifact")}
        />
      )}
      {screen === "artifact" && route.artifact.type === "audio" && (
        <AudioArtifact
          config={route.artifact}
          contextualText={route.contextualText}
          theme={route.theme.artifact}
          onAdvance={() => transition("participation")}
        />
      )}
      {screen === "participation" && route.participation && (
        <ParticipationScreen route={route} />
      )}
    </div>
  );
}
