import type { AudioArtifactConfig, RouteConfig } from "@/lib/routes/types";
import { getRouteBySlug } from "@/lib/routes/registry";
import { visitorMemory } from "@/lib/memory/localStorageMemory";

export type AudioRoute = RouteConfig & { artifact: AudioArtifactConfig };

function hasAudioArtifact(route: RouteConfig): route is AudioRoute {
  return route.artifact.type === "audio";
}

export function getEligibleConsoleRoutes(): AudioRoute[] {
  const seen = new Set<string>();
  const routes: AudioRoute[] = [];

  for (const visit of visitorMemory.getAllVisits()) {
    if (seen.has(visit.routeSlug)) continue;
    const route = getRouteBySlug(visit.routeSlug);
    if (route && hasAudioArtifact(route)) {
      seen.add(visit.routeSlug);
      routes.push(route);
    }
  }

  return routes;
}

export function hasEnoughSignalsForConsole(): boolean {
  return getEligibleConsoleRoutes().length >= 2;
}
