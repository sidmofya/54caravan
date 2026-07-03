import type { RouteConfig } from "./types";

const transmission001: RouteConfig = {
  slug: "transmission-001",
  routeNumber: "001",
  world: "kwa-zuri",
  status: "active",
  threshold: {
    titleLines: ["The 54", "Caravan"],
    sublines: ["you made it further than most", "the route is open again"],
    ctaLabel: "Enter",
    footerLines: ["Not your ordinary caravan", "54caravan.com"],
    watermarkImage: "/images/caravan-card-front.png",
  },
  artifact: {
    type: "audio",
    src: "/audio/transmission-001.mp3",
    eyebrow: "Transmission 001",
    titleLines: ["The Return", "Begins"],
    revealAfter: { onEnded: true, fallbackMs: 20_000 },
    advanceLabel: "Claim Your Place",
  },
  contextualText: ["This is the first signal.", "Listen with your body."],
  participation: {
    kind: "code",
    codePattern: "^GNS1\\.KWZR\\.RT54\\.AE(\\d{2})$",
    codeRange: [1, 25],
    codePlaceholder: "GNS1.KWZR.RT54.AE01",
    collectEmail: true,
    offerFutureSignalsOptIn: false,
    prompt: "Every relic carries a route signature.",
    invalidMessage: "Route signature not recognized.",
    ctaLabel: "Keep the Signal",
    successHeadline: "the route remembers you",
    successStatus: "Route Status: Active",
  },
  theme: {
    threshold: {
      bg: "#0d0c09",
      parchment: "#e8dbc4",
      charcoal: "#6b6055",
      accent: "#b8904a",
    },
    artifact: {
      bg: "#070c10",
      primary: "#3a706e",
      secondary: "#151a30",
      accent: "#c4622a",
      highlight: "#b08840",
    },
    participation: {
      bg: "#0a0905",
      gold: "#c8a050",
      parchment: "#dfd0b4",
      ember: "#c45030",
      teal: "#3a7a6a",
    },
  },
};

export default transmission001;
