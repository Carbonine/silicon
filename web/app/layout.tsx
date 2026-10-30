import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ThemeSync } from "@/components/ThemeSync";
import "./globals.css";

export const metadata: Metadata = { title: "Silicon", icons: { icon: "/favicon.svg" } };

// Runs before first paint, so the page never flashes the wrong theme.
const themeScript = `try{var t=localStorage.getItem("theme");if(t==="system")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";if(t)document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href="/css/theme.css" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body><ThemeSync />{children}</body>
    </html>
  );
}
