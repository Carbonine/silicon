"use client";

import { Dialog } from "./Dialog";
import type { PanicKey } from "@/lib/types";

export const keyName = (c: PanicKey, joiner = "+"): string => [c.ctrl && "Ctrl", c.alt && "Alt", c.shift && "Shift", c.meta && "Cmd", c.key.length === 1 ? c.key.toUpperCase() : c.key === " " ? "Space" : c.key].filter(Boolean).join(joiner);

export function ShortcutsDialog({ open, panic, onClose }: { open: boolean; panic: PanicKey | null; onClose(): void }) {
  const groups: [string, [string, string[]][]][] = [
    ["Tabs", [
      ["New tab", ["Ctrl+T", "Alt+T"]],
      ["Close tab", ["Ctrl+W", "Alt+W"]],
      ["Reopen closed tab", ["Ctrl+Shift+T", "Alt+Shift+T"]],
      ["Next tab", ["Ctrl+Tab", "Alt+]"]],
      ["Previous tab", ["Ctrl+Shift+Tab", "Alt+["]],
      ["Go to tab 1 to 8", ["Ctrl+1 to 8", "Alt+1 to 8"]],
      ["Go to the last tab", ["Ctrl+9", "Alt+9"]],
    ]],
    ["Pages", [
      ["Back and forward", ["Alt+Left", "Alt+Right"]],
      ["Go to the address bar", ["Ctrl+L"]],
      ["Reload the page", ["Ctrl+R"]],
      ["Zoom in", ["Ctrl++"]],
      ["Zoom out", ["Ctrl+-"]],
      ["Reset zoom", ["Ctrl+0"]],
      ["Find in page", ["Ctrl+F"]],
      ["Bookmark this page", ["Ctrl+D"]],
      ["Bookmarks", ["Ctrl+Shift+O"]],
      ["Show or hide the bookmarks bar", ["Ctrl+Shift+B"]],
      ["History", ["Ctrl+H"]],
      ["Search in Games, History and Bookmarks", ["/"]],
    ]],
    ["Privacy", [["Panic key", panic ? [keyName(panic)] : ["Not set (Settings, Privacy)"]]]],
  ];
  return (
    <Dialog id="shortcuts-dialog" open={open} onClose={onClose}>
      <h2>Keyboard shortcuts</h2>
      {groups.map(([title, rows]) => (
        <div key={title}>
          <h3>{title}</h3>
          {rows.map(([label, keys]) => (
            <div key={label} className="sc-row">
              <span>{label}</span>
              <span className="sc-keys">{keys.map((k, i) => <span key={k}>{i > 0 && " or "}<kbd>{k}</kbd></span>)}</span>
            </div>
          ))}
        </div>
      ))}
      <p className="sc-note">On Windows and Linux, browsers often keep the Ctrl shortcuts for tabs for themselves. The Alt versions always work.</p>
      <div className="actions"><button type="button" className="primary" onClick={onClose}>Done</button></div>
    </Dialog>
  );
}
