import RouteExperience from "@/components/RouteExperience";
import { getDefaultRoute } from "@/lib/routes/registry";

export default function Home() {
  return <RouteExperience route={getDefaultRoute()} />;
}
