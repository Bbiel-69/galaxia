import { createFileRoute } from "@tanstack/react-router";
import { GalaxyExperience } from "@/components/galaxy/galaxy-experience";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <GalaxyExperience />;
}
