export type RouteStatus = "draft" | "active" | "expired";

export interface RouteTiming {
  publishAt?: string; // ISO timestamp; route treated as not-yet-live before this
  expiresAt?: string; // ISO timestamp; route treated as expired after this
}

export interface AudioArtifactConfig {
  type: "audio";
  src: string;
  eyebrow: string;
  titleLines: string[];
  revealAfter: { onEnded: boolean; fallbackMs: number };
  advanceLabel: string;
  /** Authored tempo in BPM, enabling tempo-sync in the console. Not detected. */
  bpm?: number;
}
// Future artifact kinds (story, image, object, voice note) join this union
// as additional variants — no restructuring required.
export type ArtifactConfig = AudioArtifactConfig;

export interface CodeParticipationConfig {
  kind: "code";
  /** Regex source string (no flags) matched against the trimmed, uppercased input. */
  codePattern: string;
  codeRange?: [min: number, max: number];
  codePlaceholder: string;
  collectEmail: boolean;
  offerFutureSignalsOptIn?: boolean;
  prompt: string;
  invalidMessage: string;
  ctaLabel: string;
  successHeadline: string;
  successStatus: string;
}
// Future participation kinds (response, signal opt-in) join this union
// as additional variants.
export type ParticipationConfig = CodeParticipationConfig;

export interface ThresholdConfig {
  titleLines: string[];
  sublines: string[];
  ctaLabel: string;
  footerLines?: string[];
  watermarkImage?: string;
}

export interface DeeperLink {
  label: string;
  href: string;
}

export interface ScreenTheme {
  bg: string;
  [token: string]: string;
}

export interface RouteTheme {
  threshold: ScreenTheme;
  artifact: ScreenTheme;
  participation: ScreenTheme;
}

export interface RouteConfig {
  slug: string;
  routeNumber: string;
  world: string;
  status: RouteStatus;
  timing?: RouteTiming;
  threshold: ThresholdConfig;
  artifact: ArtifactConfig;
  contextualText?: string[];
  participation?: ParticipationConfig;
  theme: RouteTheme;
  deeperLinks?: DeeperLink[];
}
