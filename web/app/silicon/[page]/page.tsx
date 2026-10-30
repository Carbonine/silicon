import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ComponentType } from "react";
import { BookmarksPage } from "@/components/pages/BookmarksPage";
import { ErrorPage } from "@/components/pages/ErrorPage";
import { GamesPage } from "@/components/pages/GamesPage";
import { HistoryPage } from "@/components/pages/HistoryPage";
import { NewTabPage } from "@/components/pages/NewTabPage";
import { SettingsPage } from "@/components/pages/SettingsPage";

const PAGES: Record<string, { title: string; Page: ComponentType }> = {
  newtab: { title: "New Tab", Page: NewTabPage },
  games: { title: "Games", Page: GamesPage },
  settings: { title: "Settings", Page: SettingsPage },
  bookmarks: { title: "Bookmarks", Page: BookmarksPage },
  history: { title: "History", Page: HistoryPage },
  error: { title: "Can't reach this site", Page: ErrorPage },
};

export const dynamicParams = false;
export const generateStaticParams = () => Object.keys(PAGES).map((page) => ({ page }));

export async function generateMetadata({ params }: { params: Promise<{ page: string }> }): Promise<Metadata> {
  return { title: PAGES[(await params).page]?.title };
}

export default async function SiliconPage({ params }: { params: Promise<{ page: string }> }) {
  const entry = PAGES[(await params).page];
  if (!entry) notFound();
  return <entry.Page />;
}
