import type { Metadata } from "next";
import { GamePlayer } from "@/components/pages/GamePlayer";

export const metadata: Metadata = { title: "Game" };

// One template for every game: the id picks the game from the live catalog.
export default async function PlayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <GamePlayer id={decodeURIComponent(id)} />;
}
