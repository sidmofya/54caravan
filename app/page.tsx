import HeroPortal from "@/components/HeroPortal";
import NavBar from "@/components/NavBar";

export default function Home() {
  return (
    <main className="relative h-full min-h-screen flex flex-col">
      <NavBar />
      <HeroPortal />
    </main>
  );
}
