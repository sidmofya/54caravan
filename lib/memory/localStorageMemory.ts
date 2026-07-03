import type { RouteVisitRecord, VisitorMemory } from "./types";

const VISITS_KEY = "54caravan_visits";
const LEGACY_CLAIMS_KEY = "54caravan_claims";

interface LegacyClaimPayload {
  relicId: string;
  email?: string;
  claimedAt: string;
  transmission: "001";
}

function readVisits(): RouteVisitRecord[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(VISITS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function writeVisits(visits: RouteVisitRecord[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(VISITS_KEY, JSON.stringify(visits));
}

function migrateLegacyClaims(): void {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(VISITS_KEY) !== null) return;

  const raw = localStorage.getItem(LEGACY_CLAIMS_KEY);
  if (!raw) return;

  try {
    const legacyClaims: LegacyClaimPayload[] = JSON.parse(raw);
    const migrated: RouteVisitRecord[] = legacyClaims.map((claim) => ({
      routeSlug: "transmission-001",
      world: "kwa-zuri",
      respondedAt: claim.claimedAt,
      response: { code: claim.relicId, email: claim.email },
      optedIntoFutureSignals: Boolean(claim.email),
    }));
    writeVisits(migrated);
  } catch {
    // Legacy data unreadable — nothing to migrate.
  }
}

export const visitorMemory: VisitorMemory = {
  getVisit(routeSlug: string): RouteVisitRecord | undefined {
    migrateLegacyClaims();
    return readVisits().find((v) => v.routeSlug === routeSlug);
  },

  recordVisit(record: RouteVisitRecord): void {
    migrateLegacyClaims();
    const visits = readVisits();
    visits.push(record);
    writeVisits(visits);
  },

  getAllVisits(): RouteVisitRecord[] {
    migrateLegacyClaims();
    return readVisits();
  },
};
