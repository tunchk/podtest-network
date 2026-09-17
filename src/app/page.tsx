import { listLatestPublishedEpisodes } from "@/lib/community/episodes";
import { HomeLanding } from "@/components/home/home-landing";

export default async function HomePage() {
  const latest = await listLatestPublishedEpisodes(6);
  return <HomeLanding episodes={latest} />;
}
