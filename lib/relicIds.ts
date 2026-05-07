export function isValidRelicId(id: string): boolean {
  const match = id.trim().toUpperCase().match(/^GNS1\.KWZR\.RT54\.AE(\d{2})$/);
  if (!match) return false;
  const n = parseInt(match[1], 10);
  return n >= 1 && n <= 25;
}

export interface ClaimPayload {
  relicId: string;
  email?: string;
  claimedAt: string;
  transmission: "001";
}

export function storeClaim(payload: ClaimPayload): void {
  if (typeof window === "undefined") return;
  const existing = getClaims();
  existing.push(payload);
  localStorage.setItem("54caravan_claims", JSON.stringify(existing));
}

export function getClaims(): ClaimPayload[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem("54caravan_claims") ?? "[]");
  } catch {
    return [];
  }
}
