"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type DeckId = "A" | "B";
export type EQBand = "eqLow" | "eqMid" | "eqHigh";

export interface DeckState {
  playing: boolean;
  currentTime: number;
  duration: number;
  volume: number; // 0..1
  eqLow: number; // dB
  eqMid: number; // dB
  eqHigh: number; // dB
  playbackRate: number;
}

const DEFAULT_DECK_STATE: DeckState = {
  playing: false,
  currentTime: 0,
  duration: 0,
  volume: 1,
  eqLow: 0,
  eqMid: 0,
  eqHigh: 0,
  playbackRate: 1,
};

interface DeckNodes {
  low: BiquadFilterNode;
  mid: BiquadFilterNode;
  high: BiquadFilterNode;
  gain: GainNode;
}

interface AudioElementWithPitchControl extends HTMLAudioElement {
  mozPreservesPitch?: boolean;
  webkitPreservesPitch?: boolean;
}

function equalPowerGains(crossfader: number): { a: number; b: number } {
  const x = Math.min(1, Math.max(0, crossfader));
  return { a: Math.cos(x * 0.5 * Math.PI), b: Math.sin(x * 0.5 * Math.PI) };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const other = (deckId: DeckId): DeckId => (deckId === "A" ? "B" : "A");

export function useMixerEngine() {
  const audioElRefs = useRef<Record<DeckId, HTMLAudioElement | null>>({ A: null, B: null });
  const ctxRef = useRef<AudioContext | null>(null);
  const nodesRef = useRef<Partial<Record<DeckId, DeckNodes>>>({});
  const bpmRef = useRef<Partial<Record<DeckId, number | undefined>>>({});
  const crossfaderRef = useRef(0.5);

  const [deckA, setDeckA] = useState<DeckState>(DEFAULT_DECK_STATE);
  const [deckB, setDeckB] = useState<DeckState>(DEFAULT_DECK_STATE);
  const [crossfader, setCrossfaderValue] = useState(0.5);

  const deckStateRef = useRef<Record<DeckId, DeckState>>({ A: DEFAULT_DECK_STATE, B: DEFAULT_DECK_STATE });

  const setDeckState = useCallback((deckId: DeckId, patch: Partial<DeckState>) => {
    deckStateRef.current[deckId] = { ...deckStateRef.current[deckId], ...patch };
    (deckId === "A" ? setDeckA : setDeckB)((prev) => ({ ...prev, ...patch }));
  }, []);

  const registerDeckRef = useCallback((deckId: DeckId, el: HTMLAudioElement | null) => {
    audioElRefs.current[deckId] = el;
  }, []);

  const registerBpm = useCallback((deckId: DeckId, bpm: number | undefined) => {
    bpmRef.current[deckId] = bpm;
  }, []);

  const applyDeckGain = useCallback((deckId: DeckId) => {
    const nodes = nodesRef.current[deckId];
    const ctx = ctxRef.current;
    if (!nodes || !ctx) return;
    const { a, b } = equalPowerGains(crossfaderRef.current);
    const crossfadeGain = deckId === "A" ? a : b;
    const volume = deckStateRef.current[deckId].volume;
    nodes.gain.gain.setTargetAtTime(volume * crossfadeGain, ctx.currentTime, 0.01);
  }, []);

  const ensureBuilt = useCallback((deckId: DeckId): DeckNodes | null => {
    const el = audioElRefs.current[deckId];
    if (!el) return null;

    if (!ctxRef.current) {
      ctxRef.current = new AudioContext();
    }
    const ctx = ctxRef.current;

    let nodes = nodesRef.current[deckId];
    if (!nodes) {
      const source = ctx.createMediaElementSource(el);

      const low = ctx.createBiquadFilter();
      low.type = "lowshelf";
      low.frequency.value = 320;

      const mid = ctx.createBiquadFilter();
      mid.type = "peaking";
      mid.frequency.value = 1000;
      mid.Q.value = 0.8;

      const high = ctx.createBiquadFilter();
      high.type = "highshelf";
      high.frequency.value = 3200;

      const gain = ctx.createGain();

      source.connect(low);
      low.connect(mid);
      mid.connect(high);
      high.connect(gain);
      gain.connect(ctx.destination);

      nodes = { low, mid, high, gain };
      nodesRef.current[deckId] = nodes;
    }
    return nodes;
  }, []);

  const play = useCallback((deckId: DeckId) => {
    const el = audioElRefs.current[deckId];
    if (!el) return;
    ensureBuilt(deckId);
    const ctx = ctxRef.current;
    if (ctx && ctx.state !== "running") {
      ctx.resume().catch(() => {});
    }
    applyDeckGain(deckId);
    el.play().catch(() => {});
  }, [ensureBuilt, applyDeckGain]);

  const pause = useCallback((deckId: DeckId) => {
    audioElRefs.current[deckId]?.pause();
  }, []);

  const seek = useCallback((deckId: DeckId, time: number) => {
    const el = audioElRefs.current[deckId];
    if (el && isFinite(time)) el.currentTime = time;
  }, []);

  const setVolume = useCallback((deckId: DeckId, volume: number) => {
    setDeckState(deckId, { volume });
    applyDeckGain(deckId);
  }, [setDeckState, applyDeckGain]);

  const setEQBand = useCallback((deckId: DeckId, band: EQBand, value: number) => {
    setDeckState(deckId, { [band]: value } as Partial<DeckState>);
    const nodes = nodesRef.current[deckId];
    const ctx = ctxRef.current;
    if (!nodes || !ctx) return;
    const node = band === "eqLow" ? nodes.low : band === "eqMid" ? nodes.mid : nodes.high;
    node.gain.setTargetAtTime(value, ctx.currentTime, 0.01);
  }, [setDeckState]);

  const setPlaybackRate = useCallback((deckId: DeckId, rate: number) => {
    const el = audioElRefs.current[deckId] as AudioElementWithPitchControl | null;
    if (el) {
      el.playbackRate = rate;
      el.preservesPitch = false;
      el.mozPreservesPitch = false;
      el.webkitPreservesPitch = false;
    }
    setDeckState(deckId, { playbackRate: rate });
  }, [setDeckState]);

  const syncDeck = useCallback((deckId: DeckId) => {
    const otherId = other(deckId);
    const thisBpm = bpmRef.current[deckId];
    const otherBpm = bpmRef.current[otherId];
    if (!thisBpm || !otherBpm) return;
    const otherRate = deckStateRef.current[otherId].playbackRate;
    const targetRate = clamp((otherBpm * otherRate) / thisBpm, 0.5, 2.0);
    setPlaybackRate(deckId, targetRate);
  }, [setPlaybackRate]);

  const setCrossfader = useCallback((value: number) => {
    crossfaderRef.current = value;
    setCrossfaderValue(value);
    applyDeckGain("A");
    applyDeckGain("B");
  }, [applyDeckGain]);

  const onTimeUpdate = useCallback((deckId: DeckId, time: number) => {
    setDeckState(deckId, { currentTime: time });
  }, [setDeckState]);

  const onLoadedMetadata = useCallback((deckId: DeckId, duration: number) => {
    setDeckState(deckId, { duration });
  }, [setDeckState]);

  const onPlayStateChange = useCallback((deckId: DeckId, playing: boolean) => {
    setDeckState(deckId, { playing });
  }, [setDeckState]);

  useEffect(() => {
    return () => {
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") {
        ctx.close().catch(() => {});
      }
    };
  }, []);

  return {
    deckA,
    deckB,
    crossfader,
    actions: {
      registerDeckRef,
      registerBpm,
      play,
      pause,
      seek,
      setVolume,
      setEQBand,
      setPlaybackRate,
      syncDeck,
      setCrossfader,
      onTimeUpdate,
      onLoadedMetadata,
      onPlayStateChange,
    },
  };
}
