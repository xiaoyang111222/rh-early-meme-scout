import { createFileRoute } from "@tanstack/react-router";
import { ScoutApp } from "@/components/scout/scout-app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <ScoutApp />;
}
