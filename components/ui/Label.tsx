import React from "react";
import { cn } from "./cn";

type LabelTone = "muted" | "ink" | "accent" | "inherit";

const tones: Record<LabelTone, string> = {
  muted: "text-muted",
  ink: "text-ink",
  accent: "text-accent",
  inherit: "",
};

export interface LabelProps extends React.HTMLAttributes<HTMLElement> {
  as?: "span" | "p" | "div" | "label";
  htmlFor?: string;
  tone?: LabelTone;
}

/** Small monospace caption, e.g. "WHAT'S NEXT". */
export function Label({ as = "span", tone = "muted", className, ...rest }: LabelProps) {
  // Cast keeps `htmlFor` typing simple across the allowed tags.
  const Tag = as as React.ElementType;
  return (
    <Tag
      className={cn("font-mono text-[11px] font-medium uppercase tracking-[0.16em]", tones[tone], className)}
      {...rest}
    />
  );
}
