import type { RouteConfig } from "./types";

export function validateParticipationCode(route: RouteConfig, rawInput: string): boolean {
  const participation = route.participation;
  if (!participation || participation.kind !== "code") return false;

  const id = rawInput.trim().toUpperCase();
  const match = id.match(new RegExp(participation.codePattern));
  if (!match) return false;

  if (participation.codeRange) {
    const n = parseInt(match[1], 10);
    const [min, max] = participation.codeRange;
    return n >= min && n <= max;
  }

  return true;
}
