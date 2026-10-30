import React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "./cn";

export type StatusTone = "ok" | "danger" | "warn" | "neutral" | "info" | "accent";

const tones: Record<StatusTone, string> = {
  ok: "bg-ok/10 text-ok",
  danger: "bg-danger/10 text-danger",
  warn: "bg-warn/15 text-warn",
  neutral: "bg-ink/5 text-muted",
  info: "bg-ink/[0.07] text-ink",
  accent: "bg-accent text-white",
};

export interface StatusPillProps {
  tone?: StatusTone;
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
}

/** Small rounded status badge. Always pairs color with an icon and text. */
export function StatusPill({ tone = "neutral", icon: Icon, children, className }: StatusPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider",
        tones[tone],
        className
      )}
    >
      {Icon && <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />}
      <span>{children}</span>
    </span>
  );
}
