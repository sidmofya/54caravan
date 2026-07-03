"use client";

import type { AudioRoute } from "@/lib/console/eligibility";
import type { DeckId, DeckState, EQBand } from "@/lib/console/useMixerEngine";

interface Props {
  route: AudioRoute;
  deckId: DeckId;
  state: DeckState;
  canSync: boolean;
  onAudioRef: (el: HTMLAudioElement | null) => void;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (volume: number) => void;
  onEQChange: (band: EQBand, value: number) => void;
  onRateChange: (rate: number) => void;
  onSync: () => void;
  onTimeUpdate: (time: number) => void;
  onLoadedMetadata: (duration: number) => void;
  onPlayStateChange: (playing: boolean) => void;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function Deck({
  route,
  deckId,
  state,
  canSync,
  onAudioRef,
  onPlayPause,
  onSeek,
  onVolumeChange,
  onEQChange,
  onRateChange,
  onSync,
  onTimeUpdate,
  onLoadedMetadata,
  onPlayStateChange,
}: Props) {
  const { artifact } = route;
  const progress = state.duration > 0 ? (state.currentTime / state.duration) * 100 : 0;

  const handleBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isFinite(state.duration) || state.duration === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    onSeek(ratio * state.duration);
  };

  return (
    <div
      className="flex flex-col items-center gap-4 w-full max-w-xs px-4 py-6 border rounded"
      style={{ borderColor: "rgba(200,160,80,0.25)" }}
    >
      <audio
        ref={onAudioRef}
        src={artifact.src}
        preload="auto"
        onPlay={() => onPlayStateChange(true)}
        onPause={() => onPlayStateChange(false)}
        onTimeUpdate={(e) => onTimeUpdate(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => onLoadedMetadata(e.currentTarget.duration)}
      />

      <div className="text-center">
        <p
          className="text-[10px] tracking-[0.35em] uppercase"
          style={{ color: "var(--route-console-teal)" }}
        >
          Deck {deckId}
        </p>
        <p
          className="mt-1 text-sm tracking-[0.1em]"
          style={{ color: "var(--route-console-parchment)" }}
        >
          {artifact.eyebrow}
        </p>
      </div>

      <div className="flex items-center gap-3 w-full">
        <button
          onClick={onPlayPause}
          aria-label={state.playing ? "Pause" : "Play"}
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center border rounded-full"
          style={{ borderColor: "var(--route-console-gold)", color: "var(--route-console-gold)" }}
        >
          {state.playing ? (
            <svg width="10" height="12" viewBox="0 0 12 14" fill="currentColor" aria-hidden>
              <rect x="0" y="0" width="4" height="14" />
              <rect x="8" y="0" width="4" height="14" />
            </svg>
          ) : (
            <svg width="10" height="12" viewBox="0 0 12 14" fill="currentColor" aria-hidden>
              <path d="M0 0 L12 7 L0 14 Z" />
            </svg>
          )}
        </button>

        <div
          onClick={handleBarClick}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
          className="flex-1 h-px relative cursor-pointer"
          style={{ background: "rgba(58,112,110,0.25)" }}
        >
          <div
            className="absolute top-0 left-0 h-full"
            style={{ width: `${progress}%`, background: "var(--route-console-teal)" }}
          />
        </div>

        <span
          className="flex-shrink-0 text-[10px] tabular-nums"
          style={{ color: "var(--route-console-teal)", opacity: 0.7 }}
        >
          {formatTime(state.currentTime)}&nbsp;/&nbsp;{formatTime(state.duration)}
        </span>
      </div>

      <div className="w-full flex flex-col gap-2">
        <label className="flex items-center justify-between text-[10px] tracking-[0.2em] uppercase" style={{ color: "var(--route-console-charcoal)" }}>
          Volume
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={state.volume}
            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
            className="ml-3 flex-1"
          />
        </label>

        {(["eqLow", "eqMid", "eqHigh"] as const).map((band) => (
          <label
            key={band}
            className="flex items-center justify-between text-[10px] tracking-[0.2em] uppercase"
            style={{ color: "var(--route-console-charcoal)" }}
          >
            {band === "eqLow" ? "Low" : band === "eqMid" ? "Mid" : "High"}
            <input
              type="range"
              min={-24}
              max={12}
              step={1}
              value={state[band]}
              onChange={(e) => onEQChange(band, parseFloat(e.target.value))}
              className="ml-3 flex-1"
            />
          </label>
        ))}

        <label className="flex items-center justify-between text-[10px] tracking-[0.2em] uppercase" style={{ color: "var(--route-console-charcoal)" }}>
          Tempo
          <input
            type="range"
            min={0.92}
            max={1.08}
            step={0.001}
            value={state.playbackRate}
            onChange={(e) => onRateChange(parseFloat(e.target.value))}
            className="ml-3 flex-1"
          />
        </label>

        <button
          onClick={onSync}
          disabled={!canSync}
          className="mt-1 text-[10px] tracking-[0.3em] uppercase border py-2 disabled:opacity-30"
          style={{ borderColor: "var(--route-console-ember)", color: "var(--route-console-ember)" }}
        >
          Sync to other deck
        </button>
      </div>
    </div>
  );
}
