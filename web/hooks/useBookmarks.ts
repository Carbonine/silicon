"use client";

import { useLocalStorage } from "./useLocalStorage";
import type { Bookmark } from "@/lib/bookmarks";
import { KEYS } from "@/lib/storage";

export const useBookmarks = () => useLocalStorage<Bookmark[]>(KEYS.bookmarks, []);
