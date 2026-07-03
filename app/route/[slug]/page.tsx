import { notFound } from "next/navigation";
import RouteExperience from "@/components/RouteExperience";
import { getAllRouteSlugs, getRouteBySlug } from "@/lib/routes/registry";

export const dynamicParams = false;

export function generateStaticParams() {
  return getAllRouteSlugs().map((slug) => ({ slug }));
}

export default async function RoutePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const route = getRouteBySlug(slug);

  if (!route || route.status !== "active") {
    notFound();
  }

  return <RouteExperience route={route} />;
}
