export interface RouteVisitRecord {
  routeSlug: string;
  world: string;
  respondedAt: string; // ISO
  response?: { code: string; email?: string };
  optedIntoFutureSignals: boolean;
}

export interface VisitorMemory {
  getVisit(routeSlug: string): RouteVisitRecord | undefined;
  recordVisit(record: RouteVisitRecord): void;
  getAllVisits(): RouteVisitRecord[];
}
