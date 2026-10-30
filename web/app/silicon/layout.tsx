import type { ReactNode } from "react";

export default function SiliconLayout({ children }: { children: ReactNode }) {
  return <><link rel="stylesheet" href="/css/pages.css" />{children}</>;
}
