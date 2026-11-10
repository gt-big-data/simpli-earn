"use client";

import type { ReactNode } from "react";
import { rovingIndex } from "@/lib/keyboard";

/** The id of a `tabs`-mode Segmented's tab for `value`, for its panel's aria-labelledby */
export const tabId = (id: string, value: string) => `${id}-${value}`;

/**
 * A row of mutually exclusive options (the chat history's "This call / All chats" style). `sm` is
 * the compact, icon-sized version; an option without text needs an `ariaLabel`.
 *
 * Plain, it's a group of pressed buttons. With `tabs` it's a tablist controlling `panelId`: only the
 * selected tab is in the tab order, and ArrowLeft/ArrowRight/Home/End move to a tab and select it.
 */
export default function Segmented<T extends string>({ label, options, value, onChange, size = "md", tabs }: {
  label: string; options: { value: T; label: ReactNode; ariaLabel?: string }[]; value: T;
  onChange: (value: T) => void; size?: "md" | "sm"; tabs?: { id: string; panelId: string };
}) {
  return (
    <div role={tabs ? "tablist" : "group"} aria-label={label} onKeyDown={tabs ? e => {
      const next = rovingIndex(e.key, options.findIndex(option => option.value === value), options.length);
      if (next === null) return;
      e.preventDefault();
      onChange(options[next].value);
      (e.currentTarget.children[next] as HTMLElement).focus();
    } : undefined}
      className={`grid shrink-0 auto-cols-fr grid-flow-col gap-0.5 border border-white/8 bg-pill p-0.5 text-xs font-medium ${
        size === "sm" ? "rounded-md" : "rounded-lg"}`}>
      {options.map(option => {
        const selected = value === option.value;
        return (
          <button key={option.value} type="button" aria-label={option.ariaLabel} title={option.ariaLabel}
            {...(tabs ? { role: "tab", id: tabId(tabs.id, option.value), "aria-selected": selected, "aria-controls": tabs.panelId,
              tabIndex: selected ? 0 : -1 } : { "aria-pressed": selected })}
            onClick={() => onChange(option.value)}
            className={`grid min-w-0 cursor-pointer place-items-center truncate transition-colors ${
              size === "sm" ? "rounded-[4px] px-1 py-0.5" : "rounded-md px-2 py-1"} ${selected
              ? "bg-accent text-brand" : "text-muted-foreground hover:text-foreground"}`}>
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
