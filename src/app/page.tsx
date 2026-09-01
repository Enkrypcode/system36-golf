import { SimpleTournamentTool } from "@/components/app-client";
import { loadCourseCatalog } from "@/lib/course-catalog";

export default function Home() {
  return <SimpleTournamentTool courses={loadCourseCatalog()} />;
}
