import transmission001 from "./transmission-001";
import type { RouteConfig } from "./types";

export const routes: RouteConfig[] = [transmission001];

export function getRouteBySlug(slug: string): RouteConfig | undefined {
  return routes.find((r) => r.slug === slug);
}

export function getAllRouteSlugs(): string[] {
  return routes.map((r) => r.slug);
}

export function getDefaultRoute(): RouteConfig {
  return transmission001;
}
