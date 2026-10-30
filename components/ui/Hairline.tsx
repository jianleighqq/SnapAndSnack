import React from "react";
import { cn } from "./cn";

export interface HairlineProps {
  orientation?: "horizontal" | "vertical";
  /** Strong = near-ink connector line; default = faint divider. */
  strong?: boolean;
  className?: string;
}

/** 1px line used as a divider or as a connector between a label/pill and a headline. */
export function Hairline({ orientation = "horizontal", strong = false, className }: HairlineProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        strong ? "bg-ink/80" : "bg-ink/15",
        className
      )}
    />
  );
}
